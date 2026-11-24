package catalog

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"regexp"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"

	"whoopit-core/internal/middleware"
	"whoopit-core/internal/modules/profiles"
	"whoopit-core/internal/platform/database"
	"whoopit-core/internal/platform/entitlement"
	"whoopit-core/internal/platform/db"
	platformHttp "whoopit-core/internal/platform/http"
)

// Reject angle-bracket markup / common XSS vectors in free-text catalog fields.
var unsafeMarkupPattern = regexp.MustCompile(`(?i)<[^>]*>|javascript:|onerror\s*=|onload\s*=|onclick\s*=`)

func catalogTextLooksUnsafe(value string) bool {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return false
	}
	return unsafeMarkupPattern.MatchString(trimmed) ||
		strings.Contains(trimmed, "<") ||
		strings.Contains(trimmed, ">")
}

// Handler manages HTTP endpoints for locations and the dynamic catalog items.
type Handler struct {
	db        *database.TenantDB
	validator *profiles.SchemaValidator
}

// NewHandler constructs a new Catalog Handler.
func NewHandler(tdb *database.TenantDB, validator *profiles.SchemaValidator) *Handler {
	return &Handler{
		db:        tdb,
		validator: validator,
	}
}

// -----------------------------------------------------------------------------
// Locations Handlers
// -----------------------------------------------------------------------------

type CreateLocationRequest struct {
	Name     string `json:"name"`
	Category string `json:"category"`
	ParentID string `json:"parent_id,omitempty"`
}

// CreateLocation creates a new storage/inventory location within the tenant's ltree hierarchy.
func (h *Handler) CreateLocation(w http.ResponseWriter, r *http.Request) {
	orgID, ok := middleware.GetTenantID(r.Context())
	if !ok {
		platformHttp.RespondProblem(w, r, http.StatusUnauthorized, "Unauthorized", "Tenant context missing", nil)
		return
	}

	var req CreateLocationRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		platformHttp.RespondProblem(w, r, http.StatusBadRequest, "Bad Request", "Malformed JSON payload", nil)
		return
	}

	if req.Name == "" {
		platformHttp.RespondProblem(w, r, http.StatusUnprocessableEntity, "Validation Error", "Invalid location data", []platformHttp.ValidationErrorDetail{
			{Field: "name", Message: "location name is required"},
		})
		return
	}

	var parentUUID pgtype.UUID
	if req.ParentID != "" {
		pID, err := uuid.Parse(req.ParentID)
		if err != nil {
			platformHttp.RespondProblem(w, r, http.StatusUnprocessableEntity, "Validation Error", "Invalid parent_id UUID", []platformHttp.ValidationErrorDetail{
				{Field: "parent_id", Message: "parent_id must be a valid UUID"},
			})
			return
		}
		parentUUID = pgtype.UUID{Bytes: pID, Valid: true}
	}

	var createdLoc db.Location
	err := h.db.WithTenantTx(r.Context(), orgID, func(q *db.Queries) error {
		loc, err := q.CreateLocation(r.Context(), db.CreateLocationParams{
			OrgID:    orgID,
			Name:     req.Name,
			Category: req.Category,
			ParentID: parentUUID,
		})
		if err != nil {
			return err
		}
		createdLoc = loc
		return nil
	})

	if err != nil {
		platformHttp.RespondProblem(w, r, http.StatusInternalServerError, "Internal Server Error", err.Error(), nil)
		return
	}

	platformHttp.RespondJSON(w, http.StatusCreated, createdLoc, nil)
}

