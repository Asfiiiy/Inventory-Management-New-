package inventory

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"whoopit-core/internal/middleware"
	platformHttp "whoopit-core/internal/platform/http"
)

type RepairRecord struct {
	RepairID           uuid.UUID  `json:"repair_id"`
	OrgID              uuid.UUID  `json:"org_id"`
	ItemID             uuid.UUID  `json:"item_id"`
	ItemSku            string     `json:"item_sku"`
	ItemName           string     `json:"item_name"`
	Quantity           float64    `json:"quantity"`
	SerialNumber       string     `json:"serial_number"`
	Status             string     `json:"status"` // FAULTY, AT_VENDOR, REPAIRED, SCRAPPED
	IssueDescription   string     `json:"issue_description"`
	ReportedBy         string     `json:"reported_by"`
	VendorName         string     `json:"vendor_name"`
	VendorContact      string     `json:"vendor_contact"`
	TicketReference    string     `json:"ticket_reference"`
	SentDate           *time.Time `json:"sent_date,omitempty"`
	ExpectedReturnDate *time.Time `json:"expected_return_date,omitempty"`
	RepairedDate       *time.Time `json:"repaired_date,omitempty"`
	RepairCost         float64    `json:"repair_cost"`
	ResolutionNotes    string     `json:"resolution_notes"`
	CreatedAt          time.Time  `json:"created_at"`
	UpdatedAt          time.Time  `json:"updated_at"`
}

type RepairSummary struct {
	TotalFaulty      float64 `json:"total_faulty"`
	TotalAtVendor    float64 `json:"total_at_vendor"`
	TotalRepaired    float64 `json:"total_repaired"`
	TotalScrapped    float64 `json:"total_scrapped"`
	TotalRepairSpend float64 `json:"total_repair_spend"`
}

type CreateRepairRequest struct {
	ItemID             string  `json:"item_id"`
	Quantity           float64 `json:"quantity"`
	SerialNumber       string  `json:"serial_number"`
	Status             string  `json:"status"` // "FAULTY" or "AT_VENDOR"
	IssueDescription   string  `json:"issue_description"`
	ReportedBy         string  `json:"reported_by"`
	VendorName         string  `json:"vendor_name"`
	VendorContact      string  `json:"vendor_contact"`
	TicketReference    string  `json:"ticket_reference"`
	ExpectedReturnDate string  `json:"expected_return_date,omitempty"`
	DeductFromStore    *bool   `json:"deduct_from_store,omitempty"`
}

