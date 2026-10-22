package catalog

import (
	"bytes"
	"encoding/csv"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"

	"whoopit-core/internal/middleware"
	"whoopit-core/internal/platform/db"
	platformHttp "whoopit-core/internal/platform/http"
)

func getParamID(r *http.Request, key string) string {
	if val := chi.URLParam(r, key); val != "" {
		return val
	}
	return r.PathValue(key)
}

func toPgText(s string) pgtype.Text {
	s = strings.TrimSpace(s)
	return pgtype.Text{String: s, Valid: s != ""}
}

func toPgUUID(u *uuid.UUID) pgtype.UUID {
	if u == nil {
		return pgtype.UUID{Valid: false}
	}
	return pgtype.UUID{Bytes: *u, Valid: true}
}

func toPgNumeric(val float64) pgtype.Numeric {
	var num pgtype.Numeric
	_ = num.Scan(fmt.Sprintf("%.4f", val))
	return num
}

// ============================================================================
// Custom Field Definitions Handlers
// ============================================================================

type CreateCustomFieldRequest struct {
	FieldName       string   `json:"field_name"`
	FieldType       string   `json:"field_type"` // text, number, decimal, date, dropdown, boolean, barcode
	DropdownOptions []string `json:"dropdown_options,omitempty"`
	IsRequired      bool     `json:"is_required"`
}

func (h *Handler) CreateCustomField(w http.ResponseWriter, r *http.Request) {
	orgID, ok := middleware.GetTenantID(r.Context())
	if !ok {
		platformHttp.RespondProblem(w, r, http.StatusUnauthorized, "Unauthorized", "Tenant context missing", nil)
		return
	}

	var req CreateCustomFieldRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		platformHttp.RespondProblem(w, r, http.StatusBadRequest, "Bad Request", "Malformed JSON body", nil)
		return
	}

	req.FieldName = strings.TrimSpace(req.FieldName)
	if req.FieldName == "" {
		platformHttp.RespondProblem(w, r, http.StatusBadRequest, "Validation Error", "field_name is required", nil)
		return
	}

	optsJSON, _ := json.Marshal(req.DropdownOptions)
	if len(req.DropdownOptions) == 0 {
		optsJSON = []byte("[]")
	}

	var created db.CustomFieldDefinition
	err := h.db.WithTenantTx(r.Context(), orgID, func(q *db.Queries) error {
		def, err := q.CreateCustomFieldDefinition(r.Context(), db.CreateCustomFieldDefinitionParams{
			OrgID:           orgID,
			FieldName:       req.FieldName,
			FieldType:       req.FieldType,
			DropdownOptions: optsJSON,
			IsRequired:      req.IsRequired,
		})
		if err != nil {
			return err
		}
		created = def
		return nil
	})
	if err != nil {
		platformHttp.RespondProblem(w, r, http.StatusUnprocessableEntity, "Failed to Create Field", err.Error(), nil)
		return
	}

	platformHttp.RespondJSON(w, http.StatusCreated, created, nil)
}

func (h *Handler) ListCustomFields(w http.ResponseWriter, r *http.Request) {
	orgID, ok := middleware.GetTenantID(r.Context())
	if !ok {
		platformHttp.RespondProblem(w, r, http.StatusUnauthorized, "Unauthorized", "Tenant context missing", nil)
		return
	}

	var defs []db.CustomFieldDefinition
	err := h.db.WithTenantTx(r.Context(), orgID, func(q *db.Queries) error {
		d, err := q.ListCustomFieldDefinitions(r.Context(), orgID)
		if err != nil {
			return err
		}
		defs = d
		return nil
	})
	if err != nil {
		platformHttp.RespondProblem(w, r, http.StatusInternalServerError, "Internal Server Error", err.Error(), nil)
		return
	}

	platformHttp.RespondJSON(w, http.StatusOK, defs, map[string]any{"count": len(defs)})
}

