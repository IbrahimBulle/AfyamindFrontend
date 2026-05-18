package httpapi

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"net/http"
	"strings"
	"time"

	"afyamind/backend/internal/ai"
	"afyamind/backend/internal/config"
	"afyamind/backend/internal/store"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"golang.org/x/crypto/bcrypt"
)

type contextKey string

const userContextKey contextKey = "auth_user"

type server struct {
	cfg   config.Config
	store *store.Store
	ai    *ai.Service
}

type registerRequest struct {
	Name     string `json:"name"`
	Email    string `json:"email"`
	Phone    string `json:"phone"`
	Password string `json:"password"`
	Language string `json:"language"`
	Role     string `json:"role"`
}

type loginRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

type authResponse struct {
	Token string     `json:"token"`
	User  store.User `json:"user"`
}

type aiRequest struct {
	Prompt   string           `json:"prompt"`
	Context  string           `json:"context"`
	Language string           `json:"language"`
	Messages []ai.ChatMessage `json:"messages"`
	SendSMS  bool             `json:"send_sms"`
	SMSTo    string           `json:"sms_to"`
}

func NewRouter(cfg config.Config, dataStore *store.Store, aiService *ai.Service) http.Handler {
	s := &server{
		cfg:   cfg,
		store: dataStore,
		ai:    aiService,
	}

	router := chi.NewRouter()
	router.Use(middleware.RequestID)
	router.Use(middleware.RealIP)
	router.Use(middleware.Recoverer)
	router.Use(middleware.Timeout(90 * time.Second))
	router.Use(s.corsMiddleware)

	router.Get("/api/health", s.handleHealth)

	router.Route("/api/auth", func(r chi.Router) {
		r.Post("/register", s.handleRegister)
		r.Post("/login", s.handleLogin)
	})

	router.Group(func(r chi.Router) {
		r.Use(s.authMiddleware)
		r.Get("/api/me", s.handleMe)
		r.Get("/api/chw/link", s.handleGetCHWLink)
		r.Post("/api/chw/link", s.handleLinkCHW)
		r.Get("/api/chw/directory", s.handleListCHWDirectory)
		r.Get("/api/chw/caseload", s.handleCHWCaseload)
		r.Get("/api/chw/certificate-requests", s.handleListCHWCertificateRequests)
		r.Post("/api/chw/certificate-requests/{patientID}/approve", s.handleApproveCHWCertificateRequest)
		r.Post("/api/admissions/start", s.handleStartAdmission)
		r.Route("/api/checkins", func(r chi.Router) {
			r.Get("/", s.handleListCheckins)
			r.Post("/", s.handleCreateCheckin)
		})
		r.Route("/api/journal", func(r chi.Router) {
			r.Get("/", s.handleListJournal)
			r.Post("/", s.handleCreateJournal)
		})
		r.Route("/api/reminders", func(r chi.Router) {
			r.Get("/", s.handleListReminders)
			r.Post("/", s.handleCreateReminder)
		})
		r.Route("/api/appointments", func(r chi.Router) {
			r.Get("/", s.handleListAppointments)
			r.Post("/", s.handleCreateAppointment)
		})
		r.Route("/api/community/messages", func(r chi.Router) {
			r.Get("/", s.handleListCommunityMessages)
			r.Post("/", s.handleCreateCommunityMessage)
		})
		r.Route("/api/care/messages", func(r chi.Router) {
			r.Get("/", s.handleListCareMessages)
			r.Post("/", s.handleCreateCareMessage)
		})
		r.Get("/api/rewards", s.handleGetRewards)
		r.Post("/api/rewards/redeem", s.handleRedeemRewards)
		r.Get("/api/dashboard/summary", s.handleDashboardSummary)
		r.Post("/api/motivation/send", s.handleSendMotivation)
		r.Post("/api/voice/helpline", s.handleVoiceHelpline)
		r.Get("/api/resources", s.handleResources)
		r.Route("/api/session-progress", func(r chi.Router) {
			r.Get("/", s.handleGetSessionProgress)
			r.Put("/", s.handleUpdateSessionProgress)
		})
		r.Post("/api/certification/request", s.handleRequestCertificateApproval)
		r.Post("/api/certification/generate", s.handleGenerateCertificate)
		r.Post("/api/ai/assistant", s.handleAIAssistant)
	})

	return router
}