// ListRepairs returns all faulty & vendor repair records along with summary counts.
func (h *Handler) ListRepairs(w http.ResponseWriter, r *http.Request) {
	orgID, ok := middleware.GetTenantID(r.Context())
	if !ok {
		platformHttp.RespondProblem(w, r, http.StatusUnauthorized, "Unauthorized", "Tenant context missing", nil)
		return
	}

	itemFilter := strings.TrimSpace(r.URL.Query().Get("item_id"))
	statusFilter := strings.TrimSpace(r.URL.Query().Get("status"))

	pool := h.service.db.Pool()
	ctx := r.Context()

	query := `
		SELECT
			r.repair_id, r.org_id, r.item_id,
			COALESCE(i.sku, ''), COALESCE(i.name, 'IT Equipment'),
			r.quantity::float8, COALESCE(r.serial_number, ''), r.status,
			COALESCE(r.issue_description, ''), COALESCE(r.reported_by, ''),
			COALESCE(r.vendor_name, ''), COALESCE(r.vendor_contact, ''),
			COALESCE(r.ticket_reference, ''),
			r.sent_date, r.expected_return_date, r.repaired_date,
			COALESCE(r.repair_cost, 0)::float8, COALESCE(r.resolution_notes, ''),
			r.created_at, r.updated_at
		FROM asset_repairs r
		JOIN items i ON i.item_id = r.item_id
		WHERE r.org_id = $1
	`
	args := []any{orgID}
	idx := 2

	if itemFilter != "" {
		if parsedItem, err := uuid.Parse(itemFilter); err == nil {
			query += fmt.Sprintf(" AND r.item_id = $%d", idx)
			args = append(args, parsedItem)
			idx++
		}
	}
	if statusFilter != "" && !strings.EqualFold(statusFilter, "ALL") {
		query += fmt.Sprintf(" AND UPPER(r.status) = UPPER($%d)", idx)
		args = append(args, statusFilter)
		idx++
	}

	query += " ORDER BY r.created_at DESC"

	rows, err := pool.Query(ctx, query, args...)
	if err != nil {
		platformHttp.RespondProblem(w, r, http.StatusInternalServerError, "Database Error", err.Error(), nil)
		return
	}
	defer rows.Close()

	records := make([]RepairRecord, 0)
	for rows.Next() {
		var rec RepairRecord
		if err := rows.Scan(
			&rec.RepairID, &rec.OrgID, &rec.ItemID,
			&rec.ItemSku, &rec.ItemName,
			&rec.Quantity, &rec.SerialNumber, &rec.Status,
			&rec.IssueDescription, &rec.ReportedBy,
			&rec.VendorName, &rec.VendorContact,
			&rec.TicketReference,
			&rec.SentDate, &rec.ExpectedReturnDate, &rec.RepairedDate,
			&rec.RepairCost, &rec.ResolutionNotes,
			&rec.CreatedAt, &rec.UpdatedAt,
		); err != nil {
			platformHttp.RespondProblem(w, r, http.StatusInternalServerError, "Scan Error", err.Error(), nil)
			return
		}
		records = append(records, rec)
	}

	var summary RepairSummary
	_ = pool.QueryRow(ctx, `
		SELECT
			COALESCE(SUM(CASE WHEN status = 'FAULTY' THEN quantity ELSE 0 END), 0)::float8,
			COALESCE(SUM(CASE WHEN status = 'AT_VENDOR' THEN quantity ELSE 0 END), 0)::float8,
			COALESCE(SUM(CASE WHEN status = 'REPAIRED' THEN quantity ELSE 0 END), 0)::float8,
			COALESCE(SUM(CASE WHEN status = 'SCRAPPED' THEN quantity ELSE 0 END), 0)::float8,
			COALESCE(SUM(repair_cost), 0)::float8
		FROM asset_repairs
		WHERE org_id = $1
	`, orgID).Scan(
		&summary.TotalFaulty,
		&summary.TotalAtVendor,
		&summary.TotalRepaired,
		&summary.TotalScrapped,
		&summary.TotalRepairSpend,
	)

	platformHttp.RespondJSON(w, http.StatusOK, map[string]any{
		"records": records,
		"summary": summary,
	}, map[string]any{"count": len(records)})
}

