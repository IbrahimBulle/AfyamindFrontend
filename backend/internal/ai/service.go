package ai

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"strings"
	"time"

	"afyamind/backend/internal/config"
)

type ChatMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type GenerateRequest struct {
	Prompt   string
	Context  string
	Language string
	Risk     string
	Messages []ChatMessage
}

type GenerateResult struct {
	Model string
	Reply string
}

type Service struct {
	cfg          config.Config
	httpClient   *http.Client
	ollamaClient *http.Client
}

func NewService(cfg config.Config) *Service {
	return &Service{
		cfg:          cfg,
		httpClient:   &http.Client{Timeout: 45 * time.Second},
		ollamaClient: &http.Client{Timeout: 90 * time.Second},
	}
}

func (s *Service) ProviderName() string {
	return s.cfg.AIProvider
}

func (s *Service) ModelName() string {
	if s.cfg.AIProvider == "ollama" {
		return s.cfg.OllamaModel
	}
	if s.cfg.AIProvider == "openai" {
		return s.cfg.OpenAIModel
	}
	return "fallback-local"
}

func (s *Service) Endpoint() string {
	if s.cfg.AIProvider == "ollama" {
		return s.cfg.OllamaChatURL
	}
	if s.cfg.AIProvider == "openai" {
		return s.cfg.OpenAIResponsesURL
	}
	return "local"
}

func (s *Service) IsLocal() bool {
	return s.cfg.AIProvider == "ollama" && isLoopbackURL(s.cfg.OllamaChatURL)
}

func (s *Service) Generate(ctx context.Context, input GenerateRequest) GenerateResult {
	switch s.cfg.AIProvider {
	case "openai":
		if reply, err := s.callOpenAI(ctx, input); err == nil {
			return GenerateResult{Model: s.cfg.OpenAIModel, Reply: reply}
		} else {
			log.Printf("openai fallback: %v", err)
		}
	case "ollama":
		if reply, err := s.callOllama(ctx, input); err == nil {
			return GenerateResult{Model: fmt.Sprintf("Ollama (%s)", s.cfg.OllamaModel), Reply: reply}
		} else {
			log.Printf("ollama fallback: %v", err)
		}
		if reply, err := s.callOpenAI(ctx, input); err == nil {
			return GenerateResult{Model: s.cfg.OpenAIModel, Reply: reply}
		} else {
			log.Printf("openai fallback after ollama: %v", err)
		}
	}

	return GenerateResult{
		Model: "fallback-local",
		Reply: fallbackReply(input.Prompt, input.Risk),
	}
}

func (s *Service) callOpenAI(ctx context.Context, input GenerateRequest) (string, error) {
	if strings.TrimSpace(s.cfg.OpenAIAPIKey) == "" {
		return "", errors.New("OPENAI_API_KEY is not configured")
	}

	payload := map[string]any{
		"model":             s.cfg.OpenAIModel,
		"instructions":      buildSystemPrompt(input.Language, input.Risk, input.Context),
		"input":             buildConversationInput(input.Messages, input.Prompt),
		"max_output_tokens": 280,
		"store":             false,
	}

	body, err := json.Marshal(payload)
	if err != nil {
		return "", err
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, s.cfg.OpenAIResponsesURL, bytes.NewReader(body))
	if err != nil {
		return "", err
	}
	req.Header.Set("Authorization", "Bearer "+s.cfg.OpenAIAPIKey)
	req.Header.Set("Content-Type", "application/json")

	resp, err := s.httpClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("openai request failed: %w", err)
	}
	defer resp.Body.Close()

	respBody, _ := io.ReadAll(io.LimitReader(resp.Body, 2<<20))
	if resp.StatusCode >= 300 {
		return "", fmt.Errorf("openai error (%d): %s", resp.StatusCode, strings.TrimSpace(string(respBody)))
	}

	var raw map[string]any
	if err := json.Unmarshal(respBody, &raw); err != nil {
		return "", fmt.Errorf("openai invalid response: %w", err)
	}

	reply := extractOpenAIText(raw)
	if strings.TrimSpace(reply) == "" {
		return "", errors.New("openai returned an empty reply")
	}

	return strings.TrimSpace(reply), nil
}

func (s *Service) callOllama(ctx context.Context, input GenerateRequest) (string, error) {
	if strings.TrimSpace(s.cfg.OllamaChatURL) == "" {
		return "", errors.New("OLLAMA_CHAT_URL is not configured")
	}

	messages := make([]map[string]string, 0, len(input.Messages)+1)
	messages = append(messages, map[string]string{
		"role":    "system",
		"content": buildSystemPrompt(input.Language, input.Risk, input.Context),
	})

	for _, message := range normalizeConversation(input.Messages, input.Prompt) {
		messages = append(messages, map[string]string{
			"role":    message.Role,
			"content": message.Content,
		})
	}

	payload := map[string]any{
		"model":    s.cfg.OllamaModel,
		"messages": messages,
		"stream":   false,
	}

	body, err := json.Marshal(payload)
	if err != nil {
		return "", err
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, s.cfg.OllamaChatURL, bytes.NewReader(body))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := s.ollamaClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("ollama request failed: %w", err)
	}
	defer resp.Body.Close()

	respBody, _ := io.ReadAll(io.LimitReader(resp.Body, 2<<20))
	if resp.StatusCode >= 300 {
		return "", fmt.Errorf("ollama error (%d): %s", resp.StatusCode, strings.TrimSpace(string(respBody)))
	}

	var raw map[string]any
	if err := json.Unmarshal(respBody, &raw); err != nil {
		return "", fmt.Errorf("ollama invalid response: %w", err)
	}

	reply := extractOllamaText(raw)
	if strings.TrimSpace(reply) == "" {
		return "", errors.New("ollama returned an empty reply")
	}

	return strings.TrimSpace(reply), nil
}