func (h *Handler) DeleteCustomField(w http.ResponseWriter, r *http.Request) {
	orgID, ok := middleware.GetTenantID(r.Context())
	if !ok {
		platformHttp.RespondProblem(w, r, http.StatusUnauthorized, "Unauthorized", "Tenant context missing", nil)
		return
	}

	fieldIDStr := getParamID(r, "id")
	fieldID, err := uuid.Parse(fieldIDStr)
	if err != nil {
		platformHttp.RespondProblem(w, r, http.StatusBadRequest, "Invalid ID", "Invalid field UUID", nil)
		return
	}

	err = h.db.WithTenantTx(r.Context(), orgID, func(q *db.Queries) error {
		return q.DeleteCustomFieldDefinition(r.Context(), db.DeleteCustomFieldDefinitionParams{
			FieldID: fieldID,
			OrgID:   orgID,
		})
	})
	if err != nil {
		platformHttp.RespondProblem(w, r, http.StatusInternalServerError, "Internal Server Error", err.Error(), nil)
		return
	}

	platformHttp.RespondJSON(w, http.StatusOK, map[string]string{"message": "custom field deleted"}, nil)
}

// ============================================================================
// Suppliers Handlers
// ============================================================================

type CreateSupplierRequest struct {
	Name    string `json:"name"`
	Phone   string `json:"phone,omitempty"`
	Email   string `json:"email,omitempty"`
	Address string `json:"address,omitempty"`
	Notes   string `json:"notes,omitempty"`
}

func (h *Handler) CreateSupplier(w http.ResponseWriter, r *http.Request) {
	orgID, ok := middleware.GetTenantID(r.Context())
	if !ok {
		platformHttp.RespondProblem(w, r, http.StatusUnauthorized, "Unauthorized", "Tenant context missing", nil)
		return
	}

	var req CreateSupplierRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		platformHttp.RespondProblem(w, r, http.StatusBadRequest, "Bad Request", "Malformed JSON body", nil)
		return
	}

	req.Name = strings.TrimSpace(req.Name)
	if req.Name == "" {
		platformHttp.RespondProblem(w, r, http.StatusBadRequest, "Validation Error", "supplier name is required", nil)
		return
	}

	var sup db.Supplier
	err := h.db.WithTenantTx(r.Context(), orgID, func(q *db.Queries) error {
		res, err := q.CreateSupplier(r.Context(), db.CreateSupplierParams{
			OrgID:    orgID,
			Name:     req.Name,
			Phone:    toPgText(req.Phone),
			Email:    toPgText(req.Email),
			Address:  toPgText(req.Address),
			Notes:    toPgText(req.Notes),
			IsActive: true,
		})
		if err != nil {
			return err
		}
		sup = res
		return nil
	})
	if err != nil {
		platformHttp.RespondProblem(w, r, http.StatusUnprocessableEntity, "Failed to Create Supplier", err.Error(), nil)
		return
	}

	platformHttp.RespondJSON(w, http.StatusCreated, sup, nil)
}

func (h *Handler) ListSuppliers(w http.ResponseWriter, r *http.Request) {
	orgID, ok := middleware.GetTenantID(r.Context())
	if !ok {
		platformHttp.RespondProblem(w, r, http.StatusUnauthorized, "Unauthorized", "Tenant context missing", nil)
		return
	}

	var suppliers []db.Supplier
	err := h.db.WithTenantTx(r.Context(), orgID, func(q *db.Queries) error {
		res, err := q.ListSuppliers(r.Context(), orgID)
		if err != nil {
			return err
		}
		suppliers = res
		return nil
	})
	if err != nil {
		platformHttp.RespondProblem(w, r, http.StatusInternalServerError, "Internal Server Error", err.Error(), nil)
		return
	}

	platformHttp.RespondJSON(w, http.StatusOK, suppliers, map[string]any{"count": len(suppliers)})
}

// ============================================================================
// Categories & Units Handlers
// ============================================================================

type CreateCategoryRequest struct {
	Name     string  `json:"name"`
	ParentID *string `json:"parent_id,omitempty"`
}