// ListLocations retrieves locations for the tenant, supporting ltree subtree containment.
func (h *Handler) ListLocations(w http.ResponseWriter, r *http.Request) {
	orgID, ok := middleware.GetTenantID(r.Context())
	if !ok {
		platformHttp.RespondProblem(w, r, http.StatusUnauthorized, "Unauthorized", "Tenant context missing", nil)
		return
	}

	subtreePath := r.URL.Query().Get("subtree_path")
	parentIDStr := r.URL.Query().Get("parent_id")

	var locations []db.Location
	err := h.db.WithTenantTx(r.Context(), orgID, func(q *db.Queries) error {
		var err error
		if subtreePath != "" {
			locations, err = q.GetSubtreeLocations(r.Context(), db.GetSubtreeLocationsParams{
				OrgID: orgID,
				Path:  subtreePath,
			})
		} else {
			var parentUUID pgtype.UUID
			if parentIDStr != "" {
				pID, parseErr := uuid.Parse(parentIDStr)
				if parseErr == nil {
					parentUUID = pgtype.UUID{Bytes: pID, Valid: true}
				}
			}
			locations, err = q.ListLocationsByParent(r.Context(), db.ListLocationsByParentParams{
				OrgID:    orgID,
				ParentID: parentUUID,
			})
		}
		return err
	})

	if err != nil {
		platformHttp.RespondProblem(w, r, http.StatusInternalServerError, "Internal Server Error", err.Error(), nil)
		return
	}

	platformHttp.RespondJSON(w, http.StatusOK, locations, map[string]interface{}{"count": len(locations)})
}

// -----------------------------------------------------------------------------
// Items Master Handlers
// -----------------------------------------------------------------------------

type CreateItemRequest struct {
	Sku             string          `json:"sku"`
	Name            string          `json:"name"`
	TrackingMode    string          `json:"tracking_mode"`
	BaseUom         string          `json:"base_uom"`
	ValuationMethod string          `json:"valuation_method,omitempty"`
	Barcode         string          `json:"barcode,omitempty"`
	CostPrice       float64         `json:"cost_price,omitempty"`
	SellingPrice    float64         `json:"selling_price,omitempty"`
	ReorderLevel    float64         `json:"reorder_level,omitempty"`
	BufferStock     float64         `json:"buffer_stock,omitempty"`
	CategoryID      *string         `json:"category_id,omitempty"`
	SupplierID      *string         `json:"supplier_id,omitempty"`
	Attributes      json.RawMessage `json:"attributes"`
}

