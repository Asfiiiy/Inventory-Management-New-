package catalog

import (
	"encoding/json"
	"errors"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"

	"whoopit-core/internal/middleware"
	"whoopit-core/internal/modules/profiles"
	"whoopit-core/internal/platform/database"
	"whoopit-core/internal/platform/db"
	platformHttp "whoopit-core/internal/platform/http"

	"github.com/jackc/pgx/v5/pgconn"
)

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
	Attributes      json.RawMessage `json:"attributes"`
}

// CreateItem validates relational invariants and dynamic JSON schema before writing to DB.
func (h *Handler) CreateItem(w http.ResponseWriter, r *http.Request) {
	orgID, ok := middleware.GetTenantID(r.Context())
	if !ok {
		platformHttp.RespondProblem(w, r, http.StatusUnauthorized, "Unauthorized", "Tenant context missing", nil)
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
	}
	if req.TrackingMode == "" {
		req.TrackingMode = "none"
	}
	if req.BaseUom == "" {
		req.BaseUom = "unit"
	}
	if req.ValuationMethod == "" {
		req.ValuationMethod = "fifo"
	}

	// 2. Dynamic JSON Schema Validation against requested Industry Profile
	if h.validator != nil {
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

	// 3. Execute Transaction
	var createdItem db.Item
	err := h.db.WithTenantTx(r.Context(), orgID, func(q *db.Queries) error {
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
		createdItem = item
		return nil
	})

	if err != nil {
		platformHttp.RespondProblem(w, r, http.StatusInternalServerError, "Internal Server Error", err.Error(), nil)
		return
	}

	platformHttp.RespondJSON(w, http.StatusCreated, createdItem, nil)
}

// ListItems retrieves all catalog items for the tenant.
func (h *Handler) ListItems(w http.ResponseWriter, r *http.Request) {
	orgID, ok := middleware.GetTenantID(r.Context())
	if !ok {
		platformHttp.RespondProblem(w, r, http.StatusUnauthorized, "Unauthorized", "Tenant context missing", nil)
		return
	}

	var items []db.Item
	err := h.db.WithTenantTx(r.Context(), orgID, func(q *db.Queries) error {
		res, err := q.SearchItemsByAttribute(r.Context(), db.SearchItemsByAttributeParams{
			OrgID:      orgID,
			Attributes: []byte("{}"),
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

	var item db.Item
	err = h.db.WithTenantTx(r.Context(), orgID, func(q *db.Queries) error {
		res, err := q.GetItemByID(r.Context(), db.GetItemByIDParams{
			ItemID: itemID,
			OrgID:  orgID,
		})
		if err != nil {
			return err
		}
		item = res
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

	platformHttp.RespondJSON(w, http.StatusOK, item, nil)
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

// DeleteItem removes a catalog item, enforcing that only 'admin' accounts can perform deletions.
func (h *Handler) DeleteItem(w http.ResponseWriter, r *http.Request) {
	orgID, ok := middleware.GetTenantID(r.Context())
	if !ok {
		platformHttp.RespondProblem(w, r, http.StatusUnauthorized, "Unauthorized", "Tenant context missing", nil)
		return
	}

	role, _ := middleware.GetUserRole(r.Context())
	if role == "staff" {
		platformHttp.RespondProblem(
			w, r, http.StatusForbidden,
			"Forbidden: Action Restricted",
			"Staff accounts are blocked from deleting products. Only Administrators may delete catalog items.",
			nil,
		)
		return
	}

	idStr := chi.URLParam(r, "id")
	itemID, err := uuid.Parse(idStr)
	if err != nil {
		platformHttp.RespondProblem(w, r, http.StatusBadRequest, "Bad Request", "Invalid item UUID parameter", nil)
		return
	}

	var tag pgconn.CommandTag
	err = h.db.WithTenantTxRaw(r.Context(), orgID, func(q *db.Queries, tx pgx.Tx) error {
		var execErr error
		tag, execErr = tx.Exec(r.Context(), "DELETE FROM items WHERE item_id = $1 AND org_id = $2", itemID, orgID)
		return execErr
	})

	if err != nil {
		platformHttp.RespondProblem(w, r, http.StatusInternalServerError, "Internal Server Error", err.Error(), nil)
		return
	}

	if tag.RowsAffected() == 0 {
		platformHttp.RespondProblem(w, r, http.StatusNotFound, "Not Found", "Item not found within organization scope", nil)
		return
	}

	platformHttp.RespondJSON(w, http.StatusOK, map[string]interface{}{
		"deleted": true,
		"item_id": itemID,
	}, nil)
}
