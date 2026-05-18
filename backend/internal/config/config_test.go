package config

import "testing"

func TestLoadDefaultsToOllamaWhenNoAIEnvIsSet(t *testing.T) {
	t.Setenv("AI_PROVIDER", "")
	t.Setenv("OPENAI_API_KEY", "")
	t.Setenv("OLLAMA_CHAT_URL", "")
	t.Setenv("OLLAMA_MODEL", "")

	cfg, err := Load()
	if err != nil {
		t.Fatalf("Load() returned error: %v", err)
	}

	if cfg.AIProvider != "ollama" {
		t.Fatalf("expected AIProvider to default to ollama, got %q", cfg.AIProvider)
	}
	if cfg.OllamaChatURL != "http://127.0.0.1:11434/api/chat" {
		t.Fatalf("expected default Ollama URL, got %q", cfg.OllamaChatURL)
	}
	if cfg.OllamaModel != "llama3.2:3b" {
		t.Fatalf("expected default Ollama model, got %q", cfg.OllamaModel)
	}
}

func TestLoadRespectsExplicitFallbackProvider(t *testing.T) {
	t.Setenv("AI_PROVIDER", "fallback")
	t.Setenv("OPENAI_API_KEY", "")
	t.Setenv("OLLAMA_CHAT_URL", "")

	cfg, err := Load()
	if err != nil {
		t.Fatalf("Load() returned error: %v", err)
	}

	if cfg.AIProvider != "fallback" {
		t.Fatalf("expected explicit fallback provider, got %q", cfg.AIProvider)
	}
}