// CreateRepair logs a new Faulty / Damaged item or sends it directly to a Vendor for repair.
func (h *Handler) CreateRepair(w http.ResponseWriter, r *http.Request) {
	orgID, ok := middleware.GetTenantID(r.Context())
	if !ok {
		platformHttp.RespondProblem(w, r, http.StatusUnauthorized, "Unauthorized", "Tenant context missing", nil)
		return
	}

	var req CreateRepairRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		platformHttp.RespondProblem(w, r, http.StatusBadRequest, "Bad Request", "Malformed JSON body", nil)
		return
	}

	itemID, err := uuid.Parse(req.ItemID)
	if err != nil {
		platformHttp.RespondProblem(w, r, http.StatusUnprocessableEntity, "Validation Error", "Invalid item_id", nil)
		return
	}
	if req.Quantity <= 0 {
		req.Quantity = 1
	}

	status := strings.ToUpper(strings.TrimSpace(req.Status))
	if status != "AT_VENDOR" && status != "FAULTY" {
		if strings.TrimSpace(req.VendorName) != "" {
			status = "AT_VENDOR"
		} else {
			status = "FAULTY"
		}
	}

	deductFromStore := true
	if req.DeductFromStore != nil {
		deductFromStore = *req.DeductFromStore
	}

	var expDate *time.Time
	if strings.TrimSpace(req.ExpectedReturnDate) != "" {
		if t, parseErr := time.Parse(time.RFC3339, req.ExpectedReturnDate); parseErr == nil {
			expDate = &t
		} else if t2, parseErr2 := time.Parse("2006-01-02", req.ExpectedReturnDate); parseErr2 == nil {
			expDate = &t2
		}
	}

	var sentDate *time.Time
	if status == "AT_VENDOR" {
		now := time.Now()
		sentDate = &now
	}

	if strings.TrimSpace(req.TicketReference) == "" {
		req.TicketReference = fmt.Sprintf("REP-%s", time.Now().Format("0102-1504"))
	}

	ctx := r.Context()
	pool := h.service.db.Pool()
	tx, err := pool.Begin(ctx)
	if err != nil {
		platformHttp.RespondProblem(w, r, http.StatusInternalServerError, "Transaction Error", err.Error(), nil)
		return
	}
	defer tx.Rollback(ctx)

	_, _ = tx.Exec(ctx, "SELECT set_config('app.org_id', $1, true)", orgID.String())

	// Deduct from store available stock if requested
	if deductFromStore {
		var storeLocID, scrapLocID uuid.UUID
		_ = tx.QueryRow(ctx, `
			SELECT location_id FROM stock_balances
			WHERE org_id = $1 AND item_id = $2 AND on_hand > 0
			ORDER BY on_hand DESC LIMIT 1
		`, orgID, itemID).Scan(&storeLocID)

		if storeLocID == uuid.Nil {
			_ = tx.QueryRow(ctx, `
				SELECT location_id FROM locations
				WHERE org_id = $1 AND category IN ('physical_office', 'physical_warehouse')
				ORDER BY is_backup_location ASC, created_at ASC LIMIT 1
			`, orgID).Scan(&storeLocID)
		}

		_ = tx.QueryRow(ctx, `
			SELECT location_id FROM locations
			WHERE org_id = $1 AND category = 'virtual_scrap'
			LIMIT 1
		`, orgID).Scan(&scrapLocID)

		if storeLocID != uuid.Nil {
			_, _ = tx.Exec(ctx, `
				UPDATE stock_balances
				SET on_hand = GREATEST(0, on_hand - $3),
				    updated_at = CURRENT_TIMESTAMP
				WHERE org_id = $1 AND item_id = $2 AND location_id = $4
			`, orgID, itemID, req.Quantity, storeLocID)

			if scrapLocID != uuid.Nil {
				moveType := "FAULTY_REPORT"
				target := "Marked Faulty: " + req.IssueDescription
				if status == "AT_VENDOR" {
					moveType = "VENDOR_REPAIR_OUT"
					target = "Sent to Vendor (" + req.VendorName + "): " + req.IssueDescription
				}
				if len(target) > 120 {
					target = target[:120]
				}
				actorID, _ := middleware.GetUserID(ctx)
				if actorID == uuid.Nil {
					actorID = uuid.New()
				}
				_, _ = tx.Exec(ctx, `
					INSERT INTO stock_moves (org_id, item_id, from_location_id, to_location_id, quantity, move_type, reference_code, usage_target, actor_id)
					VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
				`, orgID, itemID, storeLocID, scrapLocID, req.Quantity, moveType, req.TicketReference, target, actorID)
			}
		}
	}

	var created RepairRecord
	err = tx.QueryRow(ctx, `
		INSERT INTO asset_repairs (
			org_id, item_id, quantity, serial_number, status,
			issue_description, reported_by, vendor_name, vendor_contact,
			ticket_reference, sent_date, expected_return_date
		) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
		RETURNING repair_id, org_id, item_id, quantity::float8, serial_number, status,
		          issue_description, reported_by, vendor_name, vendor_contact,
		          ticket_reference, sent_date, expected_return_date, repaired_date,
		          repair_cost::float8, resolution_notes, created_at, updated_at
	`,
		orgID, itemID, req.Quantity, strings.TrimSpace(req.SerialNumber), status,
		strings.TrimSpace(req.IssueDescription), strings.TrimSpace(req.ReportedBy),
		strings.TrimSpace(req.VendorName), strings.TrimSpace(req.VendorContact),
		strings.TrimSpace(req.TicketReference), sentDate, expDate,
	).Scan(
		&created.RepairID, &created.OrgID, &created.ItemID, &created.Quantity, &created.SerialNumber, &created.Status,
		&created.IssueDescription, &created.ReportedBy, &created.VendorName, &created.VendorContact,
		&created.TicketReference, &created.SentDate, &created.ExpectedReturnDate, &created.RepairedDate,
		&created.RepairCost, &created.ResolutionNotes, &created.CreatedAt, &created.UpdatedAt,
	)
	if err != nil {
		platformHttp.RespondProblem(w, r, http.StatusInternalServerError, "Insert Error", err.Error(), nil)
		return
	}

	_ = tx.QueryRow(ctx, `SELECT sku, name FROM items WHERE item_id = $1`, itemID).Scan(&created.ItemSku, &created.ItemName)

	if err := tx.Commit(ctx); err != nil {
		platformHttp.RespondProblem(w, r, http.StatusInternalServerError, "Commit Error", err.Error(), nil)
		return
	}

	platformHttp.RespondJSON(w, http.StatusCreated, created, nil)
}

