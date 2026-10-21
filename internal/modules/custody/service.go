package custody

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"

	"whoopit-core/internal/modules/inventory"
	"whoopit-core/internal/platform/database"
	"whoopit-core/internal/platform/db"
)

var (
	ErrAssetAlreadyAssigned    = errors.New("asset is already assigned to another employee")
	ErrAssetNotSerialized      = errors.New("only serialized items can be deployed to staff custody")
	ErrAssignmentNotFound      = errors.New("custody assignment not found")
	ErrAssignmentAlreadyClosed = errors.New("custody assignment is already closed and returned")
	ErrEmployeeNotFound        = errors.New("employee user not found")
)

type CheckOutInput struct {
	OrgID              uuid.UUID  `json:"org_id"`
	AssetID            uuid.UUID  `json:"asset_id"`
	EmployeeUserID     uuid.UUID  `json:"employee_user_id"`
	SourceLocationID   uuid.UUID  `json:"source_location_id"`
	ExpectedReturnDate *time.Time `json:"expected_return_date,omitempty"`
	ConditionGrade     string     `json:"condition_grade"`
}

type CheckOutResult struct {
	Assignment db.AssetAssignment    `json:"assignment"`
	Move       *inventory.MoveResult `json:"move,omitempty"`
	Evidence   *db.HandoverEvidence  `json:"evidence,omitempty"`
}

type CheckInInput struct {
	OrgID              uuid.UUID `json:"org_id"`
	AssignmentID       uuid.UUID `json:"assignment_id"`
	ReturnToLocationID uuid.UUID `json:"return_to_location_id"`
	ConditionGrade     string    `json:"condition_grade"`
	Notes              string    `json:"notes,omitempty"`
}

type CheckInResult struct {
	Assignment db.AssetAssignment `json:"assignment"`
	Move       *inventory.MoveResult `json:"move,omitempty"`
}

// AssetCustodyService orchestrates asset check-out, return, and double-entry movement ledger binding.
type AssetCustodyService struct {
	db          *database.TenantDB
	movementSvc *inventory.StockMovementService
	sealer      *SealerClient
}

func NewAssetCustodyService(tdb *database.TenantDB, moveSvc *inventory.StockMovementService) *AssetCustodyService {
	return &AssetCustodyService{
		db:          tdb,
		movementSvc: moveSvc,
		sealer:      NewSealerClient(""),
	}
}