func (h *Handler) CreateCategory(w http.ResponseWriter, r *http.Request) {
	orgID, ok := middleware.GetTenantID(r.Context())
	if !ok {
		platformHttp.RespondProblem(w, r, http.StatusUnauthorized, "Unauthorized", "Tenant context missing", nil)
		return
	}

	var req CreateCategoryRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		platformHttp.RespondProblem(w, r, http.StatusBadRequest, "Bad Request", "Malformed JSON body", nil)
		return
	}

	var parentUUID *uuid.UUID
	if req.ParentID != nil && *req.ParentID != "" {
		p, err := uuid.Parse(*req.ParentID)
		if err == nil {
			parentUUID = &p
		}
	}

	var cat db.Category
	err := h.db.WithTenantTx(r.Context(), orgID, func(q *db.Queries) error {
		res, err := q.CreateCategory(r.Context(), db.CreateCategoryParams{
			OrgID:    orgID,
			Name:     req.Name,
			ParentID: toPgUUID(parentUUID),
		})
		if err != nil {
			return err
		}
		cat = res
		return nil
	})
	if err != nil {
		platformHttp.RespondProblem(w, r, http.StatusUnprocessableEntity, "Failed to Create Category", err.Error(), nil)
		return
	}

	platformHttp.RespondJSON(w, http.StatusCreated, cat, nil)
}

func (h *Handler) ListCategories(w http.ResponseWriter, r *http.Request) {
	orgID, ok := middleware.GetTenantID(r.Context())
	if !ok {
		platformHttp.RespondProblem(w, r, http.StatusUnauthorized, "Unauthorized", "Tenant context missing", nil)
		return
	}

	var categories []db.Category
	err := h.db.WithTenantTx(r.Context(), orgID, func(q *db.Queries) error {
		res, err := q.ListCategories(r.Context(), orgID)
		if err != nil {
			return err
		}
		categories = res
		return nil
	})
	if err != nil {
		platformHttp.RespondProblem(w, r, http.StatusInternalServerError, "Internal Server Error", err.Error(), nil)
		return
	}

	platformHttp.RespondJSON(w, http.StatusOK, categories, map[string]any{"count": len(categories)})
}

type CreateUOMRequest struct {
	Name   string `json:"name"`
	Symbol string `json:"symbol"`
}

func (h *Handler) CreateUOM(w http.ResponseWriter, r *http.Request) {
	orgID, ok := middleware.GetTenantID(r.Context())
	if !ok {
		platformHttp.RespondProblem(w, r, http.StatusUnauthorized, "Unauthorized", "Tenant context missing", nil)
		return
	}

	var req CreateUOMRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		platformHttp.RespondProblem(w, r, http.StatusBadRequest, "Bad Request", "Malformed JSON body", nil)
		return
	}

	var uom db.UnitsOfMeasure
	err := h.db.WithTenantTx(r.Context(), orgID, func(q *db.Queries) error {
		res, err := q.CreateUOM(r.Context(), db.CreateUOMParams{
			OrgID:  orgID,
			Name:   req.Name,
			Symbol: req.Symbol,
		})
		if err != nil {
			return err
		}
		uom = res
		return nil
	})
	if err != nil {
		platformHttp.RespondProblem(w, r, http.StatusUnprocessableEntity, "Failed to Create Unit", err.Error(), nil)
		return
	}

	platformHttp.RespondJSON(w, http.StatusCreated, uom, nil)
}

func (h *Handler) ListUOMs(w http.ResponseWriter, r *http.Request) {
	orgID, ok := middleware.GetTenantID(r.Context())
	if !ok {
		platformHttp.RespondProblem(w, r, http.StatusUnauthorized, "Unauthorized", "Tenant context missing", nil)
		return
	}

	var uoms []db.UnitsOfMeasure
	err := h.db.WithTenantTx(r.Context(), orgID, func(q *db.Queries) error {
		res, err := q.ListUOMs(r.Context(), orgID)
		if err != nil {
			return err
		}
		uoms = res
		return nil
	})
	if err != nil {
		platformHttp.RespondProblem(w, r, http.StatusInternalServerError, "Internal Server Error", err.Error(), nil)
		return
	}

	platformHttp.RespondJSON(w, http.StatusOK, uoms, map[string]any{"count": len(uoms)})
}

type CreateUOMConversionRequest struct {
	ItemID      *string `json:"item_id,omitempty"`
	FromUnit    string  `json:"from_unit"`
	ToBaseUnit  string  `json:"to_base_unit"`
	Multiplier  float64 `json:"multiplier"`
}