// CreateItem validates relational invariants, dynamic custom fields, and schema before writing to DB.
func (h *Handler) CreateItem(w http.ResponseWriter, r *http.Request) {
	orgID, ok := middleware.GetTenantID(r.Context())
	if !ok {
		platformHttp.RespondProblem(w, r, http.StatusUnauthorized, "Unauthorized", "Tenant context missing", nil)
		return
	}

	if err := entitlement.CheckAdditionalItems(r.Context(), h.db.Pool(), orgID, 1); err != nil {
		var pe *entitlement.PlanError
		if errors.As(err, &pe) {
			platformHttp.RespondProblem(w, r, pe.HTTPStatus, pe.Title, pe.Detail, nil)
			return
		}
		platformHttp.RespondProblem(w, r, http.StatusInternalServerError, "License Check Failed", "Could not verify the workspace plan.", nil)
		return
	}

	profile := r.URL.Query().Get("profile")

	var req CreateItemRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		platformHttp.RespondProblem(w, r, http.StatusBadRequest, "Bad Request", "Malformed JSON body", nil)
		return
	}

	// 1. Relational Invariants Validation
	var validationErrors []platformHttp.ValidationErrorDetail
	if req.Sku == "" {
		validationErrors = append(validationErrors, platformHttp.ValidationErrorDetail{
			Field:   "sku",
			Message: "sku is a required relational invariant field",
		})
	}
	if req.Name == "" {
		validationErrors = append(validationErrors, platformHttp.ValidationErrorDetail{
			Field:   "name",
			Message: "name is a required relational invariant field",
		})
	} else if catalogTextLooksUnsafe(req.Name) {
		validationErrors = append(validationErrors, platformHttp.ValidationErrorDetail{
			Field:   "name",
			Message: "name must not contain HTML, scripts, or markup",
		})
	}
	if catalogTextLooksUnsafe(req.Sku) {
		validationErrors = append(validationErrors, platformHttp.ValidationErrorDetail{
			Field:   "sku",
			Message: "sku must not contain HTML, scripts, or markup",
		})
	}
	if req.CostPrice < 0 {
		validationErrors = append(validationErrors, platformHttp.ValidationErrorDetail{
			Field:   "cost_price",
			Message: "cost_price must be greater than or equal to 0",
		})
	}
	if req.SellingPrice < 0 {
		validationErrors = append(validationErrors, platformHttp.ValidationErrorDetail{
			Field:   "selling_price",
			Message: "selling_price must be greater than or equal to 0",
		})
	}
	if req.TrackingMode == "" {
		req.TrackingMode = "none"
	}
	if req.BaseUom == "" {
		req.BaseUom = "pcs"
	}
	if req.ValuationMethod == "" {
		req.ValuationMethod = "wac"
	}

	// 2. Validate against dynamic custom field definitions (Phase B3)
	dynErrors, err := ValidateDynamicCustomFields(r.Context(), h.db, orgID, req.Attributes)
	if err == nil && len(dynErrors) > 0 {
		validationErrors = append(validationErrors, dynErrors...)
	}

	// 3. Dynamic JSON Schema Validation against requested Industry Profile (legacy backward compatibility)
	if h.validator != nil && profile != "" {
		attrErrors, err := h.validator.ValidateAttributes(profile, req.Attributes)
		if err != nil {
			platformHttp.RespondProblem(w, r, http.StatusBadRequest, "Invalid Profile", err.Error(), nil)
			return
		}
		if len(attrErrors) > 0 {
			validationErrors = append(validationErrors, attrErrors...)
		}
	}

	// If any validation faults exist, reject with HTTP 422 Unprocessable Entity
	if len(validationErrors) > 0 {
		platformHttp.RespondProblem(
			w, r, http.StatusUnprocessableEntity,
			"Unprocessable Entity: Schema Validation Fault",
			"One or more invariant or dynamic schema validations failed.",
			validationErrors,
		)
		return
	}

	var catUUID, supUUID *uuid.UUID
	if req.CategoryID != nil && *req.CategoryID != "" {
		id, err := uuid.Parse(*req.CategoryID)
		if err == nil {
			catUUID = &id
		}
	}
	if req.SupplierID != nil && *req.SupplierID != "" {
		id, err := uuid.Parse(*req.SupplierID)
		if err == nil {
			supUUID = &id
		}
	}

	// 4. Execute Transaction
	var createdItem db.Item
	err = h.db.WithTenantTxRaw(r.Context(), orgID, func(q *db.Queries, tx pgx.Tx) error {
		attrs := req.Attributes
		if len(attrs) == 0 {
			attrs = json.RawMessage("{}")
		}

		item, err := q.CreateItem(r.Context(), db.CreateItemParams{
			OrgID:           orgID,
			Sku:             req.Sku,
			Name:            req.Name,
			TrackingMode:    req.TrackingMode,
			BaseUom:         req.BaseUom,
			ValuationMethod: req.ValuationMethod,
			Attributes:      attrs,
		})
		if err != nil {
			return err
		}

		// Update extended fields within the exact same transaction
		var updatedItem db.Item
		err = tx.QueryRow(r.Context(), `
			UPDATE items
			SET barcode = COALESCE(NULLIF($3, ''), barcode),
			    cost_price = $4,
			    selling_price = $5,
			    reorder_level = $6,
			    buffer_stock = $7,
			    category_id = $8,
			    supplier_id = $9
			WHERE item_id = $1 AND org_id = $2
			RETURNING *
		`, item.ItemID, orgID, req.Barcode, req.CostPrice, req.SellingPrice, req.ReorderLevel, req.BufferStock, catUUID, supUUID).Scan(
			&updatedItem.ItemID, &updatedItem.OrgID, &updatedItem.Sku, &updatedItem.Name,
			&updatedItem.TrackingMode, &updatedItem.BaseUom, &updatedItem.ValuationMethod,
			&updatedItem.Attributes, &updatedItem.IsActive, &updatedItem.CreatedAt, &updatedItem.UpdatedAt,
			&updatedItem.ReorderLevel, &updatedItem.BufferStock, &updatedItem.CostPrice,
			&updatedItem.SellingPrice, &updatedItem.CategoryID, &updatedItem.SupplierID,
			&updatedItem.Barcode, &updatedItem.ImageUrl,
		)
		if err != nil {
			createdItem = item
			return nil
		}
		createdItem = updatedItem
		return nil
	})

	if err != nil {
		platformHttp.RespondProblem(w, r, http.StatusInternalServerError, "Internal Server Error", err.Error(), nil)
		return
	}

	platformHttp.RespondJSON(w, http.StatusCreated, createdItem, nil)
}

