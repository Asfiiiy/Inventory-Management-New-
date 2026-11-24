package entitlement

import (
	"testing"
	"time"
)

func TestTrialWindowMatchesThirtyDayCutoff(t *testing.T) {
	start := time.Date(2026, 1, 1, 9, 0, 0, 0, time.UTC)
	ends := start.Add(TrialLength)

	expired, days := TrialWindow(PlanTrial, &ends, start.Add(time.Hour))
	if expired || days != 30 {
		t.Fatalf("fresh trial: expired=%v days=%d, want 30 days remaining", expired, days)
	}

	expired, days = TrialWindow(PlanTrial, &ends, ends.Add(-time.Minute))
	if expired || days != 1 {
		t.Fatalf("last minute: expired=%v days=%d, want 1 day left", expired, days)
	}

	expired, days = TrialWindow(PlanTrial, &ends, ends)
	if !expired || days != 0 {
		t.Fatalf("at cutoff: expired=%v days=%d, want expired", expired, days)
	}

	expired, days = TrialWindow(PlanTrial, &ends, ends.Add(48*time.Hour))
	if !expired || days != 0 {
		t.Fatalf("after cutoff: expired=%v days=%d, want expired", expired, days)
	}

	if exp, _ := TrialWindow(PlanTrial, nil, start); !exp {
		t.Fatal("trial without an end date must be expired")
	}
	if exp, d := TrialWindow(PlanEnterprise, nil, start); exp || d != 0 {
		t.Fatal("enterprise must not expire")
	}
	if exp, d := TrialWindow(PlanStandard, &ends, ends.Add(time.Hour)); exp || d != 0 {
		t.Fatal("standard must not expire when a leftover trial date is in the past")
	}
}

func TestPlanMatrixLimits(t *testing.T) {
	trial := Snapshot{Found: true, Plan: PlanTrial}
	if pe := trial.ItemLimitError(200, 1); pe == nil || pe.HTTPStatus != 403 {
		t.Fatal("trial must stop at 200 items")
	}
	if pe := trial.ItemLimitError(199, 1); pe != nil {
		t.Fatal("trial item 200 must still be allowed")
	}

	standard := Snapshot{Found: true, Plan: PlanStandard}
	if pe := standard.ItemLimitError(5000, 1); pe == nil {
		t.Fatal("standard must stop at 5000 items")
	}
	if pe := standard.ItemLimitError(4999, 1); pe != nil {
		t.Fatal("standard item 5000 must still be allowed")
	}

	enterprise := Snapshot{Found: true, Plan: PlanEnterprise}
	if pe := enterprise.ItemLimitError(100000, 50); pe != nil {
		t.Fatal("enterprise items are unlimited")
	}
	if pe := enterprise.FinanceEmailError(); pe != nil {
		t.Fatal("enterprise can email the finance report")
	}
	if pe := standard.FinanceEmailError(); pe == nil {
		t.Fatal("standard cannot email the finance report")
	}
	if pe := trial.FinanceEmailError(); pe == nil || pe.Title != "Trial Preview Only" {
		t.Fatal("trial finance email must stay in preview mode")
	}
}

func TestAccessError(t *testing.T) {
	now := time.Now()
	past := now.Add(-time.Hour)
	future := now.Add(TrialLength)

	active := Snapshot{Found: true, Plan: PlanTrial}
	active.TrialExpired, active.TrialDaysRemaining = TrialWindow(PlanTrial, &future, now)
	if pe := active.AccessError(); pe != nil {
		t.Fatalf("active trial should be allowed: %v", pe)
	}

	ended := Snapshot{Found: true, Plan: PlanTrial}
	ended.TrialExpired, _ = TrialWindow(PlanTrial, &past, now)
	if pe := ended.AccessError(); pe == nil || pe.Title != "Trial Expired" {
		t.Fatal("expired trial must be denied")
	}

	held := Snapshot{Found: true, Plan: PlanSuspended}
	if pe := held.AccessError(); pe == nil || pe.Title != "Workspace Suspended" {
		t.Fatal("suspended workspace must be denied")
	}

	if pe := (Snapshot{Found: true, Plan: PlanEnterprise}).AccessError(); pe != nil {
		t.Fatal("enterprise must stay open")
	}
}