// CheckOut assigns a serialized asset to an employee and automatically moves stock into Virtual/Custody.
func (s *AssetCustodyService) CheckOut(ctx context.Context, input CheckOutInput) (*CheckOutResult, error) {
	if input.ConditionGrade == "" {
		input.ConditionGrade = "A"
	}

	var result CheckOutResult

	err := s.db.WithTenantTx(ctx, input.OrgID, func(q *db.Queries) error {
		// 1. Verify Asset and enforce serialized tracking mode
		item, err := q.GetItemByID(ctx, db.GetItemByIDParams{
			ItemID: input.AssetID,
			OrgID:  input.OrgID,
		})
		if err != nil {
			return err
		}

		trackingStr := fmt.Sprintf("%v", item.TrackingMode)
		if trackingStr != "serialized" {
			return ErrAssetNotSerialized
		}

		// 2. Overlap Guard: Ensure asset is not currently active in custody
		active, err := q.GetActiveAssignmentByAssetID(ctx, db.GetActiveAssignmentByAssetIDParams{
			OrgID:   input.OrgID,
			AssetID: input.AssetID,
		})
		if err == nil && active.AssignmentID != uuid.Nil {
			return ErrAssetAlreadyAssigned
		}
		if err != nil && !errors.Is(err, pgx.ErrNoRows) {
			return err
		}

		// 3. Resolve or Create Virtual Custody Location
		custodyLoc, err := q.GetLocationByCategory(ctx, db.GetLocationByCategoryParams{
			OrgID:    input.OrgID,
			Category: "virtual_custody",
		})
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				// Dynamically seed Virtual Custody location for this tenant
				createdLoc, cErr := q.CreateLocation(ctx, db.CreateLocationParams{
					OrgID:    input.OrgID,
					Name:     "Virtual Staff Custody",
					Category: "virtual_custody",
				})
				if cErr != nil {
					return cErr
				}
				custodyLoc = createdLoc
			} else {
				return err
			}
		}

		// 4. Double-Entry Move: Source Physical Location -> Virtual Custody
		moveQty := pgtype.Numeric{}
		_ = moveQty.Scan("1.0000")

		refCode := fmt.Sprintf("CHECKOUT-%s", input.AssetID.String()[:8])
		move, err := q.CreateStockMove(ctx, db.CreateStockMoveParams{
			OrgID:          input.OrgID,
			ItemID:         input.AssetID,
			FromLocationID: input.SourceLocationID,
			ToLocationID:   custodyLoc.LocationID,
			Quantity:       moveQty,
			MoveType:       "CUSTODY_CHECKOUT",
			ReferenceCode:  pgtype.Text{String: refCode, Valid: true},
			ActorID:        input.EmployeeUserID,
		})
		if err != nil {
			return err
		}
		result.Move = &inventory.MoveResult{Move: move}

		// 5. Insert Active Record into asset_assignments
		var expReturn pgtype.Timestamptz
		if input.ExpectedReturnDate != nil {
			expReturn = pgtype.Timestamptz{Time: *input.ExpectedReturnDate, Valid: true}
		}

		assignment, err := q.CreateAssetAssignment(ctx, db.CreateAssetAssignmentParams{
			OrgID:              input.OrgID,
			AssetID:            input.AssetID,
			AssignedToUserID:   input.EmployeeUserID,
			ExpectedReturnDate: expReturn,
			ConditionGrade:     pgtype.Text{String: input.ConditionGrade, Valid: true},
		})
		if err != nil {
			return err
		}
		result.Assignment = assignment

		// 6. Cryptographic Evidence Handover Sealing
		prevHash := GenesisHash
		latestEv, err := q.GetLatestEvidenceByOrg(ctx, input.OrgID)
		if err == nil && latestEv.RecordHash != "" {
			prevHash = latestEv.RecordHash
		}

		sealResp, err := s.sealer.SealHandover(ctx, HandoverSealRequest{
			OrgID:        input.OrgID.String(),
			AssignmentID: assignment.AssignmentID.String(),
			EmployeeName: "Authorized Employee",
			EmployeeID:   input.EmployeeUserID.String(),
			AssetSKU:     item.Sku,
			AssetName:    item.Name,
			SerialNumber: fmt.Sprintf("%v", item.Attributes),
			Condition:    input.ConditionGrade,
			CheckoutDate: time.Now().Format(time.RFC3339),
			PreviousHash: prevHash,
		})
		if err == nil && sealResp != nil {
			evidence, err := q.CreateHandoverEvidence(ctx, db.CreateHandoverEvidenceParams{
				OrgID:        input.OrgID,
				AssignmentID: assignment.AssignmentID,
				PdfSha256:    sealResp.PdfSha256,
				RecordHash:   sealResp.RecordHash,
				PreviousHash: prevHash,
			})
			if err == nil {
				result.Evidence = &evidence
			}
		}

		return nil
	})

	if err != nil {
		return nil, err
	}

	return &result, nil
}