func (h *Handler) CreateUOMConversion(w http.ResponseWriter, r *http.Request) {
	orgID, ok := middleware.GetTenantID(r.Context())
	if !ok {
		platformHttp.RespondProblem(w, r, http.StatusUnauthorized, "Unauthorized", "Tenant context missing", nil)
		return
	}

	var req CreateUOMConversionRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		platformHttp.RespondProblem(w, r, http.StatusBadRequest, "Bad Request", "Malformed JSON body", nil)
		return
	}

	if req.Multiplier <= 0 {
		platformHttp.RespondProblem(w, r, http.StatusBadRequest, "Invalid Multiplier", "multiplier must be greater than zero", nil)
		return
	}

	var itemUUID *uuid.UUID
	if req.ItemID != nil && *req.ItemID != "" {
		id, err := uuid.Parse(*req.ItemID)
		if err == nil {
			itemUUID = &id
		}
	}

	var conv db.UomConversion
	err := h.db.WithTenantTx(r.Context(), orgID, func(q *db.Queries) error {
		res, err := q.CreateUOMConversion(r.Context(), db.CreateUOMConversionParams{
			OrgID:      orgID,
			ItemID:     toPgUUID(itemUUID),
			FromUnit:   req.FromUnit,
			ToBaseUnit: req.ToBaseUnit,
			Multiplier: toPgNumeric(req.Multiplier),
		})
		if err != nil {
			return err
		}
		conv = res
		return nil
	})
	if err != nil {
		platformHttp.RespondProblem(w, r, http.StatusUnprocessableEntity, "Failed to Create Conversion", err.Error(), nil)
		return
	}

	platformHttp.RespondJSON(w, http.StatusCreated, conv, nil)
}

// ============================================================================
// Archive Product Handler (Archive, never hard delete if stock exists)
// ============================================================================

func (h *Handler) ArchiveItem(w http.ResponseWriter, r *http.Request) {
	orgID, ok := middleware.GetTenantID(r.Context())
	if !ok {
		platformHttp.RespondProblem(w, r, http.StatusUnauthorized, "Unauthorized", "Tenant context missing", nil)
		return
	}

	idStr := getParamID(r, "id")
	itemID, err := uuid.Parse(idStr)
	if err != nil {
		platformHttp.RespondProblem(w, r, http.StatusBadRequest, "Invalid ID", "Invalid item UUID", nil)
		return
	}

	pool := h.db.Pool()
	_, err = pool.Exec(r.Context(), `
		UPDATE items
		SET is_active = false, updated_at = CURRENT_TIMESTAMP
		WHERE item_id = $1 AND org_id = $2
	`, itemID, orgID)
	if err != nil {
		platformHttp.RespondProblem(w, r, http.StatusInternalServerError, "Internal Server Error", err.Error(), nil)
		return
	}

	platformHttp.RespondJSON(w, http.StatusOK, map[string]string{
		"message": "Product archived successfully. Historical stock ledger records preserved.",
	}, nil)
}

// ============================================================================
// CSV Product Import with Dry-Run & Row-by-Row Errors
// ============================================================================

type RowError struct {
	Row   int    `json:"row"`
	Field string `json:"field"`
	Error string `json:"error"`
}

type CSVImportResult struct {
	TotalRows int        `json:"total_rows"`
	Imported  int        `json:"imported"`
	DryRun    bool       `json:"dry_run"`
	Errors    []RowError `json:"errors"`
}