// ListItems retrieves catalog items for the tenant with search and category filtering.
func (h *Handler) ListItems(w http.ResponseWriter, r *http.Request) {
	orgID, ok := middleware.GetTenantID(r.Context())
	if !ok {
		platformHttp.RespondProblem(w, r, http.StatusUnauthorized, "Unauthorized", "Tenant context missing", nil)
		return
	}

	search := strings.TrimSpace(r.URL.Query().Get("search"))
	categoryID := strings.TrimSpace(r.URL.Query().Get("category_id"))

	query := `
		SELECT 
			i.item_id, i.org_id, i.sku, i.name, i.tracking_mode,
			i.base_uom, i.valuation_method, i.attributes, i.is_active,
			i.created_at, i.updated_at, i.reorder_level, i.buffer_stock,
			i.cost_price, i.selling_price, i.category_id, i.supplier_id,
			i.barcode, i.image_url,
			COALESCE((SELECT SUM(sb.on_hand) FROM stock_balances sb WHERE sb.item_id = i.item_id AND sb.org_id = i.org_id), 0)::float8 AS total_on_hand,
			COALESCE((SELECT SUM(a.quantity) FROM asset_assignments a WHERE a.asset_id = i.item_id AND a.org_id = i.org_id AND a.returned_at IS NULL), 0)::float8 AS assigned_count,
			COALESCE((SELECT SUM(r.quantity) FROM asset_repairs r WHERE r.item_id = i.item_id AND r.org_id = i.org_id AND r.status = 'FAULTY'), 0)::float8 AS faulty_count,
			COALESCE((SELECT SUM(r.quantity) FROM asset_repairs r WHERE r.item_id = i.item_id AND r.org_id = i.org_id AND r.status = 'AT_VENDOR'), 0)::float8 AS in_repair_count,
			COALESCE((SELECT SUM(r.quantity) FROM asset_repairs r WHERE r.item_id = i.item_id AND r.org_id = i.org_id AND r.status = 'REPAIRED'), 0)::float8 AS repaired_count,
			COALESCE((SELECT SUM(r.quantity) FROM asset_repairs r WHERE r.item_id = i.item_id AND r.org_id = i.org_id AND r.status = 'SCRAPPED'), 0)::float8 AS scrapped_count
		FROM items i
		WHERE i.org_id = $1 AND i.is_active = true
	`
	args := []any{orgID}
	argIdx := 2

	if categoryID != "" {
		if cUUID, err := uuid.Parse(categoryID); err == nil {
			query += fmt.Sprintf(" AND i.category_id = $%d", argIdx)
			args = append(args, cUUID)
			argIdx++
		}
	}

	if search != "" {
		searchPattern := "%" + search + "%"
		query += fmt.Sprintf(" AND (i.sku ILIKE $%d OR i.name ILIKE $%d OR i.barcode ILIKE $%d)", argIdx, argIdx, argIdx)
		args = append(args, searchPattern)
		argIdx++
	}

	query += " ORDER BY i.name ASC"

	pool := h.db.Pool()
	rows, err := pool.Query(r.Context(), query, args...)
	if err != nil {
		platformHttp.RespondProblem(w, r, http.StatusInternalServerError, "Internal Server Error", err.Error(), nil)
		return
	}
	defer rows.Close()

	type ItemWithStock struct {
		db.Item
		TotalOnHand   float64 `json:"total_on_hand"`
		AssignedCount float64 `json:"assigned_count"`
		FaultyCount   float64 `json:"faulty_count"`
		InRepairCount float64 `json:"in_repair_count"`
		RepairedCount float64 `json:"repaired_count"`
		ScrappedCount float64 `json:"scrapped_count"`
		TotalOwned    float64 `json:"total_owned"`
	}

	var items []ItemWithStock
	for rows.Next() {
		var it ItemWithStock
		err := rows.Scan(
			&it.ItemID, &it.OrgID, &it.Sku, &it.Name, &it.TrackingMode,
			&it.BaseUom, &it.ValuationMethod, &it.Attributes, &it.IsActive,
			&it.CreatedAt, &it.UpdatedAt, &it.ReorderLevel, &it.BufferStock,
			&it.CostPrice, &it.SellingPrice, &it.CategoryID, &it.SupplierID,
			&it.Barcode, &it.ImageUrl,
			&it.TotalOnHand,
			&it.AssignedCount,
			&it.FaultyCount,
			&it.InRepairCount,
			&it.RepairedCount,
			&it.ScrappedCount,
		)
		if err != nil {
			platformHttp.RespondProblem(w, r, http.StatusInternalServerError, "Scan Error", err.Error(), nil)
			return
		}
		it.TotalOwned = it.TotalOnHand + it.AssignedCount + it.FaultyCount + it.InRepairCount
		items = append(items, it)
	}

	platformHttp.RespondJSON(w, http.StatusOK, items, map[string]interface{}{"count": len(items)})
}