// CheckIn returns an asset from employee custody back to physical storage.
func (s *AssetCustodyService) CheckIn(ctx context.Context, input CheckInInput) (*CheckInResult, error) {
	if input.ConditionGrade == "" {
		input.ConditionGrade = "A"
	}

	var result CheckInResult

	err := s.db.WithTenantTx(ctx, input.OrgID, func(q *db.Queries) error {
		// 1. Fetch Assignment
		assignment, err := q.GetAssignmentByID(ctx, db.GetAssignmentByIDParams{
			AssignmentID: input.AssignmentID,
			OrgID:        input.OrgID,
		})
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				return ErrAssignmentNotFound
			}
			return err
		}

		if assignment.ReturnedAt.Valid {
			return ErrAssignmentAlreadyClosed
		}

		// 2. Resolve Virtual Custody Location
		custodyLoc, err := q.GetLocationByCategory(ctx, db.GetLocationByCategoryParams{
			OrgID:    input.OrgID,
			Category: "virtual_custody",
		})
		if err != nil {
			return err
		}

		// 3. Double-Entry Move: Virtual Custody -> Return Physical Location
		moveQty := pgtype.Numeric{}
		_ = moveQty.Scan("1.0000")

		refCode := fmt.Sprintf("RETURN-%s", assignment.AssetID.String()[:8])
		move, err := q.CreateStockMove(ctx, db.CreateStockMoveParams{
			OrgID:          input.OrgID,
			ItemID:         assignment.AssetID,
			FromLocationID: custodyLoc.LocationID,
			ToLocationID:   input.ReturnToLocationID,
			Quantity:       moveQty,
			MoveType:       "CUSTODY_RETURN",
			ReferenceCode:  pgtype.Text{String: refCode, Valid: true},
			ActorID:        assignment.AssignedToUserID,
		})
		if err != nil {
			return err
		}
		result.Move = &inventory.MoveResult{Move: move}

		// 4. Mark assignment closed
		closed, err := q.CloseAssetAssignment(ctx, db.CloseAssetAssignmentParams{
			AssignmentID:   input.AssignmentID,
			OrgID:          input.OrgID,
			ConditionGrade: pgtype.Text{String: input.ConditionGrade, Valid: true},
		})
		if err != nil {
			return err
		}
		result.Assignment = closed

		return nil
	})

	if err != nil {
		return nil, err
	}

	return &result, nil
}

// ListEmployeeCustody retrieves all active hardware/assets deployed to a specific worker.
func (s *AssetCustodyService) ListEmployeeCustody(ctx context.Context, orgID, employeeUserID uuid.UUID) ([]db.ListActiveAssignmentsByEmployeeRow, error) {
	var rows []db.ListActiveAssignmentsByEmployeeRow

	err := s.db.WithTenantTx(ctx, orgID, func(q *db.Queries) error {
		res, err := q.ListActiveAssignmentsByEmployee(ctx, db.ListActiveAssignmentsByEmployeeParams{
			OrgID:            orgID,
			AssignedToUserID: employeeUserID,
		})
		if err != nil {
			return err
		}
		rows = res
		return nil
	})

	return rows, err
}

// GetCustodySummary retrieves aggregate asset counts for the organization.
func (s *AssetCustodyService) GetCustodySummary(ctx context.Context, orgID uuid.UUID) (*db.GetCustodySummaryRow, error) {
	var summary db.GetCustodySummaryRow

	err := s.db.WithTenantTx(ctx, orgID, func(q *db.Queries) error {
		res, err := q.GetCustodySummary(ctx, orgID)
		if err != nil {
			return err
		}
		summary = res
		return nil
	})

	return &summary, err
}

type CertificateVerificationResult struct {
	Assignment     db.AssetAssignment  `json:"assignment"`
	Evidence       db.HandoverEvidence `json:"evidence"`
	IsValid        bool                `json:"is_valid"`
	TamperDetected bool                `json:"tamper_detected"`
	ComputedHash   string              `json:"computed_hash"`
	StoredHash     string              `json:"stored_hash"`
}

// GetHandoverCertificate fetches and cryptographically verifies the tamper-evident certificate.
func (s *AssetCustodyService) GetHandoverCertificate(ctx context.Context, orgID, assignmentID uuid.UUID) (*CertificateVerificationResult, error) {
	var res CertificateVerificationResult

	err := s.db.WithTenantTx(ctx, orgID, func(q *db.Queries) error {
		assignment, err := q.GetAssignmentByID(ctx, db.GetAssignmentByIDParams{
			AssignmentID: assignmentID,
			OrgID:        orgID,
		})
		if err != nil {
			return err
		}
		res.Assignment = assignment

		evidence, err := q.GetHandoverEvidenceByAssignmentID(ctx, db.GetHandoverEvidenceByAssignmentIDParams{
			OrgID:        orgID,
			AssignmentID: assignmentID,
		})
		if err != nil {
			return err
		}
		res.Evidence = evidence

		expected := ComputeRecordHash(evidence.PreviousHash, assignment.AssignmentID, evidence.PdfSha256)
		res.ComputedHash = expected
		res.StoredHash = evidence.RecordHash
		res.IsValid = (expected == evidence.RecordHash)
		res.TamperDetected = !res.IsValid

		return nil
	})
	if err != nil {
		return nil, err
	}

	return &res, nil
}