func (h *Handler) ImportProductsCSV(w http.ResponseWriter, r *http.Request) {
	orgID, ok := middleware.GetTenantID(r.Context())
	if !ok {
		platformHttp.RespondProblem(w, r, http.StatusUnauthorized, "Unauthorized", "Tenant context missing", nil)
		return
	}

	dryRun := r.URL.Query().Get("dry_run") == "true"

	// Parse multipart file
	err := r.ParseMultipartForm(10 << 20) // 10 MB
	if err != nil {
		platformHttp.RespondProblem(w, r, http.StatusBadRequest, "Bad Request", "Failed to parse multipart form", nil)
		return
	}

	file, _, err := r.FormFile("file")
	if err != nil {
		platformHttp.RespondProblem(w, r, http.StatusBadRequest, "Missing File", "CSV file upload required under field 'file'", nil)
		return
	}
	defer file.Close()

	// Strip potential UTF-8 BOM
	buf, err := io.ReadAll(file)
	if err != nil {
		platformHttp.RespondProblem(w, r, http.StatusBadRequest, "Read Error", "Failed to read CSV content", nil)
		return
	}
	buf = bytes.TrimPrefix(buf, []byte("\xef\xbb\xbf"))

	reader := csv.NewReader(bytes.NewReader(buf))
	header, err := reader.Read()
	if err != nil {
		platformHttp.RespondProblem(w, r, http.StatusBadRequest, "Invalid CSV", "Failed to read CSV header", nil)
		return
	}

	colMap := make(map[string]int)
	for i, h := range header {
		colMap[strings.ToLower(strings.TrimSpace(h))] = i
	}

	skuIdx, hasSKU := colMap["sku"]
	nameIdx, hasName := colMap["name"]
	if !hasSKU || !hasName {
		platformHttp.RespondProblem(w, r, http.StatusBadRequest, "Missing Columns", "CSV must contain at least 'sku' and 'name' columns", nil)
		return
	}

	uomIdx, hasUom := colMap["base_uom"]
	costIdx, hasCost := colMap["cost_price"]
	reorderIdx, hasReorder := colMap["reorder_level"]
	bufferIdx, hasBuffer := colMap["buffer_stock"]

	var rowErrors []RowError
	var validRows []db.CreateItemParams
	rowNum := 1

	for {
		record, err := reader.Read()
		if err == io.EOF {
			break
		}
		rowNum++
		if err != nil {
			rowErrors = append(rowErrors, RowError{Row: rowNum, Field: "csv", Error: err.Error()})
			continue
		}

		sku := strings.TrimSpace(record[skuIdx])
		if sku == "" {
			rowErrors = append(rowErrors, RowError{Row: rowNum, Field: "sku", Error: "sku cannot be empty"})
			continue
		}

		name := strings.TrimSpace(record[nameIdx])
		if name == "" {
			rowErrors = append(rowErrors, RowError{Row: rowNum, Field: "name", Error: "name cannot be empty"})
			continue
		}

		baseUOM := "pcs"
		if hasUom && len(record) > uomIdx && record[uomIdx] != "" {
			baseUOM = strings.TrimSpace(record[uomIdx])
		}

		var costVal, reorderVal, bufferVal float64
		if hasCost && len(record) > costIdx && record[costIdx] != "" {
			costVal, _ = strconv.ParseFloat(strings.TrimSpace(record[costIdx]), 64)
		}
		if hasReorder && len(record) > reorderIdx && record[reorderIdx] != "" {
			reorderVal, _ = strconv.ParseFloat(strings.TrimSpace(record[reorderIdx]), 64)
		}
		if hasBuffer && len(record) > bufferIdx && record[bufferIdx] != "" {
			bufferVal, _ = strconv.ParseFloat(strings.TrimSpace(record[bufferIdx]), 64)
		}

		_ = costVal
		_ = reorderVal
		_ = bufferVal

		validRows = append(validRows, db.CreateItemParams{
			OrgID:           orgID,
			Sku:             sku,
			Name:            name,
			TrackingMode:    "none",
			BaseUom:         baseUOM,
			ValuationMethod: "wac",
			Attributes:      json.RawMessage("{}"),
		})
	}

	result := CSVImportResult{
		TotalRows: rowNum - 1,
		DryRun:    dryRun,
		Errors:    rowErrors,
	}

	if dryRun || len(rowErrors) > 0 {
		result.Imported = 0
		platformHttp.RespondJSON(w, http.StatusOK, result, nil)
		return
	}

	// Insert into DB if not dry run and no errors
	importedCount := 0
	pool := h.db.Pool()
	for _, item := range validRows {
		_, err := pool.Exec(r.Context(), `
			INSERT INTO items (org_id, sku, name, tracking_mode, base_uom, valuation_method, attributes, is_active)
			VALUES ($1, $2, $3, $4, $5, $6, $7, true)
			ON CONFLICT (org_id, sku) DO UPDATE SET name = EXCLUDED.name, is_active = true
		`, item.OrgID, item.Sku, item.Name, item.TrackingMode, item.BaseUom, item.ValuationMethod, item.Attributes)
		if err == nil {
			importedCount++
		}
	}
	result.Imported = importedCount

	platformHttp.RespondJSON(w, http.StatusCreated, result, nil)
}