// GetItemByID fetches a specific item ensuring strict tenant boundary isolation.
func (h *Handler) GetItemByID(w http.ResponseWriter, r *http.Request) {
	orgID, ok := middleware.GetTenantID(r.Context())
	if !ok {
		platformHttp.RespondProblem(w, r, http.StatusUnauthorized, "Unauthorized", "Tenant context missing", nil)
		return
	}

	idStr := chi.URLParam(r, "id")
	itemID, err := uuid.Parse(idStr)
	if err != nil {
		platformHttp.RespondProblem(w, r, http.StatusBadRequest, "Bad Request", "Invalid item UUID parameter", nil)
		return
	}

	query := `
		SELECT 
			i.item_id, i.org_id, i.sku, i.name, i.tracking_mode,
			i.base_uom, i.valuation_method, i.attributes, i.is_active,
			i.created_at, i.updated_at, i.reorder_level, i.buffer_stock,
			i.cost_price, i.selling_price, i.category_id, i.supplier_id,
			i.barcode, i.image_url,
			COALESCE((SELECT SUM(sb.on_hand) FROM stock_balances sb WHERE sb.item_id = i.item_id AND sb.org_id = i.org_id), 0)::float8 AS total_on_hand,
			COALESCE((SELECT SUM(a.quantity) FROM asset_assignments a WHERE a.asset_id = i.item_id AND a.org_id = i.org_id AND a.returned_at IS NULL), 0)::float8 AS assigned_count,
			COALESCE((SELECT SUM(r.quantity) FROM asset_repairs r WHERE r.item_id = i.item_id AND r.org_id = i.org_id AND r.status = 'FAULTY'), 0)::float8 AS faulty_count,
			COALESCE((SELECT SUM(r.quantity) FROM asset_repairs r WHERE r.item_id = i.item_id AND r.org_id = i.org_id AND r.status = 'AT_VENDOR'), 0)::float8 AS in_repair_count,
			COALESCE((SELECT SUM(r.quantity) FROM asset_repairs r WHERE r.item_id = i.item_id AND r.org_id = i.org_id AND r.status = 'REPAIRED'), 0)::float8 AS repaired_count,
			COALESCE((SELECT SUM(r.quantity) FROM asset_repairs r WHERE r.item_id = i.item_id AND r.org_id = i.org_id AND r.status = 'SCRAPPED'), 0)::float8 AS scrapped_count
		FROM items i
		WHERE i.org_id = $1 AND i.item_id = $2 AND i.is_active = true
	`
	pool := h.db.Pool()
	var it struct {
		db.Item
		TotalOnHand   float64 `json:"total_on_hand"`
		AssignedCount float64 `json:"assigned_count"`
		FaultyCount   float64 `json:"faulty_count"`
		InRepairCount float64 `json:"in_repair_count"`
		RepairedCount float64 `json:"repaired_count"`
		ScrappedCount float64 `json:"scrapped_count"`
		TotalOwned    float64 `json:"total_owned"`
	}
	err = pool.QueryRow(r.Context(), query, orgID, itemID).Scan(
		&it.ItemID, &it.OrgID, &it.Sku, &it.Name, &it.TrackingMode,
		&it.BaseUom, &it.ValuationMethod, &it.Attributes, &it.IsActive,
		&it.CreatedAt, &it.UpdatedAt, &it.ReorderLevel, &it.BufferStock,
		&it.CostPrice, &it.SellingPrice, &it.CategoryID, &it.SupplierID,
		&it.Barcode, &it.ImageUrl,
		&it.TotalOnHand,
		&it.AssignedCount,
		&it.FaultyCount,
		&it.InRepairCount,
		&it.RepairedCount,
		&it.ScrappedCount,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			platformHttp.RespondProblem(w, r, http.StatusNotFound, "Not Found", "Item not found within organization scope", nil)
			return
		}
		platformHttp.RespondProblem(w, r, http.StatusInternalServerError, "Internal Server Error", err.Error(), nil)
		return
	}
	it.TotalOwned = it.TotalOnHand + it.AssignedCount + it.FaultyCount + it.InRepairCount

	platformHttp.RespondJSON(w, http.StatusOK, it, nil)
}

