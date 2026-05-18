package config

import (
	"bufio"
	"os"
	"strconv"
	"strings"
	"time"
)

type Config struct {
	Port               string
	DBPath             string
	SessionTTL         time.Duration
	CORSAllowedOrigins []string

	AIProvider         string
	OpenAIAPIKey       string
	OpenAIModel        string
	OpenAIResponsesURL string
	OllamaModel        string
	OllamaChatURL      string
}

func Load() (Config, error) {
	_ = loadEnvFile(".env")

	sessionTTLHours, err := strconv.Atoi(envOrDefault("SESSION_TTL_HOURS", "168"))
	if err != nil || sessionTTLHours <= 0 {
		sessionTTLHours = 168
	}

	openAIAPIKey := strings.TrimSpace(os.Getenv("OPENAI_API_KEY"))
	openAIModel := envOrDefault("OPENAI_MODEL", "gpt-5.4-mini")
	openAIResponsesURL := envOrDefault("OPENAI_RESPONSES_URL", "https://api.openai.com/v1/responses")
	ollamaModel := envOrDefault("OLLAMA_MODEL", "llama3.2:3b")
	ollamaChatURL := envOrDefault("OLLAMA_CHAT_URL", "http://127.0.0.1:11434/api/chat")
	aiProvider := normalizeAIProvider(strings.TrimSpace(os.Getenv("AI_PROVIDER")), openAIAPIKey, ollamaChatURL)

	cfg := Config{
		Port:               envOrDefault("PORT", "8080"),
		DBPath:             envOrDefault("DB_PATH", "./data/afyamind.db"),
		SessionTTL:         time.Duration(sessionTTLHours) * time.Hour,
		CORSAllowedOrigins: parseOrigins(envOrDefault("CORS_ALLOWED_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173")),
		AIProvider:         aiProvider,
		OpenAIAPIKey:       openAIAPIKey,
		OpenAIModel:        openAIModel,
		OpenAIResponsesURL: openAIResponsesURL,
		OllamaModel:        ollamaModel,
		OllamaChatURL:      ollamaChatURL,
	}

	return cfg, nil
}

func (c Config) ListenAddr() string {
	if strings.HasPrefix(c.Port, ":") {
		return c.Port
	}
	return ":" + c.Port
}

func envOrDefault(key, fallback string) string {
	value := strings.TrimSpace(os.Getenv(key))
	if value == "" {
		return fallback
	}
	return value
}

func parseOrigins(raw string) []string {
	parts := strings.Split(raw, ",")
	origins := make([]string, 0, len(parts))
	for _, part := range parts {
		value := strings.TrimSpace(part)
		if value != "" {
			origins = append(origins, value)
		}
	}
	if len(origins) == 0 {
		return []string{"*"}
	}
	return origins
}

func normalizeAIProvider(provider, openAIAPIKey, ollamaURL string) string {
	switch strings.ToLower(strings.TrimSpace(provider)) {
	case "openai":
		return "openai"
	case "ollama", "llama":
		return "ollama"
	case "fallback":
		return "fallback"
	}

	if openAIAPIKey != "" {
		return "openai"
	}
	if strings.TrimSpace(ollamaURL) != "" {
		return "ollama"
	}
	return "fallback"
}

func loadEnvFile(path string) error {
	file, err := os.Open(path)
	if err != nil {
		if os.IsNotExist(err) {
			return nil
		}
		return err
	}
	defer file.Close()

	scanner := bufio.NewScanner(file)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}

		key, value, ok := strings.Cut(line, "=")
		if !ok {
			continue
		}

		key = strings.TrimSpace(key)
		value = strings.Trim(strings.TrimSpace(value), `"'`)
		if key == "" {
			continue
		}
		if _, exists := os.LookupEnv(key); exists {
			continue
		}
		_ = os.Setenv(key, value)
	}

	return scanner.Err()
}
