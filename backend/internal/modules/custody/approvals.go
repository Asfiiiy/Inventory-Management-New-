package custody

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"whoopit-core/internal/platform/db"
	"whoopit-core/internal/platform/mail"
)

var (
	ErrRequestNotFound  = errors.New("asset request not found")
	ErrRequestNotPending = errors.New("asset request is not pending")
)

type AssetRequest struct {
	RequestID          uuid.UUID  `json:"request_id"`
	OrgID              uuid.UUID  `json:"org_id"`
	ItemID             uuid.UUID  `json:"item_id"`
	ItemSku            string     `json:"item_sku"`
	ItemName           string     `json:"item_name"`
	RequesterUserID    uuid.UUID  `json:"requester_user_id"`
	RequesterName      string     `json:"requester_name"`
	EmployeeUserID     uuid.UUID  `json:"employee_user_id"`
	EmployeeName       string     `json:"employee_name"`
	EmployeeEmail      string     `json:"employee_email"`
	SourceLocationID   *uuid.UUID `json:"source_location_id,omitempty"`
	Quantity           float64    `json:"quantity"`
	SerialNumber       string     `json:"serial_number"`
	RequestType        string     `json:"request_type"`
	Status             string     `json:"status"`
	UnitCost           float64    `json:"unit_cost"`
	EstimatedValue     float64    `json:"estimated_value"`
	Reason             string     `json:"reason"`
	Notes              string     `json:"notes"`
	ConditionGrade     string     `json:"condition_grade"`
	ExpectedReturnDate *time.Time `json:"expected_return_date,omitempty"`
	DecidedBy          *uuid.UUID `json:"decided_by,omitempty"`
	DecidedAt          *time.Time `json:"decided_at,omitempty"`
	DecisionNotes      string     `json:"decision_notes"`
	AssignmentID       *uuid.UUID `json:"assignment_id,omitempty"`
	CreatedAt          time.Time  `json:"created_at"`
	UpdatedAt          time.Time  `json:"updated_at"`
}

type CreateRequestInput struct {
	OrgID              uuid.UUID
	RequesterUserID    uuid.UUID
	ItemID             uuid.UUID
	EmployeeUserID     uuid.UUID
	SourceLocationID   *uuid.UUID
	Quantity           float64
	SerialNumber       string
	RequestType        string
	Reason             string
	Notes              string
	ConditionGrade     string
	ExpectedReturnDate *time.Time
}

type DecideRequestInput struct {
	OrgID         uuid.UUID
	RequestID     uuid.UUID
	DeciderUserID uuid.UUID
	Approve       bool
	DecisionNotes string
	SignatureData string
}

func (s *AssetCustodyService) GetApprovalThreshold(ctx context.Context, orgID uuid.UUID) float64 {
	var threshold float64
	err := s.db.Pool().QueryRow(ctx, `
		SELECT COALESCE(approval_threshold, 500)::float8
		FROM organization_settings WHERE org_id = $1
	`, orgID).Scan(&threshold)
	if err != nil || threshold < 0 {
		return 500
	}
	return threshold
}

func (s *AssetCustodyService) itemUnitCost(ctx context.Context, orgID, itemID uuid.UUID) (float64, string, string, error) {
	var cost float64
	var sku, name string
	err := s.db.Pool().QueryRow(ctx, `
		SELECT COALESCE(cost_price, 0)::float8, COALESCE(sku, ''), COALESCE(name, '')
		FROM items WHERE item_id = $1 AND org_id = $2
	`, itemID, orgID).Scan(&cost, &sku, &name)
	return cost, sku, name, err
}