type SearchItemsRequest struct {
	Attributes json.RawMessage `json:"attributes"`
}

// SearchItems queries items using PostgreSQL JSONB containment indexing.
func (h *Handler) SearchItems(w http.ResponseWriter, r *http.Request) {
	orgID, ok := middleware.GetTenantID(r.Context())
	if !ok {
		platformHttp.RespondProblem(w, r, http.StatusUnauthorized, "Unauthorized", "Tenant context missing", nil)
		return
	}

	var req SearchItemsRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		platformHttp.RespondProblem(w, r, http.StatusBadRequest, "Bad Request", "Malformed JSON body", nil)
		return
	}

	var items []db.Item
	err := h.db.WithTenantTx(r.Context(), orgID, func(q *db.Queries) error {
		res, err := q.SearchItemsByAttribute(r.Context(), db.SearchItemsByAttributeParams{
			OrgID:      orgID,
			Attributes: req.Attributes,
		})
		if err != nil {
			return err
		}
		items = res
		return nil
	})

	if err != nil {
		platformHttp.RespondProblem(w, r, http.StatusInternalServerError, "Internal Server Error", err.Error(), nil)
		return
	}

	platformHttp.RespondJSON(w, http.StatusOK, items, map[string]interface{}{"count": len(items)})
}

type UpdateItemRequest struct {
	Sku             *string          `json:"sku,omitempty"`
	Name            *string          `json:"name,omitempty"`
	TrackingMode    *string          `json:"tracking_mode,omitempty"`
	BaseUom         *string          `json:"base_uom,omitempty"`
	ValuationMethod *string          `json:"valuation_method,omitempty"`
	Barcode         *string          `json:"barcode,omitempty"`
	CostPrice       *float64         `json:"cost_price,omitempty"`
	SellingPrice    *float64         `json:"selling_price,omitempty"`
	ReorderLevel    *float64         `json:"reorder_level,omitempty"`
	BufferStock     *float64         `json:"buffer_stock,omitempty"`
	CategoryID      *string          `json:"category_id,omitempty"`
	SupplierID      *string          `json:"supplier_id,omitempty"`
	Attributes      *json.RawMessage `json:"attributes,omitempty"`
}