type SendToVendorRequest struct {
	VendorName         string `json:"vendor_name"`
	VendorContact      string `json:"vendor_contact"`
	TicketReference    string `json:"ticket_reference"`
	ExpectedReturnDate string `json:"expected_return_date,omitempty"`
	Notes              string `json:"notes,omitempty"`
}

// SendToVendor transitions a FAULTY item to AT_VENDOR when dispatched for repair.
func (h *Handler) SendToVendor(w http.ResponseWriter, r *http.Request) {
	orgID, ok := middleware.GetTenantID(r.Context())
	if !ok {
		platformHttp.RespondProblem(w, r, http.StatusUnauthorized, "Unauthorized", "Tenant context missing", nil)
		return
	}

	repairID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		platformHttp.RespondProblem(w, r, http.StatusBadRequest, "Bad Request", "Invalid repair ID", nil)
		return
	}

	var req SendToVendorRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		platformHttp.RespondProblem(w, r, http.StatusBadRequest, "Bad Request", "Malformed JSON body", nil)
		return
	}
	if strings.TrimSpace(req.VendorName) == "" {
		platformHttp.RespondProblem(w, r, http.StatusUnprocessableEntity, "Validation Error", "vendor_name is required", nil)
		return
	}

	var expDate *time.Time
	if strings.TrimSpace(req.ExpectedReturnDate) != "" {
		if t, parseErr := time.Parse(time.RFC3339, req.ExpectedReturnDate); parseErr == nil {
			expDate = &t
		} else if t2, parseErr2 := time.Parse("2006-01-02", req.ExpectedReturnDate); parseErr2 == nil {
			expDate = &t2
		}
	}

	pool := h.service.db.Pool()
	ctx := r.Context()

	var updated RepairRecord
	err = pool.QueryRow(ctx, `
		UPDATE asset_repairs
		SET status = 'AT_VENDOR',
		    vendor_name = $3,
		    vendor_contact = COALESCE(NULLIF($4, ''), vendor_contact),
		    ticket_reference = COALESCE(NULLIF($5, ''), ticket_reference),
		    sent_date = NOW(),
		    expected_return_date = COALESCE($6, expected_return_date),
		    updated_at = NOW()
		WHERE repair_id = $1 AND org_id = $2
		RETURNING repair_id, org_id, item_id, quantity::float8, serial_number, status,
		          issue_description, reported_by, vendor_name, vendor_contact,
		          ticket_reference, sent_date, expected_return_date, repaired_date,
		          repair_cost::float8, resolution_notes, created_at, updated_at
	`, repairID, orgID, strings.TrimSpace(req.VendorName), strings.TrimSpace(req.VendorContact), strings.TrimSpace(req.TicketReference), expDate).Scan(
		&updated.RepairID, &updated.OrgID, &updated.ItemID, &updated.Quantity, &updated.SerialNumber, &updated.Status,
		&updated.IssueDescription, &updated.ReportedBy, &updated.VendorName, &updated.VendorContact,
		&updated.TicketReference, &updated.SentDate, &updated.ExpectedReturnDate, &updated.RepairedDate,
		&updated.RepairCost, &updated.ResolutionNotes, &updated.CreatedAt, &updated.UpdatedAt,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			platformHttp.RespondProblem(w, r, http.StatusNotFound, "Not Found", "Repair record not found", nil)
			return
		}
		platformHttp.RespondProblem(w, r, http.StatusInternalServerError, "Update Error", err.Error(), nil)
		return
	}

	_ = pool.QueryRow(ctx, `SELECT sku, name FROM items WHERE item_id = $1`, updated.ItemID).Scan(&updated.ItemSku, &updated.ItemName)

	platformHttp.RespondJSON(w, http.StatusOK, updated, nil)
}

type CompleteRepairRequest struct {
	RepairCost      float64 `json:"repair_cost"`
	ResolutionNotes string  `json:"resolution_notes"`
}

