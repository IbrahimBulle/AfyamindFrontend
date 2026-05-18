package httpapi

import "testing"

func TestDetectRisk(t *testing.T) {
	if got := detectRisk("I want to end my life"); got != "high" {
		t.Fatalf("expected high risk, got %q", got)
	}

	if got := detectRisk("I feel overwhelmed and anxious"); got != "medium" {
		t.Fatalf("expected medium risk, got %q", got)
	}

	if got := detectRisk("I had a decent day"); got != "low" {
		t.Fatalf("expected low risk, got %q", got)
	}
}

func TestSuggestedActionsByRisk(t *testing.T) {
	actions := suggestedActionsByRisk("high")
	if len(actions) == 0 {
		t.Fatal("expected suggested actions for high risk")
	}
}
