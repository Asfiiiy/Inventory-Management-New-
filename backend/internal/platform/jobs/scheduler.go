package jobs

import (
	"context"
	"fmt"
	"log/slog"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"whoopit-core/internal/platform/entitlement"
	"whoopit-core/internal/platform/mail"
)

// FinanceDossierBuilder builds a finance CSV/HTML email for one org (wired from inventory).
type FinanceMailer interface {
	SendMonthlyFinanceEmail(ctx context.Context, orgID uuid.UUID, recipient string) error
}

// Scheduler runs lightweight periodic Phase-2 mail jobs without requiring River migrations.
type Scheduler struct {
	pool          *pgxpool.Pool
	financeMailer FinanceMailer
	stop          chan struct{}
}

func NewScheduler(pool *pgxpool.Pool, financeMailer FinanceMailer) *Scheduler {
	return &Scheduler{
		pool:          pool,
		financeMailer: financeMailer,
		stop:          make(chan struct{}),
	}
}

func (s *Scheduler) Start() {
	go s.loop()
	slog.Info("phase2 mail scheduler started", slog.String("interval", "1h"))
}

func (s *Scheduler) Stop() {
	select {
	case <-s.stop:
	default:
		close(s.stop)
	}
}

func (s *Scheduler) loop() {
	// Run once shortly after boot, then hourly.
	timer := time.NewTimer(45 * time.Second)
	defer timer.Stop()
	ticker := time.NewTicker(1 * time.Hour)
	defer ticker.Stop()

	for {
		select {
		case <-s.stop:
			return
		case <-timer.C:
			s.runOnce()
		case <-ticker.C:
			s.runOnce()
		}
	}
}

func (s *Scheduler) runOnce() {
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer cancel()
	if err := s.sendTrialNotices(ctx); err != nil {
		slog.Warn("trial notice job failed", slog.Any("error", err))
	}
	if err := s.sendMonthlyFinance(ctx); err != nil {
		slog.Warn("monthly finance job failed", slog.Any("error", err))
	}
}

func (s *Scheduler) sendTrialNotices(ctx context.Context) error {
	rows, err := s.pool.Query(ctx, `
		SELECT o.org_id, o.name, COALESCE(o.plan,''), o.trial_ends_at,
		       COALESCE(os.alert_email::text, ''),
		       os.last_trial_notice_at
		FROM organizations o
		LEFT JOIN organization_settings os ON os.org_id = o.org_id
		WHERE LOWER(COALESCE(o.plan,'')) = 'trial'
		  AND o.trial_ends_at IS NOT NULL
	`)
	if err != nil {
		return err
	}
	defer rows.Close()

	now := time.Now()
	for rows.Next() {
		var orgID uuid.UUID
		var name, plan, alertEmail string
		var trialEnds *time.Time
		var lastNotice *time.Time
		if err := rows.Scan(&orgID, &name, &plan, &trialEnds, &alertEmail, &lastNotice); err != nil {
			return err
		}
		if !strings.Contains(alertEmail, "@") || trialEnds == nil {
			continue
		}
		expired, days := entitlement.TrialWindow(plan, trialEnds, now)
		// Notify at T-7, T-1, and once after expiry.
		should := false
		label := ""
		switch {
		case expired && (lastNotice == nil || lastNotice.Before(*trialEnds)):
			should = true
			label = "expired"
		case !expired && days <= 1 && days >= 0:
			should = lastNotice == nil || now.Sub(*lastNotice) > 20*time.Hour
			label = "ends tomorrow"
		case !expired && days <= 7 && days > 1:
			should = lastNotice == nil || now.Sub(*lastNotice) > 6*24*time.Hour
			label = fmt.Sprintf("%d days left", days)
		}
		if !should {
			continue
		}

		subject := fmt.Sprintf("[Whoopit] Trial %s — %s", label, name)
		html := fmt.Sprintf(`
			<div style="font-family:Segoe UI,Arial,sans-serif;max-width:560px;color:#0f172a">
			  <h2 style="color:#0c3843">Trial notice</h2>
			  <p>Company <strong>%s</strong> trial status: <strong>%s</strong>.</p>
			  <p>Trial ends: %s</p>
			  <p>Ask your SuperAdmin to extend the trial or upgrade the plan.</p>
			  <p><a href="%s/login">Open Whoopit</a></p>
			</div>`,
			name, label, trialEnds.Format("02 Jan 2006 15:04"), mail.PublicAppURL(),
		)
		if _, err := mail.Send(alertEmail, subject, html, ""); err != nil {
			slog.Warn("trial email failed", slog.String("org", name), slog.Any("error", err))
			continue
		}
		_, _ = s.pool.Exec(ctx, `
			UPDATE organization_settings SET last_trial_notice_at = CURRENT_TIMESTAMP WHERE org_id = $1
		`, orgID)
		slog.Info("sent trial notice", slog.String("org", name), slog.String("label", label))
	}
	return rows.Err()
}

func (s *Scheduler) sendMonthlyFinance(ctx context.Context) error {
	if s.financeMailer == nil {
		return nil
	}
	// Only run on day 1 of the month (UTC) or if never sent and today is day 1-2.
	day := time.Now().UTC().Day()
	if day > 2 {
		return nil
	}

	rows, err := s.pool.Query(ctx, `
		SELECT o.org_id, o.name, COALESCE(o.plan,''),
		       COALESCE(os.alert_email::text, ''),
		       os.last_finance_email_at
		FROM organizations o
		JOIN organization_settings os ON os.org_id = o.org_id
		WHERE LOWER(COALESCE(o.plan,'')) IN ('enterprise', 'standard')
		  AND COALESCE(os.alert_email::text, '') LIKE '%@%'
	`)
	if err != nil {
		return err
	}
	defer rows.Close()

	now := time.Now().UTC()
	monthStart := time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, time.UTC)

	for rows.Next() {
		var orgID uuid.UUID
		var name, plan, alertEmail string
		var lastAt *time.Time
		if err := rows.Scan(&orgID, &name, &plan, &alertEmail, &lastAt); err != nil {
			return err
		}
		if lastAt != nil && !lastAt.Before(monthStart) {
			continue
		}
		// Enterprise always; standard only if plan allows finance email (entitlement).
		snap, err := entitlement.Load(ctx, s.pool, orgID)
		if err != nil || snap.FinanceEmailError() != nil {
			continue
		}
		if err := s.financeMailer.SendMonthlyFinanceEmail(ctx, orgID, alertEmail); err != nil {
			slog.Warn("monthly finance email failed", slog.String("org", name), slog.Any("error", err))
			continue
		}
		_, _ = s.pool.Exec(ctx, `
			UPDATE organization_settings SET last_finance_email_at = CURRENT_TIMESTAMP WHERE org_id = $1
		`, orgID)
		slog.Info("sent monthly finance email", slog.String("org", name))
	}
	return rows.Err()
}
