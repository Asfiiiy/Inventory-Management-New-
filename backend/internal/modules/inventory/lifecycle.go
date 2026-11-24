package inventory

import (
	"net/http"
	"sort"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"whoopit-core/internal/middleware"
	platformHttp "whoopit-core/internal/platform/http"
)

type LifecycleEvent struct {
	At          time.Time `json:"at"`
	Kind        string    `json:"kind"`
	Label       string    `json:"label"`
	Detail      string    `json:"detail"`
	Reference   string    `json:"reference,omitempty"`
	Actor       string    `json:"actor,omitempty"`
	Serial      string    `json:"serial,omitempty"`
}

type ItemLifecycleResponse struct {
	ItemID string           `json:"item_id"`
	Events []LifecycleEvent `json:"events"`
}

func (h *Handler) GetItemLifecycle(w http.ResponseWriter, r *http.Request) {
	orgID, ok := middleware.GetTenantID(r.Context())
	if !ok {
		platformHttp.RespondProblem(w, r, http.StatusUnauthorized, "Unauthorized", "Tenant context missing", nil)
		return
	}
	itemID, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		platformHttp.RespondProblem(w, r, http.StatusBadRequest, "Invalid ID", "Invalid item id", nil)
		return
	}

	pool := h.service.db.Pool()
	events := make([]LifecycleEvent, 0, 32)

	moveRows, err := pool.Query(r.Context(), `
		SELECT created_at, move_type::text, COALESCE(reference_code, ''), COALESCE(usage_target, ''), quantity::float8
		FROM stock_moves
		WHERE org_id = $1 AND item_id = $2
		ORDER BY created_at DESC
		LIMIT 200
	`, orgID, itemID)
	if err != nil {
		platformHttp.RespondProblem(w, r, http.StatusInternalServerError, "Internal Server Error", err.Error(), nil)
		return
	}
	for moveRows.Next() {
		var at time.Time
		var moveType, ref, usage string
		var qty float64
		if err := moveRows.Scan(&at, &moveType, &ref, &usage, &qty); err != nil {
			moveRows.Close()
			platformHttp.RespondProblem(w, r, http.StatusInternalServerError, "Internal Server Error", err.Error(), nil)
			return
		}
		label, kind := classifyMove(moveType)
		events = append(events, LifecycleEvent{
			At:        at,
			Kind:      kind,
			Label:     label,
			Detail:    strings.TrimSpace(usage),
			Reference: ref,
		})
	}
	moveRows.Close()

	assignRows, err := pool.Query(r.Context(), `
		SELECT checkout_date, returned_at, COALESCE(employee_name, ''), COALESCE(employee_code, ''),
		       COALESCE(serial_number, ''), COALESCE(employee_department, '')
		FROM asset_assignments
		WHERE org_id = $1 AND asset_id = $2
		ORDER BY checkout_date DESC
		LIMIT 100
	`, orgID, itemID)
	if err != nil {
		platformHttp.RespondProblem(w, r, http.StatusInternalServerError, "Internal Server Error", err.Error(), nil)
		return
	}
	for assignRows.Next() {
		var checkout time.Time
		var returned *time.Time
		var empName, empCode, serial, dept string
		if err := assignRows.Scan(&checkout, &returned, &empName, &empCode, &serial, &dept); err != nil {
			assignRows.Close()
			platformHttp.RespondProblem(w, r, http.StatusInternalServerError, "Internal Server Error", err.Error(), nil)
			return
		}
		actor := empName
		if empCode != "" {
			actor = empName + " (" + empCode + ")"
		}
		events = append(events, LifecycleEvent{
			At:     checkout,
			Kind:   "assigned",
			Label:  "Assigned to staff",
			Detail: dept,
			Actor:  actor,
			Serial: serial,
		})
		if returned != nil {
			events = append(events, LifecycleEvent{
				At:     *returned,
				Kind:   "returned",
				Label:  "Returned to store",
				Actor:  actor,
				Serial: serial,
			})
		}
	}
	assignRows.Close()

	repairRows, err := pool.Query(r.Context(), `
		SELECT created_at, status, COALESCE(serial_number, ''), COALESCE(vendor_name, ''),
		       COALESCE(issue_description, ''), COALESCE(ticket_reference, ''),
		       sent_date, repaired_date
		FROM asset_repairs
		WHERE org_id = $1 AND item_id = $2
		ORDER BY created_at DESC
		LIMIT 100
	`, orgID, itemID)
	if err != nil {
		platformHttp.RespondProblem(w, r, http.StatusInternalServerError, "Internal Server Error", err.Error(), nil)
		return
	}
	for repairRows.Next() {
		var created time.Time
		var status, serial, vendor, issue, ticket string
		var sent, repaired *time.Time
		if err := repairRows.Scan(&created, &status, &serial, &vendor, &issue, &ticket, &sent, &repaired); err != nil {
			repairRows.Close()
			platformHttp.RespondProblem(w, r, http.StatusInternalServerError, "Internal Server Error", err.Error(), nil)
			return
		}
		events = append(events, LifecycleEvent{
			At:        created,
			Kind:      "repair",
			Label:     "Faulty / repair logged",
			Detail:    issue,
			Reference: ticket,
			Serial:    serial,
		})
		if sent != nil {
			events = append(events, LifecycleEvent{
				At:     *sent,
				Kind:   "repair",
				Label:  "Sent to vendor",
				Detail: vendor,
				Serial: serial,
			})
		}
		if repaired != nil {
			label := "Repaired / restored"
			if strings.EqualFold(status, "SCRAPPED") {
				label = "Scrapped"
			}
			events = append(events, LifecycleEvent{
				At:     *repaired,
				Kind:   "repair",
				Label:  label,
				Detail: vendor,
				Serial: serial,
			})
		}
	}
	repairRows.Close()

	sort.Slice(events, func(i, j int) bool {
		return events[i].At.After(events[j].At)
	})

	platformHttp.RespondJSON(w, http.StatusOK, ItemLifecycleResponse{
		ItemID: itemID.String(),
		Events: events,
	}, map[string]any{"count": len(events)})
}

func classifyMove(moveType string) (label, kind string) {
	mt := strings.ToUpper(strings.TrimSpace(moveType))
	switch {
	case strings.Contains(mt, "CUSTODY_CHECKOUT"):
		return "Custody checkout move", "assigned"
	case strings.Contains(mt, "CUSTODY_CHECKIN"), strings.Contains(mt, "CUSTODY_RETURN"):
		return "Custody return move", "returned"
	case strings.Contains(mt, "IN"), strings.Contains(mt, "RECEIPT"), strings.Contains(mt, "PURCHASE"):
		return "Stock received into store", "in_store"
	case strings.Contains(mt, "SCRAP"), strings.Contains(mt, "LOSS"):
		return "Scrapped / written off", "scrapped"
	case strings.Contains(mt, "OUT"), strings.Contains(mt, "DISPATCH"):
		return "Stock dispatched", "out"
	case strings.Contains(mt, "ADJUST"):
		return "Stock adjustment", "adjustment"
	default:
		return "Stock movement (" + moveType + ")", "move"
	}
}