// UpdateItem updates properties of an existing catalog item.
func (h *Handler) UpdateItem(w http.ResponseWriter, r *http.Request) {
	orgID, ok := middleware.GetTenantID(r.Context())
	if !ok {
		platformHttp.RespondProblem(w, r, http.StatusUnauthorized, "Unauthorized", "Tenant context missing", nil)
		return
	}

	idStr := chi.URLParam(r, "id")
	itemID, err := uuid.Parse(idStr)
	if err != nil {
		platformHttp.RespondProblem(w, r, http.StatusBadRequest, "Bad Request", "Invalid item UUID parameter", nil)
		return
	}

	var req UpdateItemRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		platformHttp.RespondProblem(w, r, http.StatusBadRequest, "Bad Request", "Malformed JSON body", nil)
		return
	}

	var updateErrors []platformHttp.ValidationErrorDetail
	if req.Name != nil {
		if strings.TrimSpace(*req.Name) == "" {
			updateErrors = append(updateErrors, platformHttp.ValidationErrorDetail{
				Field: "name", Message: "name cannot be empty",
			})
		} else if catalogTextLooksUnsafe(*req.Name) {
			updateErrors = append(updateErrors, platformHttp.ValidationErrorDetail{
				Field: "name", Message: "name must not contain HTML, scripts, or markup",
			})
		}
	}
	if req.Sku != nil && catalogTextLooksUnsafe(*req.Sku) {
		updateErrors = append(updateErrors, platformHttp.ValidationErrorDetail{
			Field: "sku", Message: "sku must not contain HTML, scripts, or markup",
		})
	}
	if req.CostPrice != nil && *req.CostPrice < 0 {
		updateErrors = append(updateErrors, platformHttp.ValidationErrorDetail{
			Field: "cost_price", Message: "cost_price must be greater than or equal to 0",
		})
	}
	if req.SellingPrice != nil && *req.SellingPrice < 0 {
		updateErrors = append(updateErrors, platformHttp.ValidationErrorDetail{
			Field: "selling_price", Message: "selling_price must be greater than or equal to 0",
		})
	}
	if len(updateErrors) > 0 {
		platformHttp.RespondProblem(
			w, r, http.StatusUnprocessableEntity,
			"Unprocessable Entity: Schema Validation Fault",
			"One or more invariant validations failed.",
			updateErrors,
		)
		return
	}

	// Dynamic validation if attributes were provided
	if req.Attributes != nil && len(*req.Attributes) > 0 {
		dynErrors, dynErr := ValidateDynamicCustomFields(r.Context(), h.db, orgID, *req.Attributes)
		if dynErr == nil && len(dynErrors) > 0 {
			platformHttp.RespondProblem(
				w, r, http.StatusUnprocessableEntity,
				"Unprocessable Entity: Schema Validation Fault",
				"One or more dynamic schema validations failed.",
				dynErrors,
			)
			return
		}
	}

	var updatedItem db.Item
	err = h.db.WithTenantTxRaw(r.Context(), orgID, func(q *db.Queries, tx pgx.Tx) error {
		var catUUID, supUUID *uuid.UUID
		if req.CategoryID != nil && *req.CategoryID != "" {
			if id, err := uuid.Parse(*req.CategoryID); err == nil {
				catUUID = &id
			}
		}
		if req.SupplierID != nil && *req.SupplierID != "" {
			if id, err := uuid.Parse(*req.SupplierID); err == nil {
				supUUID = &id
			}
		}

		return tx.QueryRow(r.Context(), `
			UPDATE items
			SET sku = COALESCE($3, sku),
			    name = COALESCE($4, name),
			    base_uom = COALESCE($5, base_uom),
			    barcode = COALESCE($6, barcode),
			    cost_price = COALESCE($7, cost_price),
			    selling_price = COALESCE($8, selling_price),
			    reorder_level = COALESCE($9, reorder_level),
			    buffer_stock = COALESCE($10, buffer_stock),
			    category_id = COALESCE($11, category_id),
			    supplier_id = COALESCE($12, supplier_id),
			    attributes = CASE 
			        WHEN $13::jsonb IS NOT NULL THEN items.attributes || $13::jsonb 
			        ELSE items.attributes 
			    END,
			    updated_at = NOW()
			WHERE item_id = $1 AND org_id = $2
			RETURNING *
		`, itemID, orgID, req.Sku, req.Name, req.BaseUom, req.Barcode,
			req.CostPrice, req.SellingPrice, req.ReorderLevel, req.BufferStock,
			catUUID, supUUID, req.Attributes).Scan(
			&updatedItem.ItemID, &updatedItem.OrgID, &updatedItem.Sku, &updatedItem.Name,
			&updatedItem.TrackingMode, &updatedItem.BaseUom, &updatedItem.ValuationMethod,
			&updatedItem.Attributes, &updatedItem.IsActive, &updatedItem.CreatedAt, &updatedItem.UpdatedAt,
			&updatedItem.ReorderLevel, &updatedItem.BufferStock, &updatedItem.CostPrice,
			&updatedItem.SellingPrice, &updatedItem.CategoryID, &updatedItem.SupplierID,
			&updatedItem.Barcode, &updatedItem.ImageUrl,
		)
	})

	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			platformHttp.RespondProblem(w, r, http.StatusNotFound, "Not Found", "Item not found", nil)
			return
		}
		platformHttp.RespondProblem(w, r, http.StatusInternalServerError, "Internal Server Error", err.Error(), nil)
		return
	}

	platformHttp.RespondJSON(w, http.StatusOK, updatedItem, nil)
}

