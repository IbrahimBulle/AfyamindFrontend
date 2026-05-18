package ai

import "testing"

func TestNormalizeConversationAppendsPrompt(t *testing.T) {
	messages := []ChatMessage{
		{Role: "assistant", Content: "Hello"},
	}

	normalized := normalizeConversation(messages, "I need help sleeping")
	if len(normalized) != 2 {
		t.Fatalf("expected 2 messages, got %d", len(normalized))
	}
	if normalized[len(normalized)-1].Role != "user" {
		t.Fatalf("expected final message to be from user, got %q", normalized[len(normalized)-1].Role)
	}
	if normalized[len(normalized)-1].Content != "I need help sleeping" {
		t.Fatalf("unexpected final content: %q", normalized[len(normalized)-1].Content)
	}
}

func TestExtractOpenAIText(t *testing.T) {
	raw := map[string]any{
		"output": []any{
			map[string]any{
				"type": "message",
				"content": []any{
					map[string]any{
						"type": "output_text",
						"text": "You are doing well.",
					},
				},
			},
		},
	}

	if got := extractOpenAIText(raw); got != "You are doing well." {
		t.Fatalf("extractOpenAIText() = %q", got)
	}
}
