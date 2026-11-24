package superadmin

import (
	"context"
	"encoding/csv"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/google/uuid"

	platformHttp "whoopit-core/internal/platform/http"
)

// ExportAuditLogs streams a compliance CSV of platform audit events.
func (h *Handler) ExportAuditLogs(w http.ResponseWriter, r *http.Request) {
	limit := 2000
	if v := strings.TrimSpace(r.URL.Query().Get("limit")); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 && n <= 10000 {
			limit = n
		}
	}

	from := strings.TrimSpace(r.URL.Query().Get("from"))
	to := strings.TrimSpace(r.URL.Query().Get("to"))

	logs, err := h.service.ExportAuditLogs(r.Context(), limit, from, to)
	if err != nil {
		platformHttp.RespondProblem(w, r, http.StatusInternalServerError, "Internal Server Error", err.Error(), nil)
		return
	}

	filename := fmt.Sprintf("whoopit_audit_export_%s.csv", time.Now().Format("2006-01-02"))
	w.Header().Set("Content-Type", "text/csv; charset=utf-8")
	w.Header().Set("Content-Disposition", fmt.Sprintf(`attachment; filename="%s"`, filename))
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write([]byte{0xEF, 0xBB, 0xBF})

	cw := csv.NewWriter(w)
	_ = cw.Write([]string{"audit_id", "org_id", "org_name", "action", "entity_type", "entity_id", "user_email", "ip_address", "created_at"})
	for _, ev := range logs {
		_ = cw.Write([]string{
			ev.AuditID.String(),
			ev.OrgID.String(),
			ev.OrgName,
			ev.Action,
			ev.EntityType,
			ev.EntityID,
			ev.UserEmail,
			ev.IPAddress,
			ev.CreatedAt.Format(time.RFC3339),
		})
	}
	cw.Flush()
}

func (s *Service) ExportAuditLogs(ctx context.Context, limit int, from, to string) ([]AuditEvent, error) {
	if limit <= 0 || limit > 10000 {
		limit = 2000
	}
	pool := s.tdb.Pool()
	tx, err := pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)
	_, _ = tx.Exec(ctx, "SET LOCAL row_security = off")

	q := `
		SELECT
			a.audit_id,
			a.org_id,
			COALESCE(o.name, 'Global') AS org_name,
			a.action,
			a.entity_type,
			COALESCE(a.entity_id::text, ''),
			COALESCE(u.email, 'system@whoopit.io') AS user_email,
			a.created_at,
			COALESCE(a.ip_address::text, '127.0.0.1') AS ip_address
		FROM audit_log a
		LEFT JOIN organizations o ON o.org_id = a.org_id
		LEFT JOIN users u ON u.user_id = a.user_id
		WHERE 1=1`
	args := []any{}
	argN := 1
	if from != "" {
		if t, err := time.Parse("2006-01-02", from); err == nil {
			q += fmt.Sprintf(` AND a.created_at >= $%d`, argN)
			args = append(args, t)
			argN++
		}
	}
	if to != "" {
		if t, err := time.Parse("2006-01-02", to); err == nil {
			q += fmt.Sprintf(` AND a.created_at < $%d`, argN)
			args = append(args, t.Add(24*time.Hour))
			argN++
		}
	}
	q += fmt.Sprintf(` ORDER BY a.created_at DESC LIMIT $%d`, argN)
	args = append(args, limit)

	rows, err := tx.Query(ctx, q, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var list []AuditEvent
	for rows.Next() {
		var ev AuditEvent
		if err := rows.Scan(&ev.AuditID, &ev.OrgID, &ev.OrgName, &ev.Action, &ev.EntityType, &ev.EntityID, &ev.UserEmail, &ev.CreatedAt, &ev.IPAddress); err != nil {
			return nil, err
		}
		if ev.OrgID == uuid.Nil {
			// keep zero value
		}
		list = append(list, ev)
	}
	return list, rows.Err()
}
