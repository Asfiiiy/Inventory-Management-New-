package inventory

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"whoopit-core/internal/middleware"
	platformHttp "whoopit-core/internal/platform/http"
	"whoopit-core/internal/platform/mail"
)

type WarrantyAlertItem struct {
	ItemID     string `json:"item_id"`
	Sku        string `json:"sku"`
	Name       string `json:"name"`
	FieldKey   string `json:"field_key"`
	ExpiryDate string `json:"expiry_date"`
	DaysLeft   int    `json:"days_left"`
	Status     string `json:"status"` // overdue | due_soon
}

type WarrantyAlertsResponse struct {
	DaysWindow int                 `json:"days_window"`
	Count      int                 `json:"count"`
	Items      []WarrantyAlertItem `json:"items"`
	AlertEmail string              `json:"alert_email,omitempty"`
}

var warrantyAttrKeys = []string{
	"warranty_expiry",
	"Warranty Expiry",
	"Warranty Expiry Date",
	"amc_expiry",
	"AMC Expiry",
	"AMC Expiry Date",
}

func (h *Handler) GetWarrantyAlerts(w http.ResponseWriter, r *http.Request) {
	orgID, ok := middleware.GetTenantID(r.Context())
	if !ok {
		platformHttp.RespondProblem(w, r, http.StatusUnauthorized, "Unauthorized", "Tenant context missing", nil)
		return
	}
	days := 30
	if raw := strings.TrimSpace(r.URL.Query().Get("days")); raw != "" {
		if n, err := strconv.Atoi(raw); err == nil && n > 0 && n <= 365 {
			days = n
		}
	}

	items, alertEmail, err := h.collectWarrantyAlerts(r.Context(), orgID, days)
	if err != nil {
		platformHttp.RespondProblem(w, r, http.StatusInternalServerError, "Internal Server Error", err.Error(), nil)
		return
	}
	platformHttp.RespondJSON(w, http.StatusOK, WarrantyAlertsResponse{
		DaysWindow: days,
		Count:      len(items),
		Items:      items,
		AlertEmail: alertEmail,
	}, map[string]any{"count": len(items)})
}

type warrantyEmailRequest struct {
	RecipientEmail string `json:"recipient_email"`
	Days           int    `json:"days"`
}

