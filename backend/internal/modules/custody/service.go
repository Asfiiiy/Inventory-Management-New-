package custody

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
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
	ErrInsufficientStoreStock  = errors.New("insufficient available units in IT store for this handover")
)

type AssignmentDetail struct {
	AssignmentID       uuid.UUID       `json:"assignment_id"`
	OrgID              uuid.UUID       `json:"org_id"`
	AssetID            uuid.UUID       `json:"asset_id"`
	AssignedToUserID   uuid.UUID       `json:"assigned_to_user_id"`
	CheckoutDate       time.Time       `json:"checkout_date"`
	ExpectedReturnDate *time.Time      `json:"expected_return_date,omitempty"`
	ReturnedAt         *time.Time      `json:"returned_at,omitempty"`
	ConditionGrade     string          `json:"condition_grade"`
	Quantity           float64         `json:"quantity"`
	EmployeeCode       string          `json:"employee_code"`
	EmployeeName       string          `json:"employee_name"`
	EmployeeDepartment string          `json:"employee_department"`
	EmployeeEmail      string          `json:"employee_email"`
	SerialNumber       string          `json:"serial_number"`
	SignatureData      string          `json:"signature_data"`
	Notes              string          `json:"notes"`
	AssetSku           string          `json:"asset_sku"`
	AssetName          string          `json:"asset_name"`
	AssetAttributes    json.RawMessage `json:"asset_attributes,omitempty"`
}

type CheckOutInput struct {
	OrgID              uuid.UUID  `json:"org_id"`
	AssetID            uuid.UUID  `json:"asset_id"`
	EmployeeUserID     uuid.UUID  `json:"employee_user_id"`
	SourceLocationID   uuid.UUID  `json:"source_location_id"`
	ExpectedReturnDate *time.Time `json:"expected_return_date,omitempty"`
	ConditionGrade     string     `json:"condition_grade"`
	Quantity           float64    `json:"quantity"`
	EmployeeCode       string     `json:"employee_code"`
	EmployeeName       string     `json:"employee_name"`
	EmployeeDepartment string     `json:"employee_department"`
	EmployeeEmail      string     `json:"employee_email"`
	SerialNumber       string     `json:"serial_number"`
	SignatureData      string     `json:"signature_data"`
	Notes              string     `json:"notes"`
}

type CheckOutResult struct {
	Assignment AssignmentDetail       `json:"assignment"`
	Move       *inventory.MoveResult  `json:"move,omitempty"`
	Evidence   *db.HandoverEvidence   `json:"evidence,omitempty"`
}

type CheckInInput struct {
	OrgID              uuid.UUID `json:"org_id"`
	AssignmentID       uuid.UUID `json:"assignment_id"`
	ReturnToLocationID uuid.UUID `json:"return_to_location_id"`
	ConditionGrade     string    `json:"condition_grade"`
	Notes              string    `json:"notes,omitempty"`
	ReturnCondition    string    `json:"return_condition,omitempty"` // "GOOD" or "FAULTY"
	IssueDescription   string    `json:"issue_description,omitempty"`
	VendorName         string    `json:"vendor_name,omitempty"`
}

type CheckInResult struct {
	Assignment AssignmentDetail      `json:"assignment"`
	Move       *inventory.MoveResult `json:"move,omitempty"`
}