// CompleteRepair marks an item as REPAIRED (returned from vendor) and restores its units to Available Store Stock.
func (h *Handler) CompleteRepair(w http.ResponseWriter, r *http.Request) {
	orgID, ok := middleware.GetTenantID(r.Context())
	if !ok {
		platformHttp.RespondProblem(w, r, http.StatusUnauthorized, "Unauthorized", "Tenant context missing", nil)
		return
	}

	repairID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		platformHttp.RespondProblem(w, r, http.StatusBadRequest, "Bad Request", "Invalid repair ID", nil)
		return
	}

	var req CompleteRepairRequest
	_ = json.NewDecoder(r.Body).Decode(&req)

	ctx := r.Context()
	pool := h.service.db.Pool()
	tx, err := pool.Begin(ctx)
	if err != nil {
		platformHttp.RespondProblem(w, r, http.StatusInternalServerError, "Transaction Error", err.Error(), nil)
		return
	}
	defer tx.Rollback(ctx)

	_, _ = tx.Exec(ctx, "SELECT set_config('app.org_id', $1, true)", orgID.String())

	var currentStatus string
	err = tx.QueryRow(ctx, `SELECT status FROM asset_repairs WHERE repair_id = $1 AND org_id = $2 FOR UPDATE`, repairID, orgID).Scan(&currentStatus)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			platformHttp.RespondProblem(w, r, http.StatusNotFound, "Not Found", "Repair ticket not found", nil)
			return
		}
		platformHttp.RespondProblem(w, r, http.StatusInternalServerError, "Query Error", err.Error(), nil)
		return
	}
	if currentStatus == "REPAIRED" {
		platformHttp.RespondProblem(w, r, http.StatusConflict, "Already Completed", "This repair ticket is already marked as REPAIRED", nil)
		return
	}

	var updated RepairRecord
	err = tx.QueryRow(ctx, `
		UPDATE asset_repairs
		SET status = 'REPAIRED',
		    repaired_date = NOW(),
		    repair_cost = $3,
		    resolution_notes = $4,
		    updated_at = NOW()
		WHERE repair_id = $1 AND org_id = $2
		RETURNING repair_id, org_id, item_id, quantity::float8, serial_number, status,
		          issue_description, reported_by, vendor_name, vendor_contact,
		          ticket_reference, sent_date, expected_return_date, repaired_date,
		          repair_cost::float8, resolution_notes, created_at, updated_at
	`, repairID, orgID, req.RepairCost, strings.TrimSpace(req.ResolutionNotes)).Scan(
		&updated.RepairID, &updated.OrgID, &updated.ItemID, &updated.Quantity, &updated.SerialNumber, &updated.Status,
		&updated.IssueDescription, &updated.ReportedBy, &updated.VendorName, &updated.VendorContact,
		&updated.TicketReference, &updated.SentDate, &updated.ExpectedReturnDate, &updated.RepairedDate,
		&updated.RepairCost, &updated.ResolutionNotes, &updated.CreatedAt, &updated.UpdatedAt,
	)
	if err != nil {
		platformHttp.RespondProblem(w, r, http.StatusInternalServerError, "Update Error", err.Error(), nil)
		return
	}

	// Restore repaired units back into Available IT Store Stock (stock_balances.on_hand)
	var storeLocID, vendorLocID uuid.UUID
	_ = tx.QueryRow(ctx, `
		SELECT location_id FROM stock_balances
		WHERE org_id = $1 AND item_id = $2
		ORDER BY on_hand DESC, updated_at DESC LIMIT 1
	`, orgID, updated.ItemID).Scan(&storeLocID)

	if storeLocID == uuid.Nil {
		_ = tx.QueryRow(ctx, `
			SELECT location_id FROM locations
			WHERE org_id = $1 AND category IN ('physical_office', 'physical_warehouse')
			ORDER BY is_backup_location ASC, created_at ASC LIMIT 1
		`, orgID).Scan(&storeLocID)
	}

	_ = tx.QueryRow(ctx, `
		SELECT location_id FROM locations
		WHERE org_id = $1 AND category = 'virtual_vendor'
		LIMIT 1
	`, orgID).Scan(&vendorLocID)

	if storeLocID != uuid.Nil {
		_, _ = tx.Exec(ctx, `
			INSERT INTO stock_balances (org_id, item_id, location_id, on_hand, reserved, checked_out, updated_at)
			VALUES ($1, $2, $3, $4, 0, 0, CURRENT_TIMESTAMP)
			ON CONFLICT (org_id, item_id, location_id)
			DO UPDATE SET on_hand = stock_balances.on_hand + $4, updated_at = CURRENT_TIMESTAMP
		`, orgID, updated.ItemID, storeLocID, updated.Quantity)

		if vendorLocID != uuid.Nil {
			actorID, _ := middleware.GetUserID(ctx)
			if actorID == uuid.Nil {
				actorID = uuid.New()
			}
			target := fmt.Sprintf("Repaired by %s: %s", updated.VendorName, updated.ResolutionNotes)
			if len(target) > 120 {
				target = target[:120]
			}
			_, _ = tx.Exec(ctx, `
				INSERT INTO stock_moves (org_id, item_id, from_location_id, to_location_id, quantity, move_type, reference_code, usage_target, unit_cost, actor_id)
				VALUES ($1, $2, $3, $4, $5, 'VENDOR_REPAIR_RETURN', $6, $7, $8, $9)
			`, orgID, updated.ItemID, vendorLocID, storeLocID, updated.Quantity, updated.TicketReference, target, updated.RepairCost, actorID)
		}
	}

	_ = tx.QueryRow(ctx, `SELECT sku, name FROM items WHERE item_id = $1`, updated.ItemID).Scan(&updated.ItemSku, &updated.ItemName)

	if err := tx.Commit(ctx); err != nil {
		platformHttp.RespondProblem(w, r, http.StatusInternalServerError, "Commit Error", err.Error(), nil)
		return
	}

	platformHttp.RespondJSON(w, http.StatusOK, updated, nil)
}