// DeleteItem removes a catalog item or gracefully archives it if movements exist.
func (h *Handler) DeleteItem(w http.ResponseWriter, r *http.Request) {
	orgID, ok := middleware.GetTenantID(r.Context())
	if !ok {
		platformHttp.RespondProblem(w, r, http.StatusUnauthorized, "Unauthorized", "Tenant context missing", nil)
		return
	}

	idStr := chi.URLParam(r, "id")
	itemID, err := uuid.Parse(idStr)
	if err != nil {
		platformHttp.RespondProblem(w, r, http.StatusBadRequest, "Bad Request", "Invalid item UUID parameter", nil)
		return
	}

	var wasArchived bool
	err = h.db.WithTenantTxRaw(r.Context(), orgID, func(q *db.Queries, tx pgx.Tx) error {
		var hasReferences bool
		err := tx.QueryRow(r.Context(), `
			SELECT EXISTS (
				SELECT 1 FROM stock_moves WHERE item_id = $1
				UNION ALL
				SELECT 1 FROM asset_assignments WHERE asset_id = $1
			)
		`, itemID).Scan(&hasReferences)
		if err != nil {
			return err
		}

		if hasReferences {
			tag, execErr := tx.Exec(r.Context(), "UPDATE items SET is_active = false, updated_at = NOW() WHERE item_id = $1 AND org_id = $2", itemID, orgID)
			if execErr != nil {
				return execErr
			}
			if tag.RowsAffected() == 0 {
				return pgx.ErrNoRows
			}
			wasArchived = true
			return nil
		}

		tag, execErr := tx.Exec(r.Context(), "DELETE FROM items WHERE item_id = $1 AND org_id = $2", itemID, orgID)
		if execErr != nil {
			return execErr
		}
		if tag.RowsAffected() == 0 {
			return pgx.ErrNoRows
		}
		return nil
	})

	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			platformHttp.RespondProblem(w, r, http.StatusNotFound, "Not Found", "Item not found within organization scope", nil)
			return
		}
		platformHttp.RespondProblem(w, r, http.StatusInternalServerError, "Internal Server Error", err.Error(), nil)
		return
	}

	platformHttp.RespondJSON(w, http.StatusOK, map[string]interface{}{
		"deleted":  true,
		"archived": wasArchived,
		"item_id":  itemID,
	}, nil)
}
