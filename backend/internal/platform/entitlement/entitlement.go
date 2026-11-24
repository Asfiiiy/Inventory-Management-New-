package entitlement

import (
	"context"
	"errors"
	"fmt"
	"math"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

const (
	PlanEnterprise = "enterprise"
	PlanStandard   = "standard"
	PlanTrial      = "trial"
	PlanSuspended  = "suspended"

	TrialItemCap    = 200
	StandardItemCap = 5000
	TrialLength     = 30 * 24 * time.Hour
)

// PlanError is a commercial-license denial safe to return to the client.
type PlanError struct {
	HTTPStatus int
	Title      string
	Detail     string
}

func (e *PlanError) Error() string {
	if e == nil {
		return ""
	}
	return e.Detail
}

// Snapshot is the license state of one organization at a point in time.
type Snapshot struct {
	Found               bool
	Plan                string
	TrialEndsAt         *time.Time
	TrialExpired        bool
	TrialDaysRemaining  int
}

// TrialWindow reports whether a trial is over and how many calendar days are left.
// A missing end date is treated as expired so a trial cannot run without a cutoff.
func TrialWindow(plan string, ends *time.Time, now time.Time) (expired bool, daysRemaining int) {
	if !strings.EqualFold(strings.TrimSpace(plan), PlanTrial) {
		return false, 0
	}
	if ends == nil || !now.Before(*ends) {
		return true, 0
	}
	days := int(math.Ceil(ends.Sub(now).Hours() / 24))
	if days < 1 {
		days = 1
	}
	return false, days
}

// EffectiveTrialEndSQL is the SELECT expression for the real trial cutoff.
// Trials created before trial_ends_at existed end 30 days after the organization was created.
const EffectiveTrialEndSQL = `COALESCE(trial_ends_at, CASE WHEN lower(COALESCE(plan, '')) = 'trial' THEN created_at + interval '30 days' ELSE NULL END)`

// Load reads the organization license. Trial end dates fall back to created_at + 30 days.
func Load(ctx context.Context, pool *pgxpool.Pool, orgID uuid.UUID) (Snapshot, error) {
	var snap Snapshot
	if pool == nil || orgID == uuid.Nil {
		return snap, fmt.Errorf("license lookup unavailable")
	}

	var plan string
	var ends *time.Time
	err := pool.QueryRow(ctx, `
		SELECT COALESCE(plan, 'standard'),
		       COALESCE(trial_ends_at, CASE WHEN lower(COALESCE(plan, '')) = 'trial' THEN created_at + interval '30 days' ELSE NULL END)
		FROM organizations
		WHERE org_id = $1
	`, orgID).Scan(&plan, &ends)
	if errors.Is(err, pgx.ErrNoRows) {
		return snap, nil
	}
	if err != nil {
		return snap, err
	}

	snap.Found = true
	snap.Plan = plan
	snap.TrialEndsAt = ends
	snap.TrialExpired, snap.TrialDaysRemaining = TrialWindow(plan, ends, time.Now())
	return snap, nil
}

// AccessError blocks the whole workspace when the written plan says access has ended.
func (s Snapshot) AccessError() *PlanError {
	if !s.Found {
		return &PlanError{
			HTTPStatus: 403,
			Title:      "License Not Found",
			Detail:     "This workspace license could not be verified. Please contact admin@whoopit.io.",
		}
	}
	plan := strings.ToLower(strings.TrimSpace(s.Plan))
	if plan == PlanSuspended || strings.HasPrefix(plan, PlanSuspended) {
		return &PlanError{
			HTTPStatus: 403,
			Title:      "Workspace Suspended",
			Detail:     "This organization workspace has been placed on commercial billing hold. Please contact admin@whoopit.io.",
		}
	}
	if s.TrialExpired {
		return &PlanError{
			HTTPStatus: 403,
			Title:      "Trial Expired",
			Detail:     "Your 30-day evaluation trial has ended. Please contact admin@whoopit.io to activate a commercial license.",
		}
	}
	return nil
}

// ItemCap returns the hardware-item ceiling for the plan. limited is false for Enterprise.
func ItemCap(plan string) (cap int, limited bool) {
	switch strings.ToLower(strings.TrimSpace(plan)) {
	case PlanTrial:
		return TrialItemCap, true
	case PlanStandard:
		return StandardItemCap, true
	default:
		return 0, false
	}
}

// ItemLimitError reports a SKU ceiling breach. adding is the number of new items about to be created.
func (s Snapshot) ItemLimitError(current, adding int) *PlanError {
	cap, limited := ItemCap(s.Plan)
	if !limited || adding <= 0 || current+adding <= cap {
		return nil
	}
	if strings.EqualFold(s.Plan, PlanTrial) {
		return &PlanError{
			HTTPStatus: 403,
			Title:      "Plan Limit Reached",
			Detail:     "30-Day Evaluation Trial allows up to 200 hardware items. Please upgrade to Enterprise for unlimited items.",
		}
	}
	return &PlanError{
		HTTPStatus: 403,
		Title:      "Plan Limit Reached",
		Detail:     "Standard Office Tier allows up to 5,000 hardware items. Please upgrade to Enterprise for unlimited items.",
	}
}

// FinanceEmailError matches the license matrix: email + PDF is Enterprise only.
func (s Snapshot) FinanceEmailError() *PlanError {
	if strings.EqualFold(s.Plan, PlanEnterprise) {
		return nil
	}
	if strings.EqualFold(s.Plan, PlanTrial) {
		return &PlanError{
			HTTPStatus: 403,
			Title:      "Trial Preview Only",
			Detail:     "30-Day Trial includes on-screen finance preview only. CSV download, PDF, and direct email require a commercial license.",
		}
	}
	return &PlanError{
		HTTPStatus: 403,
		Title:      "Enterprise Feature Required",
		Detail:     "Direct email with PDF and CSV attachments is an Enterprise feature. Standard includes CSV download only.",
	}
}

// FinanceExportError blocks trial from pulling the full exportable dossier payload.
// Standard + Enterprise may load the full JSON (UI builds CSV); email stays Enterprise-only.
func (s Snapshot) FinanceExportError() *PlanError {
	if strings.EqualFold(s.Plan, PlanTrial) {
		return &PlanError{
			HTTPStatus: 403,
			Title:      "Trial Preview Only",
			Detail:     "30-Day Trial includes dashboard KPIs only. Full finance export requires Standard or Enterprise.",
		}
	}
	if pe := s.AccessError(); pe != nil {
		return pe
	}
	return nil
}

// CheckAdditionalItems enforces access and the plan SKU ceiling before new hardware rows are written.
func CheckAdditionalItems(ctx context.Context, pool *pgxpool.Pool, orgID uuid.UUID, adding int) error {
	snap, err := Load(ctx, pool, orgID)
	if err != nil {
		return err
	}
	if pe := snap.AccessError(); pe != nil {
		return pe
	}
	if adding <= 0 {
		return nil
	}
	if _, limited := ItemCap(snap.Plan); !limited {
		return nil
	}

	var current int
	if err := pool.QueryRow(ctx, `SELECT COUNT(*) FROM items WHERE org_id = $1`, orgID).Scan(&current); err != nil {
		return err
	}
	if pe := snap.ItemLimitError(current, adding); pe != nil {
		return pe
	}
	return nil
}