// ScrapRepair marks a faulty/repair item as permanently SCRAPPED (unrepairable).
func (h *Handler) ScrapRepair(w http.ResponseWriter, r *http.Request) {
	orgID, ok := middleware.GetTenantID(r.Context())
	if !ok {
		platformHttp.RespondProblem(w, r, http.StatusUnauthorized, "Unauthorized", "Tenant context missing", nil)
		return
	}

	repairID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		platformHttp.RespondProblem(w, r, http.StatusBadRequest, "Bad Request", "Invalid repair ID", nil)
		return
	}

	var req struct {
		ResolutionNotes string `json:"resolution_notes"`
	}
	_ = json.NewDecoder(r.Body).Decode(&req)

	pool := h.service.db.Pool()
	ctx := r.Context()

	var updated RepairRecord
	err = pool.QueryRow(ctx, `
		UPDATE asset_repairs
		SET status = 'SCRAPPED',
		    resolution_notes = COALESCE(NULLIF($3, ''), resolution_notes, 'Marked unrepairable / scrapped'),
		    updated_at = NOW()
		WHERE repair_id = $1 AND org_id = $2
		RETURNING repair_id, org_id, item_id, quantity::float8, serial_number, status,
		          issue_description, reported_by, vendor_name, vendor_contact,
		          ticket_reference, sent_date, expected_return_date, repaired_date,
		          repair_cost::float8, resolution_notes, created_at, updated_at
	`, repairID, orgID, strings.TrimSpace(req.ResolutionNotes)).Scan(
		&updated.RepairID, &updated.OrgID, &updated.ItemID, &updated.Quantity, &updated.SerialNumber, &updated.Status,
		&updated.IssueDescription, &updated.ReportedBy, &updated.VendorName, &updated.VendorContact,
		&updated.TicketReference, &updated.SentDate, &updated.ExpectedReturnDate, &updated.RepairedDate,
		&updated.RepairCost, &updated.ResolutionNotes, &updated.CreatedAt, &updated.UpdatedAt,
	)
	if err != nil {
		platformHttp.RespondProblem(w, r, http.StatusInternalServerError, "Update Error", err.Error(), nil)
		return
	}

	_ = pool.QueryRow(ctx, `SELECT sku, name FROM items WHERE item_id = $1`, updated.ItemID).Scan(&updated.ItemSku, &updated.ItemName)

	platformHttp.RespondJSON(w, http.StatusOK, updated, nil)
}

// Ensure unused import guard
var _ = context.Background