func (h *Handler) EmailWarrantyAlerts(w http.ResponseWriter, r *http.Request) {
	orgID, ok := middleware.GetTenantID(r.Context())
	if !ok {
		platformHttp.RespondProblem(w, r, http.StatusUnauthorized, "Unauthorized", "Tenant context missing", nil)
		return
	}

	var req warrantyEmailRequest
	_ = json.NewDecoder(r.Body).Decode(&req)
	days := req.Days
	if days <= 0 {
		days = 30
	}

	items, alertEmail, err := h.collectWarrantyAlerts(r.Context(), orgID, days)
	if err != nil {
		platformHttp.RespondProblem(w, r, http.StatusInternalServerError, "Internal Server Error", err.Error(), nil)
		return
	}

	recipient := strings.TrimSpace(req.RecipientEmail)
	if recipient == "" {
		recipient = alertEmail
	}
	if recipient == "" || !strings.Contains(recipient, "@") {
		platformHttp.RespondProblem(w, r, http.StatusUnprocessableEntity, "Validation Error", "Set Workspace alert email or pass recipient_email", nil)
		return
	}
	if len(items) == 0 {
		platformHttp.RespondProblem(w, r, http.StatusUnprocessableEntity, "Nothing to Send", "No warranty or AMC dates fall inside this window", nil)
		return
	}

	var rows strings.Builder
	for _, item := range items {
		rows.WriteString(fmt.Sprintf(
			`<tr><td style="padding:8px;border:1px solid #e2e8f0">%s</td><td style="padding:8px;border:1px solid #e2e8f0">%s</td><td style="padding:8px;border:1px solid #e2e8f0">%s</td><td style="padding:8px;border:1px solid #e2e8f0">%d</td><td style="padding:8px;border:1px solid #e2e8f0">%s</td></tr>`,
			item.Sku, item.Name, item.ExpiryDate, item.DaysLeft, item.Status,
		))
	}
	dash := mail.PublicAppURL() + "/dashboard"
	html := fmt.Sprintf(`
		<div style="font-family:Segoe UI,Arial,sans-serif;color:#0f172a">
		  <h2 style="color:#0c3843">Warranty / AMC digest</h2>
		  <p>%d item(s) are overdue or due within %d days.</p>
		  <table style="border-collapse:collapse;width:100%%;font-size:13px">
		    <thead><tr style="background:#f8fafc">
		      <th style="padding:8px;border:1px solid #e2e8f0;text-align:left">SKU</th>
		      <th style="padding:8px;border:1px solid #e2e8f0;text-align:left">Name</th>
		      <th style="padding:8px;border:1px solid #e2e8f0;text-align:left">Expiry</th>
		      <th style="padding:8px;border:1px solid #e2e8f0;text-align:left">Days</th>
		      <th style="padding:8px;border:1px solid #e2e8f0;text-align:left">Status</th>
		    </tr></thead>
		    <tbody>%s</tbody>
		  </table>
		  <p><a href="%s">Open dashboard</a></p>
		</div>`, len(items), days, rows.String(), dash)
	text := fmt.Sprintf("%d warranty/AMC alerts (window %d days). Open %s\n", len(items), days, dash)
	result, err := mail.Send(recipient, fmt.Sprintf("Warranty / AMC digest (%d)", len(items)), html, text)
	if err != nil {
		platformHttp.RespondProblem(w, r, http.StatusBadGateway, "Email Delivery Failed", err.Error(), nil)
		return
	}
	platformHttp.RespondJSON(w, http.StatusOK, map[string]any{
		"sent":        true,
		"recipient":   recipient,
		"count":       len(items),
		"smtp_relay":  result.Relay,
		"mailpit_url": mail.MailpitURL(),
	}, nil)
}

func (h *Handler) EmailLowStockDigest(w http.ResponseWriter, r *http.Request) {
	orgID, ok := middleware.GetTenantID(r.Context())
	if !ok {
		platformHttp.RespondProblem(w, r, http.StatusUnauthorized, "Unauthorized", "Tenant context missing", nil)
		return
	}

	var body struct {
		RecipientEmail string `json:"recipient_email"`
	}
	_ = json.NewDecoder(r.Body).Decode(&body)

	alertEmail, _ := h.getAlertEmail(r.Context(), orgID)
	recipient := strings.TrimSpace(body.RecipientEmail)
	if recipient == "" {
		recipient = alertEmail
	}
	if recipient == "" || !strings.Contains(recipient, "@") {
		platformHttp.RespondProblem(w, r, http.StatusUnprocessableEntity, "Validation Error", "Set Workspace alert email or pass recipient_email", nil)
		return
	}

	pool := h.service.db.Pool()
	var count int
	err := pool.QueryRow(r.Context(), `
		SELECT COUNT(*)::int
		FROM items i
		LEFT JOIN LATERAL (
			SELECT COALESCE(SUM(sb.on_hand), 0) AS on_hand
			FROM stock_balances sb
			WHERE sb.org_id = i.org_id AND sb.item_id = i.item_id
		) bal ON true
		WHERE i.org_id = $1
		  AND i.is_active = true
		  AND COALESCE((i.attributes->>'reorder_level')::numeric, 0) > 0
		  AND COALESCE(bal.on_hand, 0) <= COALESCE((i.attributes->>'reorder_level')::numeric, 0)
	`, orgID).Scan(&count)
	if err != nil {
		platformHttp.RespondProblem(w, r, http.StatusInternalServerError, "Internal Server Error", err.Error(), nil)
		return
	}
	if count == 0 {
		platformHttp.RespondProblem(w, r, http.StatusUnprocessableEntity, "Nothing to Send", "No low-stock items right now", nil)
		return
	}

	dash := mail.PublicAppURL() + "/dashboard"
	html := fmt.Sprintf(`
		<div style="font-family:Segoe UI,Arial,sans-serif;color:#0f172a">
		  <h2 style="color:#0c3843">Low stock alert</h2>
		  <p><strong>%d</strong> item(s) are at or below reorder level.</p>
		  <p><a href="%s">Review on the dashboard</a></p>
		</div>`, count, dash)
	text := fmt.Sprintf("%d low-stock items. Open %s\n", count, dash)
	result, err := mail.Send(recipient, fmt.Sprintf("Low stock alert (%d items)", count), html, text)
	if err != nil {
		platformHttp.RespondProblem(w, r, http.StatusBadGateway, "Email Delivery Failed", err.Error(), nil)
		return
	}
	platformHttp.RespondJSON(w, http.StatusOK, map[string]any{
		"sent":        true,
		"recipient":   recipient,
		"count":       count,
		"smtp_relay":  result.Relay,
		"mailpit_url": mail.MailpitURL(),
	}, nil)
}