func buildSystemPrompt(language, risk, context string) string {
	langName := languageDisplayName(language)
	context = strings.TrimSpace(context)
	risk = strings.TrimSpace(risk)

	base := fmt.Sprintf(
		"You are AfyaMind, a warm mental wellness companion. Reply in %s. Keep your answer practical, empathetic, and usually under 120 words unless the user asks for more. Do not diagnose, prescribe medication, or pretend to be emergency services. Offer one simple coping step and one realistic next step. Do not mention specific hotlines, countries, or organizations unless they were provided in the user's context or explicitly requested. Prefer locally neutral support language such as trusted person, CHW, clinician, or local emergency support. Use markdown only when it helps readability.",
		langName,
	)

	if risk == "high" {
		base += " The user may be at high risk. Encourage immediate support from a trusted person, local emergency services, or a crisis contact right away."
	} else if risk == "medium" {
		base += " The user may be at medium risk. Prioritize grounding, support, and a near-term human follow-up."
	}

	if context != "" {
		base += " Personalize your reply using this care context when it is relevant: " + context
	}

	return base
}

func buildConversationInput(messages []ChatMessage, prompt string) []map[string]string {
	normalized := normalizeConversation(messages, prompt)
	input := make([]map[string]string, 0, len(normalized))
	for _, message := range normalized {
		input = append(input, map[string]string{
			"role":    message.Role,
			"content": message.Content,
		})
	}
	return input
}

func normalizeConversation(messages []ChatMessage, prompt string) []ChatMessage {
	trimmedPrompt := strings.TrimSpace(prompt)
	normalized := make([]ChatMessage, 0, len(messages)+1)

	for _, message := range messages {
		role := normalizeRole(message.Role)
		content := strings.TrimSpace(message.Content)
		if content == "" || role == "" {
			continue
		}
		normalized = append(normalized, ChatMessage{
			Role:    role,
			Content: content,
		})
	}

	if len(normalized) > 10 {
		normalized = normalized[len(normalized)-10:]
	}

	if trimmedPrompt != "" {
		if len(normalized) == 0 || normalized[len(normalized)-1].Role != "user" || normalized[len(normalized)-1].Content != trimmedPrompt {
			normalized = append(normalized, ChatMessage{
				Role:    "user",
				Content: trimmedPrompt,
			})
		}
	}

	if len(normalized) == 0 {
		normalized = append(normalized, ChatMessage{
			Role:    "user",
			Content: "I need a little support right now.",
		})
	}

	return normalized
}

func normalizeRole(role string) string {
	switch strings.ToLower(strings.TrimSpace(role)) {
	case "assistant":
		return "assistant"
	case "system":
		return "system"
	default:
		return "user"
	}
}

func extractOpenAIText(raw map[string]any) string {
	output, ok := raw["output"].([]any)
	if !ok {
		return ""
	}

	parts := make([]string, 0, len(output))
	for _, item := range output {
		entry, ok := item.(map[string]any)
		if !ok {
			continue
		}

		contentList, ok := entry["content"].([]any)
		if !ok {
			continue
		}

		for _, contentItem := range contentList {
			contentMap, ok := contentItem.(map[string]any)
			if !ok {
				continue
			}
			if text, ok := contentMap["text"].(string); ok && strings.TrimSpace(text) != "" {
				parts = append(parts, strings.TrimSpace(text))
			}
		}
	}

	return strings.Join(parts, "\n")
}

func extractOllamaText(raw map[string]any) string {
	if message, ok := raw["message"].(map[string]any); ok {
		if content, ok := message["content"].(string); ok {
			return strings.TrimSpace(content)
		}
	}
	if response, ok := raw["response"].(string); ok {
		return strings.TrimSpace(response)
	}
	return ""
}

func fallbackReply(prompt, risk string) string {
	normalized := strings.ToLower(strings.TrimSpace(prompt))

	switch {
	case risk == "high":
		return "Please reach out to a trusted person or local emergency support right now and avoid being alone. If you want, tell me your country and I will help you think through the next safe step."
	case strings.Contains(normalized, "sleep"):
		return "Try a gentle reset tonight: dim the lights, put your phone aside for 20 minutes, and take five slow breaths with a longer exhale. If you want, I can help you build a simple bedtime routine."
	case strings.Contains(normalized, "panic"), strings.Contains(normalized, "anxious"):
		return "Let’s slow the moment down together. Put both feet on the floor, name five things you can see, and take one longer exhale than inhale. Tell me what feels strongest right now."
	case strings.Contains(normalized, "sad"), strings.Contains(normalized, "overwhelmed"), strings.Contains(normalized, "alone"):
		return "You do not have to carry this by yourself. Pick one very small next step like water, fresh air, or messaging someone safe, and we can keep going from there."
	default:
		return "I’m here with you. Start with one gentle step right now: unclench your shoulders, breathe out slowly, and tell me whether you need calm, clarity, or encouragement."
	}
}

func languageDisplayName(language string) string {
	switch strings.ToLower(strings.TrimSpace(language)) {
	case "sw":
		return "Kiswahili"
	case "fr":
		return "French"
	case "es":
		return "Spanish"
	case "ar":
		return "Arabic"
	default:
		return "English"
	}
}

func isLoopbackURL(rawURL string) bool {
	parsed, err := url.Parse(rawURL)
	if err != nil {
		return false
	}
	host := strings.ToLower(parsed.Hostname())
	return host == "localhost" || host == "127.0.0.1" || host == "::1"
}