func (s *server) handleHealth(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{
		"status":       "ok",
		"ai_provider":  s.ai.ProviderName(),
		"ai_model":     s.ai.ModelName(),
		"ai_endpoint":  s.ai.Endpoint(),
		"ai_is_local":  s.ai.IsLocal(),
		"sms_provider": "not_configured",
		"sms_ready":    false,
	})
}

func (s *server) handleRegister(w http.ResponseWriter, r *http.Request) {
	var req registerRequest
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	req.Name = strings.TrimSpace(req.Name)
	req.Email = strings.ToLower(strings.TrimSpace(req.Email))
	req.Phone = strings.TrimSpace(req.Phone)
	req.Language = normalizeLanguage(req.Language)
	req.Role = normalizeRole(req.Role)

	if req.Name == "" || req.Email == "" || req.Password == "" {
		writeError(w, http.StatusBadRequest, "name, email, and password are required")
		return
	}
	if req.Role == "mental_health_user" && req.Phone == "" {
		writeError(w, http.StatusBadRequest, "phone is required for mental health users")
		return
	}
	if len(req.Password) < 8 {
		writeError(w, http.StatusBadRequest, "password must be at least 8 characters")
		return
	}

	passwordHash, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to hash password")
		return
	}

	user, err := s.store.CreateUser(r.Context(), store.CreateUserInput{
		Name:         req.Name,
		Email:        req.Email,
		Phone:        req.Phone,
		Language:     req.Language,
		Role:         req.Role,
		PasswordHash: string(passwordHash),
	})
	if err != nil {
		if errors.Is(err, store.ErrConflict) {
			writeError(w, http.StatusConflict, "an account with this email already exists")
			return
		}
		writeError(w, http.StatusInternalServerError, "failed to create account")
		return
	}

	token, err := s.store.CreateSession(r.Context(), user.ID, time.Now().Add(s.cfg.SessionTTL))
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to start session")
		return
	}

	writeJSON(w, http.StatusCreated, authResponse{
		Token: token,
		User:  user,
	})
}

func (s *server) handleLogin(w http.ResponseWriter, r *http.Request) {
	var req loginRequest
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	req.Email = strings.ToLower(strings.TrimSpace(req.Email))
	if req.Email == "" || strings.TrimSpace(req.Password) == "" {
		writeError(w, http.StatusBadRequest, "email and password are required")
		return
	}

	user, passwordHash, err := s.store.GetUserByEmail(r.Context(), req.Email)
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			writeError(w, http.StatusUnauthorized, "invalid email or password")
			return
		}
		writeError(w, http.StatusInternalServerError, "failed to sign in")
		return
	}

	if err := bcrypt.CompareHashAndPassword([]byte(passwordHash), []byte(req.Password)); err != nil {
		writeError(w, http.StatusUnauthorized, "invalid email or password")
		return
	}

	token, err := s.store.CreateSession(r.Context(), user.ID, time.Now().Add(s.cfg.SessionTTL))
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to start session")
		return
	}

	writeJSON(w, http.StatusOK, authResponse{
		Token: token,
		User:  user,
	})
}

func (s *server) handleMe(w http.ResponseWriter, r *http.Request) {
	user, ok := currentUser(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "not authenticated")
		return
	}
	writeJSON(w, http.StatusOK, user)
}

func (s *server) handleAIAssistant(w http.ResponseWriter, r *http.Request) {
	user, ok := currentUser(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "not authenticated")
		return
	}

	var req aiRequest
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	prompt := strings.TrimSpace(req.Prompt)
	if prompt == "" && len(req.Messages) == 0 {
		writeError(w, http.StatusBadRequest, "prompt is required")
		return
	}

	language := normalizeLanguage(req.Language)
	if language == "" {
		language = normalizeLanguage(user.Language)
	}

	risk := detectRisk(prompt)
	if risk == "medium" || risk == "high" {
		_ = s.store.CreateRiskEvent(r.Context(), user.ID, "ai_assistant", risk, "risk keywords detected in AI assistant prompt")
	}

	result := s.ai.Generate(r.Context(), ai.GenerateRequest{
		Prompt:   prompt,
		Context:  strings.TrimSpace(req.Context),
		Language: language,
		Risk:     risk,
		Messages: req.Messages,
	})

	response := map[string]any{
		"model":             result.Model,
		"reply":             result.Reply,
		"suggested_actions": suggestedActionsByRisk(risk),
		"risk_level":        risk,
	}
	if req.SendSMS {
		response["sms_status"] = "unsupported"
		response["sms_warning"] = "SMS forwarding is not enabled in the chi backend yet."
	}

	writeJSON(w, http.StatusOK, response)
}

