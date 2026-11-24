package catalog

import (
	"bytes"
	"encoding/csv"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"

	"whoopit-core/internal/middleware"
	"whoopit-core/internal/platform/db"
	"whoopit-core/internal/platform/entitlement"
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

	platformHttp.RespondJSON(w, http.StatusCreated, toSupplierDTO(sup), nil)
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

	out := make([]supplierDTO, 0, len(suppliers))
	for _, supplier := range suppliers {
		out = append(out, toSupplierDTO(supplier))
	}
	platformHttp.RespondJSON(w, http.StatusOK, out, map[string]any{"count": len(out)})
}

func (h *Handler) UpdateSupplier(w http.ResponseWriter, r *http.Request) {
	orgID, ok := middleware.GetTenantID(r.Context())
	if !ok {
		platformHttp.RespondProblem(w, r, http.StatusUnauthorized, "Unauthorized", "Tenant context missing", nil)
		return
	}

	supplierID, err := uuid.Parse(getParamID(r, "id"))
	if err != nil {
		platformHttp.RespondProblem(w, r, http.StatusBadRequest, "Invalid ID", "Invalid supplier ID", nil)
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

	var updated db.Supplier
	err = h.db.WithTenantTx(r.Context(), orgID, func(q *db.Queries) error {
		if _, err := q.GetSupplierByID(r.Context(), db.GetSupplierByIDParams{
			SupplierID: supplierID,
			OrgID:      orgID,
		}); err != nil {
			return err
		}
		res, err := q.UpdateSupplier(r.Context(), db.UpdateSupplierParams{
			SupplierID: supplierID,
			OrgID:      orgID,
			Name:       req.Name,
			Phone:      toPgText(req.Phone),
			Email:      toPgText(req.Email),
			Address:    toPgText(req.Address),
			Notes:      toPgText(req.Notes),
			IsActive:   true,
		})
		if err != nil {
			return err
		}
		updated = res
		return nil
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			platformHttp.RespondProblem(w, r, http.StatusNotFound, "Not Found", "Supplier not found", nil)
			return
		}
		platformHttp.RespondProblem(w, r, http.StatusUnprocessableEntity, "Failed to Update Supplier", err.Error(), nil)
		return
	}

	platformHttp.RespondJSON(w, http.StatusOK, toSupplierDTO(updated), nil)
}

func (h *Handler) DeleteSupplier(w http.ResponseWriter, r *http.Request) {
	orgID, ok := middleware.GetTenantID(r.Context())
	if !ok {
		platformHttp.RespondProblem(w, r, http.StatusUnauthorized, "Unauthorized", "Tenant context missing", nil)
		return
	}

	supplierID, err := uuid.Parse(getParamID(r, "id"))
	if err != nil {
		platformHttp.RespondProblem(w, r, http.StatusBadRequest, "Invalid ID", "Invalid supplier ID", nil)
		return
	}

	err = h.db.WithTenantTx(r.Context(), orgID, func(q *db.Queries) error {
		current, err := q.GetSupplierByID(r.Context(), db.GetSupplierByIDParams{
			SupplierID: supplierID,
			OrgID:      orgID,
		})
		if err != nil {
			return err
		}
		_, err = q.UpdateSupplier(r.Context(), db.UpdateSupplierParams{
			SupplierID: supplierID,
			OrgID:      orgID,
			Name:       current.Name,
			Phone:      current.Phone,
			Email:      current.Email,
			Address:    current.Address,
			Notes:      current.Notes,
			IsActive:   false,
		})
		return err
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			platformHttp.RespondProblem(w, r, http.StatusNotFound, "Not Found", "Supplier not found", nil)
			return
		}
		platformHttp.RespondProblem(w, r, http.StatusUnprocessableEntity, "Failed to Remove Supplier", err.Error(), nil)
		return
	}

	platformHttp.RespondJSON(w, http.StatusOK, map[string]any{"removed": true}, nil)
}

type supplierDTO struct {
	SupplierID string `json:"supplier_id"`
	Name       string `json:"name"`
	Phone      string `json:"phone"`
	Email      string `json:"email"`
	Address    string `json:"address"`
	Notes      string `json:"notes"`
	IsActive   bool   `json:"is_active"`
}

func toSupplierDTO(s db.Supplier) supplierDTO {
	return supplierDTO{
		SupplierID: s.SupplierID.String(),
		Name:       s.Name,
		Phone:      s.Phone.String,
		Email:      s.Email.String,
		Address:    s.Address.String,
		Notes:      s.Notes.String,
		IsActive:   s.IsActive,
	}
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
	sellingIdx, hasSelling := colMap["selling_price"]
	reorderIdx, hasReorder := colMap["reorder_level"]
	bufferIdx, hasBuffer := colMap["buffer_stock"]

	type ValidCSVRow struct {
		OrgID        uuid.UUID
		Sku          string
		Name         string
		BaseUom      string
		CostPrice    float64
		SellingPrice float64
		ReorderLevel float64
		BufferStock  float64
	}

	var rowErrors []RowError
	var validRows []ValidCSVRow
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
		if catalogTextLooksUnsafe(name) || catalogTextLooksUnsafe(sku) {
			rowErrors = append(rowErrors, RowError{Row: rowNum, Field: "name", Error: "sku/name must not contain HTML, scripts, or markup"})
			continue
		}

		baseUOM := "pcs"
		if hasUom && len(record) > uomIdx && record[uomIdx] != "" {
			baseUOM = strings.TrimSpace(record[uomIdx])
		}

		var costVal, sellingVal, reorderVal, bufferVal float64
		if hasCost && len(record) > costIdx && record[costIdx] != "" {
			costVal, _ = strconv.ParseFloat(strings.TrimSpace(record[costIdx]), 64)
		}
		if hasSelling && len(record) > sellingIdx && record[sellingIdx] != "" {
			sellingVal, _ = strconv.ParseFloat(strings.TrimSpace(record[sellingIdx]), 64)
		}
		if costVal < 0 || sellingVal < 0 {
			rowErrors = append(rowErrors, RowError{Row: rowNum, Field: "cost_price", Error: "cost_price and selling_price must be >= 0"})
			continue
		}
		if hasReorder && len(record) > reorderIdx && record[reorderIdx] != "" {
			reorderVal, _ = strconv.ParseFloat(strings.TrimSpace(record[reorderIdx]), 64)
		}
		if hasBuffer && len(record) > bufferIdx && record[bufferIdx] != "" {
			bufferVal, _ = strconv.ParseFloat(strings.TrimSpace(record[bufferIdx]), 64)
		}

		validRows = append(validRows, ValidCSVRow{
			OrgID:        orgID,
			Sku:          sku,
			Name:         name,
			BaseUom:      baseUOM,
			CostPrice:    costVal,
			SellingPrice: sellingVal,
			ReorderLevel: reorderVal,
			BufferStock:  bufferVal,
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

	skus := make([]string, len(validRows))
	for i, item := range validRows {
		skus[i] = item.Sku
	}
	var existing int
	if len(skus) > 0 {
		if err := h.db.Pool().QueryRow(r.Context(), `SELECT COUNT(*) FROM items WHERE org_id = $1 AND sku = ANY($2::text[])`, orgID, skus).Scan(&existing); err != nil {
			platformHttp.RespondProblem(w, r, http.StatusInternalServerError, "License Check Failed", "Could not verify the workspace item limit.", nil)
			return
		}
	}
	adding := len(validRows) - existing
	if adding < 0 {
		adding = 0
	}
	if err := entitlement.CheckAdditionalItems(r.Context(), h.db.Pool(), orgID, adding); err != nil {
		var pe *entitlement.PlanError
		if errors.As(err, &pe) {
			platformHttp.RespondProblem(w, r, pe.HTTPStatus, pe.Title, pe.Detail, nil)
			return
		}
		platformHttp.RespondProblem(w, r, http.StatusInternalServerError, "License Check Failed", "Could not verify the workspace plan.", nil)
		return
	}

	// Insert into DB if not dry run and no errors
	importedCount := 0
	pool := h.db.Pool()
	for _, item := range validRows {
		_, err := pool.Exec(r.Context(), `
			INSERT INTO items (org_id, sku, name, tracking_mode, base_uom, valuation_method, attributes, cost_price, selling_price, reorder_level, buffer_stock, is_active)
			VALUES ($1, $2, $3, 'none', $4, 'wac', '{}'::jsonb, $5, $6, $7, $8, true)
			ON CONFLICT (org_id, sku) DO UPDATE SET 
				name = EXCLUDED.name, 
				base_uom = EXCLUDED.base_uom,
				cost_price = EXCLUDED.cost_price,
				selling_price = EXCLUDED.selling_price,
				reorder_level = EXCLUDED.reorder_level,
				buffer_stock = EXCLUDED.buffer_stock,
				is_active = true
		`, item.OrgID, item.Sku, item.Name, item.BaseUom, item.CostPrice, item.SellingPrice, item.ReorderLevel, item.BufferStock)
		if err == nil {
			importedCount++
		}
	}
	result.Imported = importedCount

	platformHttp.RespondJSON(w, http.StatusCreated, result, nil)
}