// CreateAssetRequest queues a checkout/dispose for admin approval.
func (s *AssetCustodyService) CreateAssetRequest(ctx context.Context, in CreateRequestInput) (*AssetRequest, error) {
	if in.Quantity <= 0 {
		in.Quantity = 1
	}
	if in.RequestType == "" {
		in.RequestType = "CHECKOUT"
	}
	if in.ConditionGrade == "" {
		in.ConditionGrade = "A"
	}

	cost, sku, name, err := s.itemUnitCost(ctx, in.OrgID, in.ItemID)
	if err != nil {
		return nil, err
	}
	est := cost * in.Quantity

	var req AssetRequest
	err = s.db.WithTenantTxRaw(ctx, in.OrgID, func(_ *db.Queries, tx pgx.Tx) error {
		var locID interface{}
		if in.SourceLocationID != nil {
			locID = *in.SourceLocationID
		}
		return tx.QueryRow(ctx, `
			INSERT INTO asset_requests (
				org_id, item_id, requester_user_id, employee_user_id, source_location_id,
				quantity, serial_number, request_type, status, unit_cost, estimated_value,
				reason, notes, condition_grade, expected_return_date
			) VALUES (
				$1,$2,$3,$4,$5,$6,$7,$8,'PENDING',$9,$10,$11,$12,$13,$14
			)
			RETURNING request_id, created_at, updated_at
		`,
			in.OrgID, in.ItemID, in.RequesterUserID, in.EmployeeUserID, locID,
			in.Quantity, strings.TrimSpace(in.SerialNumber), in.RequestType,
			cost, est, strings.TrimSpace(in.Reason), strings.TrimSpace(in.Notes),
			in.ConditionGrade, in.ExpectedReturnDate,
		).Scan(&req.RequestID, &req.CreatedAt, &req.UpdatedAt)
	})
	if err != nil {
		return nil, err
	}

	req.OrgID = in.OrgID
	req.ItemID = in.ItemID
	req.ItemSku = sku
	req.ItemName = name
	req.RequesterUserID = in.RequesterUserID
	req.EmployeeUserID = in.EmployeeUserID
	req.SourceLocationID = in.SourceLocationID
	req.Quantity = in.Quantity
	req.SerialNumber = strings.TrimSpace(in.SerialNumber)
	req.RequestType = in.RequestType
	req.Status = "PENDING"
	req.UnitCost = cost
	req.EstimatedValue = est
	req.Reason = strings.TrimSpace(in.Reason)
	req.Notes = strings.TrimSpace(in.Notes)
	req.ConditionGrade = in.ConditionGrade
	req.ExpectedReturnDate = in.ExpectedReturnDate

	s.notifyAdminsPending(ctx, in.OrgID, &req)
	return &req, nil
}

func (s *AssetCustodyService) notifyAdminsPending(ctx context.Context, orgID uuid.UUID, req *AssetRequest) {
	var alertEmail string
	_ = s.db.Pool().QueryRow(ctx, `
		SELECT COALESCE(alert_email::text, '') FROM organization_settings WHERE org_id = $1
	`, orgID).Scan(&alertEmail)
	if !strings.Contains(alertEmail, "@") {
		return
	}
	serial := req.SerialNumber
	if serial == "" {
		serial = "—"
	}
	html := fmt.Sprintf(`
		<div style="font-family:Segoe UI,Arial,sans-serif;max-width:560px;color:#0f172a">
		  <h2 style="color:#0c3843">Approval needed</h2>
		  <p><strong>%s</strong> (%s) — estimated value <strong>$%.2f</strong></p>
		  <p>Qty: %.0f · Type: %s · Serial: %s</p>
		  <p>Reason: %s</p>
		  <p>Review in Custody → Approvals queue.</p>
		</div>`,
		req.ItemName, req.ItemSku, req.EstimatedValue, req.Quantity, req.RequestType, serial, req.Reason,
	)
	_, _ = mail.Send(alertEmail, fmt.Sprintf("Approval needed: %s ($%.0f)", req.ItemName, req.EstimatedValue), html, "")
}

func (s *AssetCustodyService) ListAssetRequests(ctx context.Context, orgID uuid.UUID, status string) ([]AssetRequest, error) {
	var out []AssetRequest
	err := s.db.WithTenantTxRaw(ctx, orgID, func(_ *db.Queries, tx pgx.Tx) error {
		q := `
			SELECT
				r.request_id, r.org_id, r.item_id,
				COALESCE(i.sku,''), COALESCE(i.name,''),
				r.requester_user_id, COALESCE(ru.name, ru.email::text, ''),
				r.employee_user_id, COALESCE(eu.name, eu.email::text, ''), COALESCE(eu.email::text, ''),
				r.source_location_id, r.quantity::float8, COALESCE(r.serial_number,''),
				r.request_type, r.status, r.unit_cost::float8, r.estimated_value::float8,
				COALESCE(r.reason,''), COALESCE(r.notes,''), COALESCE(r.condition_grade,'A'),
				r.expected_return_date, r.decided_by, r.decided_at, COALESCE(r.decision_notes,''),
				r.assignment_id, r.created_at, r.updated_at
			FROM asset_requests r
			JOIN items i ON i.item_id = r.item_id
			LEFT JOIN users ru ON ru.user_id = r.requester_user_id
			LEFT JOIN users eu ON eu.user_id = r.employee_user_id
			WHERE r.org_id = $1`
		args := []any{orgID}
		if status != "" && status != "ALL" {
			q += ` AND r.status = $2`
			args = append(args, status)
		}
		q += ` ORDER BY r.created_at DESC LIMIT 200`

		rows, err := tx.Query(ctx, q, args...)
		if err != nil {
			return err
		}
		defer rows.Close()

		out = make([]AssetRequest, 0)
		for rows.Next() {
			var r AssetRequest
			var locID, decidedBy, assignmentID *uuid.UUID
			if err := rows.Scan(
				&r.RequestID, &r.OrgID, &r.ItemID, &r.ItemSku, &r.ItemName,
				&r.RequesterUserID, &r.RequesterName,
				&r.EmployeeUserID, &r.EmployeeName, &r.EmployeeEmail,
				&locID, &r.Quantity, &r.SerialNumber,
				&r.RequestType, &r.Status, &r.UnitCost, &r.EstimatedValue,
				&r.Reason, &r.Notes, &r.ConditionGrade,
				&r.ExpectedReturnDate, &decidedBy, &r.DecidedAt, &r.DecisionNotes,
				&assignmentID, &r.CreatedAt, &r.UpdatedAt,
			); err != nil {
				return err
			}
			r.SourceLocationID = locID
			r.DecidedBy = decidedBy
			r.AssignmentID = assignmentID
			out = append(out, r)
		}
		return rows.Err()
	})
	return out, err
}