func (s *server) authMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		token := bearerToken(r.Header.Get("Authorization"))
		if token == "" {
			writeError(w, http.StatusUnauthorized, "missing bearer token")
			return
		}

		user, err := s.store.GetUserByToken(r.Context(), token)
		if err != nil {
			if errors.Is(err, store.ErrNotFound) {
				writeError(w, http.StatusUnauthorized, "session has expired or is invalid")
				return
			}
			if errors.Is(err, sql.ErrNoRows) {
				writeError(w, http.StatusUnauthorized, "session has expired or is invalid")
				return
			}
			writeError(w, http.StatusInternalServerError, "failed to authenticate request")
			return
		}

		ctx := context.WithValue(r.Context(), userContextKey, user)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

func (s *server) corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := strings.TrimSpace(r.Header.Get("Origin"))
		allowedOrigin := s.allowedOrigin(origin)
		if allowedOrigin != "" {
			w.Header().Set("Access-Control-Allow-Origin", allowedOrigin)
			w.Header().Set("Vary", "Origin")
		}

		w.Header().Set("Access-Control-Allow-Headers", "Authorization, Content-Type")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, OPTIONS")

		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}

		next.ServeHTTP(w, r)
	})
}

func (s *server) allowedOrigin(origin string) string {
	if len(s.cfg.CORSAllowedOrigins) == 0 {
		return "*"
	}
	for _, allowed := range s.cfg.CORSAllowedOrigins {
		if allowed == "*" {
			return "*"
		}
		if origin == allowed {
			return origin
		}
	}
	return ""
}

func currentUser(ctx context.Context) (store.User, bool) {
	user, ok := ctx.Value(userContextKey).(store.User)
	return user, ok
}

func decodeJSON(r *http.Request, destination any) error {
	defer r.Body.Close()

	decoder := json.NewDecoder(r.Body)
	decoder.DisallowUnknownFields()

	if err := decoder.Decode(destination); err != nil {
		return err
	}
	return nil
}

func writeJSON(w http.ResponseWriter, status int, payload any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(payload)
}

func writeError(w http.ResponseWriter, status int, message string) {
	writeJSON(w, status, map[string]string{
		"error": message,
	})
}

func bearerToken(header string) string {
	const prefix = "Bearer "
	if !strings.HasPrefix(header, prefix) {
		return ""
	}
	return strings.TrimSpace(strings.TrimPrefix(header, prefix))
}

func normalizeRole(role string) string {
	switch strings.ToLower(strings.TrimSpace(strings.ReplaceAll(role, "-", "_"))) {
	case "community_health_worker", "community_worker", "chw", "communityhealthworker":
		return "community_health_worker"
	default:
		return "mental_health_user"
	}
}

func normalizeLanguage(language string) string {
	switch strings.ToLower(strings.TrimSpace(language)) {
	case "sw", "fr", "es", "ar":
		return strings.ToLower(strings.TrimSpace(language))
	case "en", "":
		return "en"
	default:
		return "en"
	}
}

func detectRisk(text string) string {
	normalized := strings.ToLower(strings.TrimSpace(text))

	highSignals := []string{
		"suicide",
		"kill myself",
		"end my life",
		"self harm",
		"self-harm",
		"no reason to live",
		"want to die",
	}
	for _, signal := range highSignals {
		if strings.Contains(normalized, signal) {
			return "high"
		}
	}

	mediumSignals := []string{
		"overwhelmed",
		"panic",
		"anxious",
		"can't sleep",
		"cannot sleep",
		"alone",
		"hopeless",
		"stressed",
	}
	for _, signal := range mediumSignals {
		if strings.Contains(normalized, signal) {
			return "medium"
		}
	}

	return "low"
}

func suggestedActionsByRisk(risk string) []string {
	switch risk {
	case "high":
		return []string{"Call a trusted person now", "Contact a clinician or crisis line", "Stay with someone safe"}
	case "medium":
		return []string{"Try a grounding exercise", "Book a follow-up session", "Send one check-in message"}
	default:
		return []string{"Box breathing", "Short walk", "Journal one page"}
	}
}