func (h *Handler) collectWarrantyAlerts(ctx context.Context, orgID uuid.UUID, days int) ([]WarrantyAlertItem, string, error) {
	alertEmail, _ := h.getAlertEmail(ctx, orgID)
	pool := h.service.db.Pool()
	rows, err := pool.Query(ctx, `
		SELECT item_id, sku, name, COALESCE(attributes, '{}'::jsonb)
		FROM items
		WHERE org_id = $1 AND is_active = true
	`, orgID)
	if err != nil {
		return nil, alertEmail, err
	}
	defer rows.Close()

	now := time.Now().UTC().Truncate(24 * time.Hour)
	horizon := now.AddDate(0, 0, days)
	out := make([]WarrantyAlertItem, 0)
	for rows.Next() {
		var itemID uuid.UUID
		var sku, name string
		var attrsRaw []byte
		if err := rows.Scan(&itemID, &sku, &name, &attrsRaw); err != nil {
			return nil, alertEmail, err
		}
		var attrs map[string]any
		_ = json.Unmarshal(attrsRaw, &attrs)
		for _, key := range warrantyAttrKeys {
			raw, ok := attrs[key]
			if !ok || raw == nil {
				continue
			}
			expiry, ok := parseFlexibleDate(fmt.Sprint(raw))
			if !ok {
				continue
			}
			expiryDay := expiry.UTC().Truncate(24 * time.Hour)
			if expiryDay.After(horizon) {
				continue
			}
			daysLeft := int(expiryDay.Sub(now).Hours() / 24)
			status := "due_soon"
			if daysLeft < 0 {
				status = "overdue"
			}
			out = append(out, WarrantyAlertItem{
				ItemID:     itemID.String(),
				Sku:        sku,
				Name:       name,
				FieldKey:   key,
				ExpiryDate: expiryDay.Format("2006-01-02"),
				DaysLeft:   daysLeft,
				Status:     status,
			})
			break
		}
	}
	return out, alertEmail, rows.Err()
}

func (h *Handler) getAlertEmail(ctx context.Context, orgID uuid.UUID) (string, error) {
	var email *string
	err := h.service.db.Pool().QueryRow(ctx, `
		SELECT alert_email::text FROM organization_settings WHERE org_id = $1
	`, orgID).Scan(&email)
	if err != nil {
		if err == pgx.ErrNoRows || strings.Contains(err.Error(), "no rows") {
			return "", nil
		}
		return "", err
	}
	if email == nil {
		return "", nil
	}
	return strings.TrimSpace(*email), nil
}

func parseFlexibleDate(raw string) (time.Time, bool) {
	raw = strings.TrimSpace(raw)
	if raw == "" || raw == "<nil>" {
		return time.Time{}, false
	}
	layouts := []string{
		time.RFC3339,
		"2006-01-02",
		"02 Jan 2006",
		"01/02/2006",
		"02/01/2006",
		"2006/01/02",
	}
	for _, layout := range layouts {
		if t, err := time.Parse(layout, raw); err == nil {
			return t, true
		}
	}
	if len(raw) >= 10 {
		if t, err := time.Parse("2006-01-02", raw[:10]); err == nil {
			return t, true
		}
	}
	return time.Time{}, false
}