func (s *AssetCustodyService) GetAssetRequest(ctx context.Context, orgID, requestID uuid.UUID) (*AssetRequest, error) {
	list, err := s.ListAssetRequests(ctx, orgID, "ALL")
	if err != nil {
		return nil, err
	}
	for i := range list {
		if list[i].RequestID == requestID {
			return &list[i], nil
		}
	}
	return nil, ErrRequestNotFound
}

func (s *AssetCustodyService) DecideAssetRequest(ctx context.Context, in DecideRequestInput) (*AssetRequest, error) {
	found, err := s.GetAssetRequest(ctx, in.OrgID, in.RequestID)
	if err != nil {
		return nil, err
	}
	if found.Status != "PENDING" {
		return nil, ErrRequestNotPending
	}

	now := time.Now()
	status := "REJECTED"
	var assignmentID *uuid.UUID

	if in.Approve {
		status = "APPROVED"
		if found.RequestType == "CHECKOUT" {
			sourceLoc := found.SourceLocationID
			if sourceLoc == nil {
				var locID uuid.UUID
				err := s.db.Pool().QueryRow(ctx, `
					SELECT location_id FROM locations
					WHERE org_id = $1
					  AND (category IS NULL OR category NOT LIKE 'virtual_%')
					ORDER BY created_at ASC
					LIMIT 1
				`, in.OrgID).Scan(&locID)
				if err != nil {
					return nil, fmt.Errorf("source location required to approve checkout")
				}
				sourceLoc = &locID
			}
			res, err := s.CheckOut(ctx, CheckOutInput{
				OrgID:              in.OrgID,
				AssetID:            found.ItemID,
				EmployeeUserID:     found.EmployeeUserID,
				SourceLocationID:   *sourceLoc,
				ExpectedReturnDate: found.ExpectedReturnDate,
				ConditionGrade:     found.ConditionGrade,
				Quantity:           found.Quantity,
				SerialNumber:       found.SerialNumber,
				SignatureData:      in.SignatureData,
				Notes:              found.Notes,
			})
			if err != nil {
				return nil, err
			}
			aid := res.Assignment.AssignmentID
			assignmentID = &aid
		}
	}

	err = s.db.WithTenantTxRaw(ctx, in.OrgID, func(_ *db.Queries, tx pgx.Tx) error {
		tag, err := tx.Exec(ctx, `
			UPDATE asset_requests SET
				status = $1,
				decided_by = $2,
				decided_at = $3,
				decision_notes = $4,
				assignment_id = $5,
				updated_at = CURRENT_TIMESTAMP
			WHERE request_id = $6 AND org_id = $7 AND status = 'PENDING'
		`, status, in.DeciderUserID, now, strings.TrimSpace(in.DecisionNotes), assignmentID, in.RequestID, in.OrgID)
		if err != nil {
			return err
		}
		if tag.RowsAffected() == 0 {
			return ErrRequestNotPending
		}
		return nil
	})
	if err != nil {
		return nil, err
	}

	found.Status = status
	found.DecidedBy = &in.DeciderUserID
	found.DecidedAt = &now
	found.DecisionNotes = strings.TrimSpace(in.DecisionNotes)
	found.AssignmentID = assignmentID
	return found, nil
}