type OfficeCustodySummary struct {
	TotalAssets         int64   `json:"total_assets"`
	DeployedToEmployees int64   `json:"deployed_to_employees"`
	RemainingInStorage  int64   `json:"remaining_in_storage"`
	FaultyUnits         float64 `json:"faulty_units"`
	UnderRepairUnits    float64 `json:"under_repair_units"`
	RepairedUnits       float64 `json:"repaired_units"`
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

// CheckOut assigns an IT asset (or multiple units) to an employee with Employee ID & Digital Signature.
func (s *AssetCustodyService) CheckOut(ctx context.Context, input CheckOutInput) (*CheckOutResult, error) {
	if input.ConditionGrade == "" {
		input.ConditionGrade = "A"
	}
	if input.Quantity <= 0 {
		input.Quantity = 1
	}

	var result CheckOutResult

	err := s.db.WithTenantTxRaw(ctx, input.OrgID, func(q *db.Queries, tx pgx.Tx) error {
		// 1. Verify Asset
		item, err := q.GetItemByID(ctx, db.GetItemByIDParams{
			ItemID: input.AssetID,
			OrgID:  input.OrgID,
		})
		if err != nil {
			return err
		}

		// 2. Overlap Guard:
		// Keep strict single-unit guard ONLY for legacy serialized items where serial_number is not differentiated
		if fmt.Sprintf("%v", item.TrackingMode) == "serialized" && strings.TrimSpace(input.SerialNumber) == "" {
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
		} else if strings.TrimSpace(input.SerialNumber) != "" {
			// Ensure the exact same serial number isn't currently checked out
			var exists bool
			_ = tx.QueryRow(ctx, `
				SELECT EXISTS(
					SELECT 1 FROM asset_assignments
					WHERE org_id = $1 AND asset_id = $2 AND LOWER(serial_number) = LOWER($3) AND returned_at IS NULL
				)
			`, input.OrgID, input.AssetID, strings.TrimSpace(input.SerialNumber)).Scan(&exists)
			if exists {
				return ErrAssetAlreadyAssigned
			}
		}

		// Resolve employee metadata from the staff directory (users) when the form leaves fields blank
		empName := strings.TrimSpace(input.EmployeeName)
		empEmail := strings.TrimSpace(input.EmployeeEmail)
		empDept := strings.TrimSpace(input.EmployeeDepartment)
		empCode := strings.TrimSpace(input.EmployeeCode)
		var uName, uEmail, uDept, uCode string
		_ = tx.QueryRow(ctx, `
			SELECT COALESCE(name, 'Employee'), email::text,
			       COALESCE(department, ''), COALESCE(employee_code, '')
			FROM users WHERE user_id = $1 AND org_id = $2
		`, input.EmployeeUserID, input.OrgID).Scan(&uName, &uEmail, &uDept, &uCode)
		if empName == "" {
			empName = uName
		}
		if empEmail == "" {
			empEmail = uEmail
		}
		if empDept == "" {
			empDept = uDept
		}
		if empCode == "" {
			empCode = uCode
		}
		if empCode == "" {
			empCode = "EMP-" + strings.ToUpper(input.EmployeeUserID.String()[:6])
		}

		// 3. Resolve or Create Virtual Custody Location
		custodyLoc, err := q.GetLocationByCategory(ctx, db.GetLocationByCategoryParams{
			OrgID:    input.OrgID,
			Category: "virtual_custody",
		})
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
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
		_ = moveQty.Scan(fmt.Sprintf("%.4f", input.Quantity))

		refCode := fmt.Sprintf("HANDOVER-%s-%s", empCode, item.Sku)
		if len(refCode) > 64 {
			refCode = refCode[:64]
		}
		usageTarget := fmt.Sprintf("%s (%s)", empName, empCode)

		move, err := q.CreateStockMove(ctx, db.CreateStockMoveParams{
			OrgID:          input.OrgID,
			ItemID:         input.AssetID,
			FromLocationID: input.SourceLocationID,
			ToLocationID:   custodyLoc.LocationID,
			Quantity:       moveQty,
			MoveType:       "CUSTODY_CHECKOUT",
			ReferenceCode:  pgtype.Text{String: refCode, Valid: true},
			UsageTarget:    pgtype.Text{String: usageTarget, Valid: true},
			ActorID:        input.EmployeeUserID,
		})
		if err != nil {
			return err
		}
		result.Move = &inventory.MoveResult{Move: move}

		// Update stock_balances for source location
		_, _ = tx.Exec(ctx, `
			UPDATE stock_balances
			SET on_hand = GREATEST(0, on_hand - $4),
			    checked_out = checked_out + $4,
			    updated_at = CURRENT_TIMESTAMP
			WHERE org_id = $1 AND item_id = $2 AND location_id = $3
		`, input.OrgID, input.AssetID, input.SourceLocationID, input.Quantity)

		// 5. Insert Active Record into asset_assignments with Employee ID & Digital Signature
		var expReturn pgtype.Timestamptz
		if input.ExpectedReturnDate != nil {
			expReturn = pgtype.Timestamptz{Time: *input.ExpectedReturnDate, Valid: true}
		}

		assignmentID := uuid.New()
		now := time.Now()
		_, err = tx.Exec(ctx, `
			INSERT INTO asset_assignments (
				assignment_id, org_id, asset_id, assigned_to_user_id,
				checkout_date, expected_return_date, condition_grade,
				quantity, employee_code, employee_name, employee_department,
				employee_email, serial_number, signature_data, notes
			) VALUES (
				$1, $2, $3, $4,
				$5, $6, $7,
				$8, $9, $10, $11,
				$12, $13, $14, $15
			)
		`,
			assignmentID, input.OrgID, input.AssetID, input.EmployeeUserID,
			now, expReturn, input.ConditionGrade,
			input.Quantity, empCode, empName, empDept,
			empEmail, strings.TrimSpace(input.SerialNumber), input.SignatureData, strings.TrimSpace(input.Notes),
		)
		if err != nil {
			return err
		}

		result.Assignment = AssignmentDetail{
			AssignmentID:       assignmentID,
			OrgID:              input.OrgID,
			AssetID:            input.AssetID,
			AssignedToUserID:   input.EmployeeUserID,
			CheckoutDate:       now,
			ExpectedReturnDate: input.ExpectedReturnDate,
			ConditionGrade:     input.ConditionGrade,
			Quantity:           input.Quantity,
			EmployeeCode:       empCode,
			EmployeeName:       empName,
			EmployeeDepartment: empDept,
			EmployeeEmail:      empEmail,
			SerialNumber:       strings.TrimSpace(input.SerialNumber),
			SignatureData:      input.SignatureData,
			Notes:              strings.TrimSpace(input.Notes),
			AssetSku:           item.Sku,
			AssetName:          item.Name,
			AssetAttributes:    item.Attributes,
		}

		// 6. Cryptographic Evidence Handover Sealing
		prevHash := GenesisHash
		latestEv, err := q.GetLatestEvidenceByOrg(ctx, input.OrgID)
		if err == nil && latestEv.RecordHash != "" {
			prevHash = latestEv.RecordHash
		}

		sealResp, err := s.sealer.SealHandover(ctx, HandoverSealRequest{
			OrgID:        input.OrgID.String(),
			AssignmentID: assignmentID.String(),
			EmployeeName: fmt.Sprintf("%s (%s)", empName, empCode),
			EmployeeID:   empCode,
			AssetSKU:     item.Sku,
			AssetName:    item.Name,
			SerialNumber: input.SerialNumber,
			Condition:    input.ConditionGrade,
			CheckoutDate: now.Format(time.RFC3339),
			PreviousHash: prevHash,
		})
		if err == nil && sealResp != nil {
			evidence, err := q.CreateHandoverEvidence(ctx, db.CreateHandoverEvidenceParams{
				OrgID:        input.OrgID,
				AssignmentID: assignmentID,
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

// CheckIn returns an asset from employee custody back to physical storage (or into Faulty/Repair if damaged).
func (s *AssetCustodyService) CheckIn(ctx context.Context, input CheckInInput) (*CheckInResult, error) {
	if input.ConditionGrade == "" {
		input.ConditionGrade = "A"
	}

	var result CheckInResult

	err := s.db.WithTenantTxRaw(ctx, input.OrgID, func(q *db.Queries, tx pgx.Tx) error {
		// 1. Fetch Assignment with extended columns
		var a AssignmentDetail
		var expDate, retDate pgtype.Timestamptz
		err := tx.QueryRow(ctx, `
			SELECT 
				a.assignment_id, a.org_id, a.asset_id, a.assigned_to_user_id,
				a.checkout_date, a.expected_return_date, a.returned_at, COALESCE(a.condition_grade, 'A'),
				COALESCE(a.quantity, 1)::float8, COALESCE(a.employee_code, ''), COALESCE(a.employee_name, ''),
				COALESCE(a.employee_department, ''), COALESCE(a.employee_email, ''),
				COALESCE(a.serial_number, ''), COALESCE(a.signature_data, ''), COALESCE(a.notes, ''),
				COALESCE(i.sku, ''), COALESCE(i.name, '')
			FROM asset_assignments a
			LEFT JOIN items i ON i.item_id = a.asset_id
			WHERE a.assignment_id = $1 AND a.org_id = $2
		`, input.AssignmentID, input.OrgID).Scan(
			&a.AssignmentID, &a.OrgID, &a.AssetID, &a.AssignedToUserID,
			&a.CheckoutDate, &expDate, &retDate, &a.ConditionGrade,
			&a.Quantity, &a.EmployeeCode, &a.EmployeeName,
			&a.EmployeeDepartment, &a.EmployeeEmail,
			&a.SerialNumber, &a.SignatureData, &a.Notes,
			&a.AssetSku, &a.AssetName,
		)
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				return ErrAssignmentNotFound
			}
			return err
		}

		if retDate.Valid {
			return ErrAssignmentAlreadyClosed
		}
		if a.Quantity <= 0 {
			a.Quantity = 1
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
		_ = moveQty.Scan(fmt.Sprintf("%.4f", a.Quantity))

		refCode := fmt.Sprintf("RETURN-%s", a.AssetID.String()[:8])
		move, err := q.CreateStockMove(ctx, db.CreateStockMoveParams{
			OrgID:          input.OrgID,
			ItemID:         a.AssetID,
			FromLocationID: custodyLoc.LocationID,
			ToLocationID:   input.ReturnToLocationID,
			Quantity:       moveQty,
			MoveType:       "CUSTODY_RETURN",
			ReferenceCode:  pgtype.Text{String: refCode, Valid: true},
			UsageTarget:    pgtype.Text{String: fmt.Sprintf("Returned by %s (%s)", a.EmployeeName, a.EmployeeCode), Valid: true},
			ActorID:        a.AssignedToUserID,
		})
		if err != nil {
			return err
		}
		result.Move = &inventory.MoveResult{Move: move}

		isFaultyReturn := strings.EqualFold(input.ReturnCondition, "FAULTY") ||
			strings.EqualFold(input.ConditionGrade, "FAULTY") ||
			strings.EqualFold(input.ConditionGrade, "DAMAGED") ||
			strings.EqualFold(input.ConditionGrade, "F")

		if isFaultyReturn {
			// Decrement checked_out without adding broken unit to available store on_hand
			_, _ = tx.Exec(ctx, `
				UPDATE stock_balances
				SET checked_out = GREATEST(0, checked_out - $4),
				    updated_at = CURRENT_TIMESTAMP
				WHERE org_id = $1 AND item_id = $2 AND location_id = $3
			`, input.OrgID, a.AssetID, input.ReturnToLocationID, a.Quantity)

			// Automatically log in asset_repairs as FAULTY (or AT_VENDOR if vendor specified)
			repairStatus := "FAULTY"
			var sentDate interface{}
			if strings.TrimSpace(input.VendorName) != "" {
				repairStatus = "AT_VENDOR"
				sentDate = time.Now()
			}
			issueDesc := strings.TrimSpace(input.IssueDescription)
			if issueDesc == "" {
				issueDesc = strings.TrimSpace(input.Notes)
			}
			if issueDesc == "" {
				issueDesc = "Returned damaged/faulty from employee custody"
			}
			reportedBy := a.EmployeeName
			if a.EmployeeCode != "" {
				reportedBy = fmt.Sprintf("%s (%s)", a.EmployeeName, a.EmployeeCode)
			}
			_, _ = tx.Exec(ctx, `
				INSERT INTO asset_repairs (
					org_id, item_id, quantity, serial_number, status,
					issue_description, reported_by, vendor_name, sent_date
				) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
			`, input.OrgID, a.AssetID, a.Quantity, a.SerialNumber, repairStatus,
				issueDesc, reportedBy, strings.TrimSpace(input.VendorName), sentDate)
		} else {
			// Healthy return: add back to Available Store Stock (on_hand)
			_, _ = tx.Exec(ctx, `
				UPDATE stock_balances
				SET on_hand = on_hand + $4,
				    checked_out = GREATEST(0, checked_out - $4),
				    updated_at = CURRENT_TIMESTAMP
				WHERE org_id = $1 AND item_id = $2 AND location_id = $3
			`, input.OrgID, a.AssetID, input.ReturnToLocationID, a.Quantity)
		}

		// 4. Mark assignment closed
		now := time.Now()
		updatedNotes := a.Notes
		if strings.TrimSpace(input.Notes) != "" {
			if updatedNotes != "" {
				updatedNotes += " | Return: " + strings.TrimSpace(input.Notes)
			} else {
				updatedNotes = strings.TrimSpace(input.Notes)
			}
		}

		_, err = tx.Exec(ctx, `
			UPDATE asset_assignments
			SET returned_at = $3,
			    condition_grade = $4,
			    notes = $5
			WHERE assignment_id = $1 AND org_id = $2
		`, input.AssignmentID, input.OrgID, now, input.ConditionGrade, updatedNotes)
		if err != nil {
			return err
		}

		a.ReturnedAt = &now
		a.ConditionGrade = input.ConditionGrade
		a.Notes = updatedNotes
		result.Assignment = a

		return nil
	})

	if err != nil {
		return nil, err
	}

	return &result, nil
}

// ListAllAssignments retrieves all active and historical custody assignments for the organization.
func (s *AssetCustodyService) ListAllAssignments(ctx context.Context, orgID uuid.UUID) ([]AssignmentDetail, error) {
	var list []AssignmentDetail

	err := s.db.WithTenantTxRaw(ctx, orgID, func(q *db.Queries, tx pgx.Tx) error {
		rows, err := tx.Query(ctx, `
			SELECT 
				a.assignment_id, a.org_id, a.asset_id, a.assigned_to_user_id,
				a.checkout_date, a.expected_return_date, a.returned_at, COALESCE(a.condition_grade, 'A'),
				COALESCE(a.quantity, 1)::float8,
				COALESCE(NULLIF(a.employee_code, ''), 'EMP-' || UPPER(SUBSTRING(a.assigned_to_user_id::text, 1, 6))),
				COALESCE(NULLIF(a.employee_name, ''), u.name, 'Employee'),
				COALESCE(NULLIF(a.employee_department, ''), u.role, 'IT / Operations'),
				COALESCE(NULLIF(a.employee_email, ''), u.email, ''),
				COALESCE(a.serial_number, ''),
				COALESCE(a.signature_data, ''),
				COALESCE(a.notes, ''),
				COALESCE(i.sku, ''),
				COALESCE(i.name, ''),
				COALESCE(i.attributes, '{}'::jsonb)
			FROM asset_assignments a
			JOIN items i ON i.item_id = a.asset_id
			LEFT JOIN users u ON u.user_id = a.assigned_to_user_id
			WHERE a.org_id = $1
			ORDER BY a.checkout_date DESC
		`, orgID)
		if err != nil {
			return err
		}
		defer rows.Close()

		for rows.Next() {
			var d AssignmentDetail
			var expDate, retDate pgtype.Timestamptz
			if err := rows.Scan(
				&d.AssignmentID, &d.OrgID, &d.AssetID, &d.AssignedToUserID,
				&d.CheckoutDate, &expDate, &retDate, &d.ConditionGrade,
				&d.Quantity, &d.EmployeeCode, &d.EmployeeName,
				&d.EmployeeDepartment, &d.EmployeeEmail, &d.SerialNumber,
				&d.SignatureData, &d.Notes,
				&d.AssetSku, &d.AssetName, &d.AssetAttributes,
			); err != nil {
				return err
			}
			if expDate.Valid {
				t := expDate.Time
				d.ExpectedReturnDate = &t
			}
			if retDate.Valid {
				t := retDate.Time
				d.ReturnedAt = &t
			}
			list = append(list, d)
		}
		return rows.Err()
	})

	return list, err
}

// ListEmployeeCustody retrieves all hardware/assets deployed to a specific worker.
func (s *AssetCustodyService) ListEmployeeCustody(ctx context.Context, orgID, employeeUserID uuid.UUID) ([]AssignmentDetail, error) {
	all, err := s.ListAllAssignments(ctx, orgID)
	if err != nil {
		return nil, err
	}
	var filtered []AssignmentDetail
	for _, a := range all {
		if a.AssignedToUserID == employeeUserID {
			filtered = append(filtered, a)
		}
	}
	return filtered, nil
}

// GetCustodySummary retrieves aggregate asset counts for the organization.
func (s *AssetCustodyService) GetCustodySummary(ctx context.Context, orgID uuid.UUID) (*OfficeCustodySummary, error) {
	var summary OfficeCustodySummary

	err := s.db.WithTenantTxRaw(ctx, orgID, func(q *db.Queries, tx pgx.Tx) error {
		return tx.QueryRow(ctx, `
			SELECT
				COALESCE((SELECT SUM(on_hand) FROM stock_balances WHERE org_id = $1), 0)::bigint +
				COALESCE((SELECT SUM(quantity) FROM asset_assignments WHERE org_id = $1 AND returned_at IS NULL), 0)::bigint AS total_assets,
				COALESCE((SELECT SUM(quantity) FROM asset_assignments WHERE org_id = $1 AND returned_at IS NULL), 0)::bigint AS deployed_to_employees,
				COALESCE((SELECT SUM(on_hand) FROM stock_balances WHERE org_id = $1), 0)::bigint AS remaining_in_storage,
				COALESCE((SELECT SUM(quantity) FROM asset_repairs WHERE org_id = $1 AND status = 'FAULTY'), 0)::float8 AS faulty_units,
				COALESCE((SELECT SUM(quantity) FROM asset_repairs WHERE org_id = $1 AND status = 'AT_VENDOR'), 0)::float8 AS under_repair_units,
				COALESCE((SELECT SUM(quantity) FROM asset_repairs WHERE org_id = $1 AND status = 'REPAIRED'), 0)::float8 AS repaired_units
		`, orgID).Scan(
			&summary.TotalAssets,
			&summary.DeployedToEmployees,
			&summary.RemainingInStorage,
			&summary.FaultyUnits,
			&summary.UnderRepairUnits,
			&summary.RepairedUnits,
		)
	})

	return &summary, err
}

type CertificateVerificationResult struct {
	Assignment     AssignmentDetail    `json:"assignment"`
	Evidence       db.HandoverEvidence `json:"evidence"`
	IsValid        bool                `json:"is_valid"`
	TamperDetected bool                `json:"tamper_detected"`
	ComputedHash   string              `json:"computed_hash"`
	StoredHash     string              `json:"stored_hash"`
}

// GetHandoverCertificate fetches and cryptographically verifies the tamper-evident certificate.
func (s *AssetCustodyService) GetHandoverCertificate(ctx context.Context, orgID, assignmentID uuid.UUID) (*CertificateVerificationResult, error) {
	var res CertificateVerificationResult

	err := s.db.WithTenantTxRaw(ctx, orgID, func(q *db.Queries, tx pgx.Tx) error {
		var d AssignmentDetail
		var expDate, retDate pgtype.Timestamptz
		err := tx.QueryRow(ctx, `
			SELECT 
				a.assignment_id, a.org_id, a.asset_id, a.assigned_to_user_id,
				a.checkout_date, a.expected_return_date, a.returned_at, COALESCE(a.condition_grade, 'A'),
				COALESCE(a.quantity, 1)::float8,
				COALESCE(NULLIF(a.employee_code, ''), 'EMP-' || UPPER(SUBSTRING(a.assigned_to_user_id::text, 1, 6))),
				COALESCE(NULLIF(a.employee_name, ''), u.name, 'Employee'),
				COALESCE(NULLIF(a.employee_department, ''), u.role, 'IT / Operations'),
				COALESCE(NULLIF(a.employee_email, ''), u.email, ''),
				COALESCE(a.serial_number, ''),
				COALESCE(a.signature_data, ''),
				COALESCE(a.notes, ''),
				COALESCE(i.sku, ''),
				COALESCE(i.name, ''),
				COALESCE(i.attributes, '{}'::jsonb)
			FROM asset_assignments a
			JOIN items i ON i.item_id = a.asset_id
			LEFT JOIN users u ON u.user_id = a.assigned_to_user_id
			WHERE a.assignment_id = $1 AND a.org_id = $2
		`, assignmentID, orgID).Scan(
			&d.AssignmentID, &d.OrgID, &d.AssetID, &d.AssignedToUserID,
			&d.CheckoutDate, &expDate, &retDate, &d.ConditionGrade,
			&d.Quantity, &d.EmployeeCode, &d.EmployeeName,
			&d.EmployeeDepartment, &d.EmployeeEmail, &d.SerialNumber,
			&d.SignatureData, &d.Notes,
			&d.AssetSku, &d.AssetName, &d.AssetAttributes,
		)
		if err != nil {
			return err
		}
		if expDate.Valid {
			t := expDate.Time
			d.ExpectedReturnDate = &t
		}
		if retDate.Valid {
			t := retDate.Time
			d.ReturnedAt = &t
		}
		res.Assignment = d

		evidence, err := q.GetHandoverEvidenceByAssignmentID(ctx, db.GetHandoverEvidenceByAssignmentIDParams{
			OrgID:        orgID,
			AssignmentID: assignmentID,
		})
		if err != nil {
			return err
		}
		res.Evidence = evidence

		expected := ComputeRecordHash(evidence.PreviousHash, d.AssignmentID, evidence.PdfSha256)
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
