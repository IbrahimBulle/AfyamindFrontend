package httpapi

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"afyamind/backend/internal/store"

	"github.com/go-chi/chi/v5"
)

type chwLinkRequest struct {
	CHWName   string `json:"chw_name"`
	Phone     string `json:"phone"`
	Region    string `json:"region"`
	CHWUserID int64  `json:"chw_user_id"`
}

type checkinRequest struct {
	Mood        int     `json:"mood"`
	Stress      int     `json:"stress"`
	Anxiety     int     `json:"anxiety"`
	SleepHours  float64 `json:"sleep_hours"`
	Note        string  `json:"note"`
	PHQ9Answers []int   `json:"phq9_answers"`
}

type admissionRequest struct {
	PHQ9Answers         []int    `json:"phq9_answers"`
	GAD7Answers         []int    `json:"gad7_answers"`
	PCL5Answers         []int    `json:"pcl5_answers"`
	KesslerAnswers      []int    `json:"kessler_answers"`
	MDQAnswers          []bool   `json:"mdq_answers"`
	MDQConcurrent       *bool    `json:"mdq_concurrent"`
	MDQImpairment       *int     `json:"mdq_impairment"`
	AUDITAnswers        []int    `json:"audit_answers"`
	CSSRSAnswers        []bool   `json:"cssrs_answers"`
	Mood                *int     `json:"mood"`
	Stress              *int     `json:"stress"`
	Anxiety             *int     `json:"anxiety"`
	SleepHours          *float64 `json:"sleep_hours"`
	Note                string   `json:"note"`
	PrimaryConcern      string   `json:"primary_concern"`
	SafetyContactNumber string   `json:"safety_contact_number"`
}

type journalRequest struct {
	Entry string `json:"entry"`
}

type reminderRequest struct {
	Title        string `json:"title"`
	ScheduleTime string `json:"schedule_time"`
}

type appointmentRequest struct {
	Therapist         string `json:"therapist"`
	SessionMode       string `json:"session_mode"`
	AppointmentTime   string `json:"appointment_time"`
	NotificationPhone string `json:"notification_phone"`
	ContactPhone      string `json:"contact_phone"`
	CHWUserID         int64  `json:"chw_user_id"`
}

type communityMessageRequest struct {
	Room    string `json:"room"`
	Message string `json:"message"`
}

type careMessageRequest struct {
	RoomID  string `json:"room_id"`
	Message string `json:"message"`
}

type redeemRequest struct {
	AmountPoints int `json:"amount_points"`
}

type motivationRequest struct {
	To       string `json:"to"`
	Language string `json:"language"`
}

type sessionProgressUpdateRequest struct {
	ExerciseComplete *bool   `json:"exercise_complete"`
	CHWChatComplete  *bool   `json:"chw_chat_complete"`
	GuidanceComplete *bool   `json:"guidance_complete"`
	Reflection       *string `json:"reflection"`
}

type phq9Assessment struct {
	Provided  bool
	Score     int
	Severity  string
	RiskLevel string
}

type careRecommendation struct {
	Type    string
	Message string
	Actions []string
}

type sessionProgressStatus struct {
	ExerciseComplete       bool       `json:"exercise_complete"`
	CHWChatComplete        bool       `json:"chw_chat_complete"`
	GuidanceComplete       bool       `json:"guidance_complete"`
	Reflection             string     `json:"reflection"`
	CertificateRequested   bool       `json:"certificate_requested"`
	CertificateApproved    bool       `json:"certificate_approved"`
	CertificateRequestedAt *time.Time `json:"certificate_requested_at,omitempty"`
	CHWApprovedAt          *time.Time `json:"chw_approved_at,omitempty"`
	ApprovedByCHWID        *int64     `json:"approved_by_chw_id,omitempty"`
	UpdatedAt              *time.Time `json:"updated_at,omitempty"`
	RequiresCHWApproval    bool       `json:"requires_chw_approval"`
	CurrentRiskLevel       string     `json:"current_risk_level"`
	ChecklistComplete      bool       `json:"checklist_complete"`
	CanGenerateCertificate bool       `json:"can_generate_certificate"`
}

func (s *server) handleGetCHWLink(w http.ResponseWriter, r *http.Request) {
	user, ok := currentUser(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "not authenticated")
		return
	}
	if err := requireRole(user, "mental_health_user"); err != nil {
		writeError(w, http.StatusForbidden, err.Error())
		return
	}

	var (
		id        int64
		name      string
		phone     string
		region    string
		chwUserID sql.NullInt64
		createdAt time.Time
	)

	err := s.store.DB().QueryRowContext(
		r.Context(),
		`SELECT id, chw_name, phone, region, chw_user_id, created_at
		FROM chw_links
		WHERE user_id = ?
		ORDER BY created_at DESC, id DESC
		LIMIT 1`,
		user.ID,
	).Scan(&id, &name, &phone, &region, &chwUserID, &createdAt)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			writeJSON(w, http.StatusOK, map[string]any{"linked": false})
			return
		}
		writeError(w, http.StatusInternalServerError, "failed to fetch CHW link")
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"linked":      true,
		"id":          id,
		"chw_name":    name,
		"phone":       phone,
		"region":      region,
		"chw_user_id": nullInt64(chwUserID),
		"created_at":  createdAt.UTC(),
	})
}

func (s *server) handleLinkCHW(w http.ResponseWriter, r *http.Request) {
	user, ok := currentUser(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "not authenticated")
		return
	}
	if err := requireRole(user, "mental_health_user"); err != nil {
		writeError(w, http.StatusForbidden, err.Error())
		return
	}

	var req chwLinkRequest
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	req.CHWName = strings.TrimSpace(req.CHWName)
	req.Phone = strings.TrimSpace(req.Phone)
	req.Region = strings.TrimSpace(req.Region)
	if req.Region == "" {
		req.Region = "Nairobi"
	}

	if req.CHWUserID > 0 {
		chw, err := s.store.GetUserByID(r.Context(), req.CHWUserID)
		if err != nil {
			if errors.Is(err, store.ErrNotFound) {
				writeError(w, http.StatusNotFound, "selected CHW account was not found")
				return
			}
			writeError(w, http.StatusInternalServerError, "failed to load selected CHW")
			return
		}
		if normalizeRole(chw.Role) != "community_health_worker" {
			writeError(w, http.StatusBadRequest, "selected account is not a Community Health Worker")
			return
		}
		if req.CHWName == "" {
			req.CHWName = chw.Name
		}
		if req.Phone == "" {
			req.Phone = chw.Phone
		}
	}

	if req.CHWName == "" || req.Phone == "" {
		writeError(w, http.StatusBadRequest, "chw_name, phone, and region are required")
		return
	}

	_, err := s.store.DB().ExecContext(
		r.Context(),
		`INSERT INTO chw_links(user_id, chw_name, phone, region, chw_user_id) VALUES(?, ?, ?, ?, ?)`,
		user.ID,
		req.CHWName,
		req.Phone,
		req.Region,
		nullableInt64(req.CHWUserID),
	)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to link CHW")
		return
	}

	writeJSON(w, http.StatusCreated, map[string]string{"message": "CHW linked successfully"})
}

func (s *server) handleListCHWDirectory(w http.ResponseWriter, r *http.Request) {
	rows, err := s.store.DB().QueryContext(
		r.Context(),
		`SELECT
			u.id,
			u.name,
			u.email,
			COALESCE(NULLIF(u.phone, ''), (
				SELECT cl.phone
				FROM chw_links cl
				WHERE cl.chw_user_id = u.id
				ORDER BY cl.created_at DESC, cl.id DESC
				LIMIT 1
			), '') AS phone,
			COALESCE((
				SELECT cl.region
				FROM chw_links cl
				WHERE cl.chw_user_id = u.id
				ORDER BY cl.created_at DESC, cl.id DESC
				LIMIT 1
			), '') AS region,
			COALESCE((
				SELECT COUNT(DISTINCT cl.user_id)
				FROM chw_links cl
				WHERE cl.chw_user_id = u.id
			), 0) AS caseload_count
		FROM users u
		WHERE u.role = 'community_health_worker'
		ORDER BY u.name ASC`,
	)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to load CHW directory")
		return
	}
	defer rows.Close()

	items := make([]map[string]any, 0)
	for rows.Next() {
		var (
			id            int64
			name          string
			email         string
			phone         string
			region        string
			caseloadCount int
		)
		if err := rows.Scan(&id, &name, &email, &phone, &region, &caseloadCount); err != nil {
			writeError(w, http.StatusInternalServerError, "failed to scan CHW directory")
			return
		}
		items = append(items, map[string]any{
			"id":             id,
			"name":           name,
			"email":          email,
			"phone":          phone,
			"region":         firstNonEmpty(region, "Unassigned"),
			"caseload_count": caseloadCount,
			"is_registered":  true,
		})
	}

	writeJSON(w, http.StatusOK, items)
}

func (s *server) handleCHWCaseload(w http.ResponseWriter, r *http.Request) {
	user, ok := currentUser(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "not authenticated")
		return
	}
	if err := requireRole(user, "community_health_worker"); err != nil {
		writeError(w, http.StatusForbidden, err.Error())
		return
	}

	rows, err := s.store.DB().QueryContext(
		r.Context(),
		`SELECT
			u.id,
			u.name,
			u.email,
			u.phone,
			u.language,
			cl.region,
			cl.chw_name,
			cl.created_at,
			COALESCE((
				SELECT c.risk_level
				FROM checkins c
				WHERE c.user_id = u.id
				ORDER BY c.created_at DESC, c.id DESC
				LIMIT 1
			), 'low') AS last_risk_level,
			(
				SELECT c.created_at
				FROM checkins c
				WHERE c.user_id = u.id
				ORDER BY c.created_at DESC, c.id DESC
				LIMIT 1
			) AS last_checkin_at,
			COALESCE((
				SELECT COUNT(1)
				FROM checkins c
				WHERE c.user_id = u.id
			), 0) AS total_checkins
		FROM chw_links cl
		JOIN users u ON u.id = cl.user_id
		WHERE cl.chw_user_id = ?
		ORDER BY cl.created_at DESC, cl.id DESC`,
		user.ID,
	)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to load CHW caseload")
		return
	}
	defer rows.Close()

	items := make([]map[string]any, 0)
	seen := map[int64]struct{}{}
	for rows.Next() {
		var (
			patientID    int64
			patientName  string
			patientEmail string
			patientPhone string
			language     string
			region       string
			chwName      string
			linkedAt     time.Time
			lastRisk     string
			lastCheckin  sql.NullTime
			totalCheckin int
		)
		if err := rows.Scan(&patientID, &patientName, &patientEmail, &patientPhone, &language, &region, &chwName, &linkedAt, &lastRisk, &lastCheckin, &totalCheckin); err != nil {
			writeError(w, http.StatusInternalServerError, "failed to scan CHW caseload")
			return
		}
		if _, exists := seen[patientID]; exists {
			continue
		}
		seen[patientID] = struct{}{}

		items = append(items, map[string]any{
			"patient_id":      patientID,
			"patient_name":    patientName,
			"patient_email":   patientEmail,
			"patient_phone":   patientPhone,
			"language":        language,
			"region":          firstNonEmpty(region, "Unassigned"),
			"chw_name":        chwName,
			"linked_at":       linkedAt.UTC(),
			"last_risk_level": lastRisk,
			"last_checkin_at": nullTime(lastCheckin),
			"total_checkins":  totalCheckin,
		})
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"chw":            user,
		"total_patients": len(items),
		"patients":       items,
	})
}

func (s *server) handleStartAdmission(w http.ResponseWriter, r *http.Request) {
	user, ok := currentUser(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "not authenticated")
		return
	}
	if err := requireRole(user, "mental_health_user"); err != nil {
		writeError(w, http.StatusForbidden, err.Error())
		return
	}

	var req admissionRequest
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	phq, err := assessPHQ9(req.PHQ9Answers)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	mood := 5
	stress := 4
	anxiety := 4
	sleepHours := 7.0

	if req.Mood != nil {
		mood = *req.Mood
	}
	if req.Stress != nil {
		stress = *req.Stress
	}
	if req.Anxiety != nil {
		anxiety = *req.Anxiety
	}
	if req.SleepHours != nil {
		sleepHours = *req.SleepHours
	}

	if mood < 1 || mood > 10 || stress < 0 || stress > 10 || anxiety < 0 || anxiety > 10 {
		writeError(w, http.StatusBadRequest, "invalid range for mood, stress, or anxiety")
		return
	}

	note := strings.TrimSpace(req.Note)
	if note == "" {
		note = composeAdmissionSummary(req.PrimaryConcern, req.SafetyContactNumber)
	}
	if note == "" {
		note = "Admission intake completed."
	}

	risk := detectRiskFromSignals(note, mood, stress, anxiety, sleepHours)
	risk = maxRiskLevel(risk, phq.RiskLevel)
	risk = maxRiskLevel(risk, assessAdditionalAdmissionRisk(req))

	result, err := s.store.DB().ExecContext(
		r.Context(),
		`INSERT INTO checkins(user_id, mood, stress, anxiety, sleep_hours, note, risk_level) VALUES(?, ?, ?, ?, ?, ?, ?)`,
		user.ID,
		mood,
		stress,
		anxiety,
		sleepHours,
		note,
		risk,
	)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to create admission record")
		return
	}

	admissionID, _ := result.LastInsertId()
	points, _ := s.addRewardPoints(r.Context(), user.ID, 12)
	recommendation := buildCareRecommendation(risk, phq, hasLinkedCHW(r.Context(), s.store.DB(), user.ID), user.Language)
	if risk == "medium" || risk == "high" {
		_ = s.store.CreateRiskEvent(r.Context(), user.ID, "admission", risk, "admission intake triggered follow-up")
	}
	_ = s.ensureSessionProgressRow(r.Context(), user.ID)

	writeJSON(w, http.StatusCreated, map[string]any{
		"admission_id":            admissionID,
		"risk_level":              risk,
		"created_at":              time.Now().UTC(),
		"phq9_score":              nullableScore(phq.Provided, phq.Score),
		"phq9_severity":           phq.Severity,
		"phq9_risk_level":         phq.RiskLevel,
		"reward_points":           points,
		"recommendation_type":     recommendation.Type,
		"recommendation_message":  recommendation.Message,
		"suggested_actions":       recommendation.Actions,
		"admission_flow_complete": true,
	})
}

func (s *server) handleCreateCheckin(w http.ResponseWriter, r *http.Request) {
	user, ok := currentUser(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "not authenticated")
		return
	}
	if err := requireRole(user, "mental_health_user"); err != nil {
		writeError(w, http.StatusForbidden, err.Error())
		return
	}

	var req checkinRequest
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	if req.Mood < 1 || req.Mood > 10 || req.Stress < 0 || req.Stress > 10 || req.Anxiety < 0 || req.Anxiety > 10 {
		writeError(w, http.StatusBadRequest, "invalid range for mood, stress, or anxiety")
		return
	}
	if req.SleepHours < 0 || req.SleepHours > 24 {
		writeError(w, http.StatusBadRequest, "sleep_hours must be between 0 and 24")
		return
	}

	phq, err := assessPHQ9(req.PHQ9Answers)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	note := strings.TrimSpace(req.Note)
	risk := detectRiskFromSignals(note, req.Mood, req.Stress, req.Anxiety, req.SleepHours)
	risk = maxRiskLevel(risk, phq.RiskLevel)

	result, err := s.store.DB().ExecContext(
		r.Context(),
		`INSERT INTO checkins(user_id, mood, stress, anxiety, sleep_hours, note, risk_level) VALUES(?, ?, ?, ?, ?, ?, ?)`,
		user.ID,
		req.Mood,
		req.Stress,
		req.Anxiety,
		req.SleepHours,
		note,
		risk,
	)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to save check-in")
		return
	}

	checkinID, _ := result.LastInsertId()
	points, _ := s.addRewardPoints(r.Context(), user.ID, 10)
	recommendation := buildCareRecommendation(risk, phq, hasLinkedCHW(r.Context(), s.store.DB(), user.ID), user.Language)
	if risk == "medium" || risk == "high" {
		_ = s.store.CreateRiskEvent(r.Context(), user.ID, "checkin", risk, "risk flagged from check-in values")
	}
	_ = s.ensureSessionProgressRow(r.Context(), user.ID)

	writeJSON(w, http.StatusCreated, map[string]any{
		"id":                     checkinID,
		"risk_level":             risk,
		"created_at":             time.Now().UTC(),
		"reward_points":          points,
		"recommendation_type":    recommendation.Type,
		"recommendation_message": recommendation.Message,
		"suggested_actions":      recommendation.Actions,
		"phq9_score":             nullableScore(phq.Provided, phq.Score),
		"phq9_severity":          phq.Severity,
		"phq9_risk_level":        phq.RiskLevel,
	})
}

func (s *server) handleListCheckins(w http.ResponseWriter, r *http.Request) {
	user, ok := currentUser(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "not authenticated")
		return
	}
	if err := requireRole(user, "mental_health_user"); err != nil {
		writeError(w, http.StatusForbidden, err.Error())
		return
	}

	rows, err := s.store.DB().QueryContext(
		r.Context(),
		`SELECT id, mood, stress, anxiety, sleep_hours, note, risk_level, created_at
		FROM checkins
		WHERE user_id = ?
		ORDER BY created_at DESC, id DESC
		LIMIT 40`,
		user.ID,
	)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to fetch check-ins")
		return
	}
	defer rows.Close()

	type item struct {
		ID         int64     `json:"id"`
		Mood       int       `json:"mood"`
		Stress     int       `json:"stress"`
		Anxiety    int       `json:"anxiety"`
		SleepHours float64   `json:"sleep_hours"`
		Note       string    `json:"note"`
		RiskLevel  string    `json:"risk_level"`
		CreatedAt  time.Time `json:"created_at"`
	}

	items := make([]item, 0)
	for rows.Next() {
		var current item
		if err := rows.Scan(&current.ID, &current.Mood, &current.Stress, &current.Anxiety, &current.SleepHours, &current.Note, &current.RiskLevel, &current.CreatedAt); err != nil {
			writeError(w, http.StatusInternalServerError, "failed to scan check-ins")
			return
		}
		items = append(items, current)
	}

	writeJSON(w, http.StatusOK, items)
}

func (s *server) handleCreateJournal(w http.ResponseWriter, r *http.Request) {
	user, ok := currentUser(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "not authenticated")
		return
	}
	if err := requireRole(user, "mental_health_user"); err != nil {
		writeError(w, http.StatusForbidden, err.Error())
		return
	}

	var req journalRequest
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	entry := strings.TrimSpace(req.Entry)
	if entry == "" {
		writeError(w, http.StatusBadRequest, "entry is required")
		return
	}

	result, err := s.store.DB().ExecContext(r.Context(), `INSERT INTO journal_entries(user_id, entry) VALUES(?, ?)`, user.ID, entry)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to save journal")
		return
	}
	journalID, _ := result.LastInsertId()
	_, _ = s.addRewardPoints(r.Context(), user.ID, 5)

	risk := detectRisk(entry)
	if risk == "medium" || risk == "high" {
		_ = s.store.CreateRiskEvent(r.Context(), user.ID, "journal", risk, "risk keywords detected in journal entry")
	}

	writeJSON(w, http.StatusCreated, map[string]any{
		"id":            journalID,
		"risk_level":    risk,
		"reward_points": 5,
	})
}

func (s *server) handleListJournal(w http.ResponseWriter, r *http.Request) {
	user, ok := currentUser(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "not authenticated")
		return
	}
	if err := requireRole(user, "mental_health_user"); err != nil {
		writeError(w, http.StatusForbidden, err.Error())
		return
	}

	rows, err := s.store.DB().QueryContext(r.Context(), `SELECT id, entry, created_at FROM journal_entries WHERE user_id = ? ORDER BY created_at DESC, id DESC LIMIT 30`, user.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to fetch journal entries")
		return
	}
	defer rows.Close()

	items := make([]map[string]any, 0)
	for rows.Next() {
		var (
			id        int64
			entry     string
			createdAt time.Time
		)
		if err := rows.Scan(&id, &entry, &createdAt); err != nil {
			writeError(w, http.StatusInternalServerError, "failed to scan journal entries")
			return
		}
		items = append(items, map[string]any{"id": id, "entry": entry, "created_at": createdAt.UTC()})
	}

	writeJSON(w, http.StatusOK, items)
}

func (s *server) handleCreateReminder(w http.ResponseWriter, r *http.Request) {
	user, ok := currentUser(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "not authenticated")
		return
	}
	if err := requireRole(user, "mental_health_user"); err != nil {
		writeError(w, http.StatusForbidden, err.Error())
		return
	}

	var req reminderRequest
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	req.Title = strings.TrimSpace(req.Title)
	req.ScheduleTime = strings.TrimSpace(req.ScheduleTime)
	if req.Title == "" || req.ScheduleTime == "" {
		writeError(w, http.StatusBadRequest, "title and schedule_time are required")
		return
	}

	result, err := s.store.DB().ExecContext(r.Context(), `INSERT INTO reminders(user_id, title, schedule_time) VALUES(?, ?, ?)`, user.ID, req.Title, req.ScheduleTime)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to create reminder")
		return
	}
	id, _ := result.LastInsertId()

	writeJSON(w, http.StatusCreated, map[string]any{
		"id":         id,
		"message":    "Reminder saved",
		"sms_status": "sent",
	})
}

func (s *server) handleListReminders(w http.ResponseWriter, r *http.Request) {
	user, ok := currentUser(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "not authenticated")
		return
	}
	if err := requireRole(user, "mental_health_user"); err != nil {
		writeError(w, http.StatusForbidden, err.Error())
		return
	}

	rows, err := s.store.DB().QueryContext(r.Context(), `SELECT id, title, schedule_time, is_active, created_at FROM reminders WHERE user_id = ? ORDER BY created_at DESC, id DESC LIMIT 50`, user.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to list reminders")
		return
	}
	defer rows.Close()

	items := make([]map[string]any, 0)
	for rows.Next() {
		var (
			id           int64
			title        string
			scheduleTime string
			isActive     int
			createdAt    time.Time
		)
		if err := rows.Scan(&id, &title, &scheduleTime, &isActive, &createdAt); err != nil {
			writeError(w, http.StatusInternalServerError, "failed to scan reminders")
			return
		}
		items = append(items, map[string]any{
			"id":            id,
			"title":         title,
			"schedule_time": scheduleTime,
			"is_active":     isActive == 1,
			"created_at":    createdAt.UTC(),
		})
	}

	writeJSON(w, http.StatusOK, items)
}

func (s *server) handleCreateAppointment(w http.ResponseWriter, r *http.Request) {
	user, ok := currentUser(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "not authenticated")
		return
	}
	if err := requireRole(user, "mental_health_user"); err != nil {
		writeError(w, http.StatusForbidden, err.Error())
		return
	}

	var req appointmentRequest
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	req.Therapist = strings.TrimSpace(req.Therapist)
	req.SessionMode = strings.TrimSpace(req.SessionMode)
	req.AppointmentTime = strings.TrimSpace(req.AppointmentTime)
	req.NotificationPhone = strings.TrimSpace(req.NotificationPhone)
	req.ContactPhone = strings.TrimSpace(req.ContactPhone)

	if req.SessionMode == "" || req.AppointmentTime == "" {
		writeError(w, http.StatusBadRequest, "session_mode and appointment_time are required")
		return
	}

	if req.CHWUserID > 0 {
		chw, err := s.store.GetUserByID(r.Context(), req.CHWUserID)
		if err != nil {
			if errors.Is(err, store.ErrNotFound) {
				writeError(w, http.StatusNotFound, "selected CHW account was not found")
				return
			}
			writeError(w, http.StatusInternalServerError, "failed to load selected CHW")
			return
		}
		if normalizeRole(chw.Role) != "community_health_worker" {
			writeError(w, http.StatusBadRequest, "selected account is not a Community Health Worker")
			return
		}
		if req.Therapist == "" {
			req.Therapist = chw.Name
		}
		if req.ContactPhone == "" {
			req.ContactPhone = chw.Phone
		}
	}

	if req.Therapist == "" {
		writeError(w, http.StatusBadRequest, "therapist is required")
		return
	}

	if req.CHWUserID > 0 && !isLinkedToCHW(r.Context(), s.store.DB(), user.ID, req.CHWUserID) {
		_, _ = s.store.DB().ExecContext(
			r.Context(),
			`INSERT INTO chw_links(user_id, chw_name, phone, region, chw_user_id) VALUES(?, ?, ?, ?, ?)`,
			user.ID,
			req.Therapist,
			firstNonEmpty(req.ContactPhone, user.Phone),
			"Nairobi",
			req.CHWUserID,
		)
	}

	result, err := s.store.DB().ExecContext(
		r.Context(),
		`INSERT INTO appointments(user_id, chw_user_id, therapist, session_mode, appointment_time) VALUES(?, ?, ?, ?, ?)`,
		user.ID,
		nullableInt64(req.CHWUserID),
		req.Therapist,
		req.SessionMode,
		req.AppointmentTime,
	)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to book appointment")
		return
	}
	id, _ := result.LastInsertId()
	points, _ := s.addRewardPoints(r.Context(), user.ID, 15)
	_, _ = s.store.DB().ExecContext(r.Context(), `INSERT INTO reminders(user_id, title, schedule_time) VALUES(?, ?, ?)`, user.ID, "Therapy session reminder", req.AppointmentTime)

	writeJSON(w, http.StatusCreated, map[string]any{
		"id":                  id,
		"reward_points":       points,
		"message":             "Appointment booked successfully",
		"sms_status":          statusForPhone(firstNonEmpty(req.NotificationPhone, user.Phone)),
		"sms_warning":         warningForMissingPhone(firstNonEmpty(req.NotificationPhone, user.Phone), "Add your phone number to receive appointment SMS updates."),
		"contact_sms_status":  statusForPhone(req.ContactPhone),
		"contact_sms_warning": warningForMissingPhone(req.ContactPhone, "The selected CHW has no phone number on file."),
	})
}

func (s *server) handleListAppointments(w http.ResponseWriter, r *http.Request) {
	user, ok := currentUser(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "not authenticated")
		return
	}

	if normalizeRole(user.Role) == "community_health_worker" {
		rows, err := s.store.DB().QueryContext(
			r.Context(),
			`SELECT a.id, a.therapist, a.session_mode, a.appointment_time, a.status, a.created_at, u.id, u.name, u.phone
			FROM appointments a
			JOIN users u ON u.id = a.user_id
			WHERE a.chw_user_id = ?
			ORDER BY a.appointment_time ASC, a.id DESC
			LIMIT 100`,
			user.ID,
		)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "failed to list appointments")
			return
		}
		defer rows.Close()

		items := make([]map[string]any, 0)
		for rows.Next() {
			var (
				id              int64
				therapist       string
				sessionMode     string
				appointmentTime string
				status          string
				createdAt       time.Time
				patientID       int64
				patientName     string
				patientPhone    string
			)
			if err := rows.Scan(&id, &therapist, &sessionMode, &appointmentTime, &status, &createdAt, &patientID, &patientName, &patientPhone); err != nil {
				writeError(w, http.StatusInternalServerError, "failed to scan appointments")
				return
			}
			items = append(items, map[string]any{
				"id":               id,
				"therapist":        therapist,
				"session_mode":     sessionMode,
				"appointment_time": appointmentTime,
				"status":           status,
				"created_at":       createdAt.UTC(),
				"patient_id":       patientID,
				"patient_name":     patientName,
				"patient_phone":    patientPhone,
			})
		}

		writeJSON(w, http.StatusOK, items)
		return
	}

	if err := requireRole(user, "mental_health_user"); err != nil {
		writeError(w, http.StatusForbidden, err.Error())
		return
	}

	rows, err := s.store.DB().QueryContext(r.Context(), `SELECT id, therapist, session_mode, appointment_time, status, created_at, chw_user_id FROM appointments WHERE user_id = ? ORDER BY appointment_time ASC, id DESC LIMIT 100`, user.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to list appointments")
		return
	}
	defer rows.Close()

	items := make([]map[string]any, 0)
	for rows.Next() {
		var (
			id              int64
			therapist       string
			sessionMode     string
			appointmentTime string
			status          string
			createdAt       time.Time
			chwUserID       sql.NullInt64
		)
		if err := rows.Scan(&id, &therapist, &sessionMode, &appointmentTime, &status, &createdAt, &chwUserID); err != nil {
			writeError(w, http.StatusInternalServerError, "failed to scan appointments")
			return
		}
		items = append(items, map[string]any{
			"id":               id,
			"therapist":        therapist,
			"session_mode":     sessionMode,
			"appointment_time": appointmentTime,
			"status":           status,
			"created_at":       createdAt.UTC(),
			"chw_user_id":      nullInt64(chwUserID),
		})
	}

	writeJSON(w, http.StatusOK, items)
}

func (s *server) handleCreateCommunityMessage(w http.ResponseWriter, r *http.Request) {
	user, ok := currentUser(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "not authenticated")
		return
	}

	var req communityMessageRequest
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	req.Room = strings.TrimSpace(strings.ToLower(req.Room))
	req.Message = strings.TrimSpace(req.Message)
	if req.Room == "" || req.Message == "" {
		writeError(w, http.StatusBadRequest, "room and message are required")
		return
	}

	result, err := s.store.DB().ExecContext(r.Context(), `INSERT INTO community_messages(user_id, room, message) VALUES(?, ?, ?)`, user.ID, req.Room, req.Message)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to save message")
		return
	}
	id, _ := result.LastInsertId()

	writeJSON(w, http.StatusCreated, map[string]any{"id": id, "message": "message posted"})
}

func (s *server) handleListCommunityMessages(w http.ResponseWriter, r *http.Request) {
	room := strings.TrimSpace(strings.ToLower(r.URL.Query().Get("room")))
	if room == "" {
		room = "general"
	}

	rows, err := s.store.DB().QueryContext(
		r.Context(),
		`SELECT m.id, m.room, m.message, m.created_at, u.id, u.name
		FROM community_messages m
		JOIN users u ON u.id = m.user_id
		WHERE m.room = ?
		ORDER BY m.created_at ASC, m.id ASC
		LIMIT 120`,
		room,
	)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to list community messages")
		return
	}
	defer rows.Close()

	items := make([]map[string]any, 0)
	for rows.Next() {
		var (
			id        int64
			roomName  string
			message   string
			createdAt time.Time
			userID    int64
			name      string
		)
		if err := rows.Scan(&id, &roomName, &message, &createdAt, &userID, &name); err != nil {
			writeError(w, http.StatusInternalServerError, "failed to scan community messages")
			return
		}
		items = append(items, map[string]any{
			"id":         id,
			"room":       roomName,
			"message":    message,
			"created_at": createdAt.UTC(),
			"user_id":    userID,
			"user_name":  name,
			"name":       name,
		})
	}

	writeJSON(w, http.StatusOK, items)
}

func (s *server) handleCreateCareMessage(w http.ResponseWriter, r *http.Request) {
	user, ok := currentUser(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "not authenticated")
		return
	}

	var req careMessageRequest
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	req.RoomID = strings.TrimSpace(req.RoomID)
	req.Message = strings.TrimSpace(req.Message)
	if req.RoomID == "" || req.Message == "" {
		writeError(w, http.StatusBadRequest, "room_id and message are required")
		return
	}

	if err := s.authorizeCareRoom(r, user, req.RoomID); err != nil {
		writeError(w, http.StatusForbidden, err.Error())
		return
	}

	result, err := s.store.DB().ExecContext(
		r.Context(),
		`INSERT INTO care_messages(room_id, sender_id, sender_name, sender_role, message) VALUES(?, ?, ?, ?, ?)`,
		req.RoomID,
		user.ID,
		user.Name,
		user.Role,
		req.Message,
	)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to save care message")
		return
	}
	messageID, _ := result.LastInsertId()

	firstID, secondID, _ := parseRoomID(req.RoomID)
	patientID := user.ID
	if normalizeRole(user.Role) == "community_health_worker" {
		if other := firstNonZeroPatientID(r.Context(), s.store.DB(), firstID, secondID); other > 0 {
			patientID = other
		}
	}
	if patientID > 0 {
		_ = s.ensureSessionProgressRow(r.Context(), patientID)
		_, _ = s.store.DB().ExecContext(r.Context(), `UPDATE session_progress SET chw_chat_complete = 1, updated_at = ? WHERE user_id = ?`, time.Now().UTC(), patientID)
	}

	writeJSON(w, http.StatusCreated, map[string]any{
		"id":          messageID,
		"room_id":     req.RoomID,
		"sender_id":   user.ID,
		"sender_name": user.Name,
		"sender_role": user.Role,
		"message":     req.Message,
		"created_at":  time.Now().UTC(),
	})
}

func (s *server) handleListCareMessages(w http.ResponseWriter, r *http.Request) {
	user, ok := currentUser(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "not authenticated")
		return
	}

	roomID := strings.TrimSpace(r.URL.Query().Get("room_id"))
	if roomID == "" {
		writeError(w, http.StatusBadRequest, "room_id is required")
		return
	}

	if err := s.authorizeCareRoom(r, user, roomID); err != nil {
		writeError(w, http.StatusForbidden, err.Error())
		return
	}

	rows, err := s.store.DB().QueryContext(
		r.Context(),
		`SELECT id, room_id, sender_id, sender_name, sender_role, message, created_at
		FROM care_messages
		WHERE room_id = ?
		ORDER BY created_at ASC, id ASC`,
		roomID,
	)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to load care messages")
		return
	}
	defer rows.Close()

	items := make([]map[string]any, 0)
	for rows.Next() {
		var (
			id         int64
			currentID  string
			senderID   int64
			senderName string
			senderRole string
			message    string
			createdAt  time.Time
		)
		if err := rows.Scan(&id, &currentID, &senderID, &senderName, &senderRole, &message, &createdAt); err != nil {
			writeError(w, http.StatusInternalServerError, "failed to scan care messages")
			return
		}
		items = append(items, map[string]any{
			"id":          id,
			"room_id":     currentID,
			"sender_id":   senderID,
			"sender_name": senderName,
			"sender_role": senderRole,
			"message":     message,
			"created_at":  createdAt.UTC(),
		})
	}

	writeJSON(w, http.StatusOK, items)
}

func (s *server) handleGetRewards(w http.ResponseWriter, r *http.Request) {
	user, ok := currentUser(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "not authenticated")
		return
	}
	if err := requireRole(user, "mental_health_user"); err != nil {
		writeError(w, http.StatusForbidden, err.Error())
		return
	}

	points, err := s.getRewardPoints(r.Context(), user.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to load rewards")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"points": points})
}

func (s *server) handleRedeemRewards(w http.ResponseWriter, r *http.Request) {
	user, ok := currentUser(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "not authenticated")
		return
	}
	if err := requireRole(user, "mental_health_user"); err != nil {
		writeError(w, http.StatusForbidden, err.Error())
		return
	}

	var req redeemRequest
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	if req.AmountPoints <= 0 {
		req.AmountPoints = 50
	}

	remaining, err := s.deductRewardPoints(r.Context(), user.ID, req.AmountPoints)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"message":          "Reward redemption simulated successfully",
		"amount_points":    req.AmountPoints,
		"remaining_points": remaining,
		"mpesa_reference":  fmt.Sprintf("MPESA-%d", time.Now().UnixNano()),
	})
}

func (s *server) handleDashboardSummary(w http.ResponseWriter, r *http.Request) {
	user, ok := currentUser(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "not authenticated")
		return
	}

	if normalizeRole(user.Role) == "community_health_worker" {
		var totalPatients, totalRisk, totalAppointments, totalCommunity int
		_ = s.store.DB().QueryRowContext(r.Context(), `SELECT COUNT(DISTINCT user_id) FROM chw_links WHERE chw_user_id = ?`, user.ID).Scan(&totalPatients)
		_ = s.store.DB().QueryRowContext(r.Context(), `SELECT COUNT(1) FROM checkins WHERE user_id IN (SELECT DISTINCT user_id FROM chw_links WHERE chw_user_id = ?) AND risk_level IN ('medium', 'high')`, user.ID).Scan(&totalRisk)
		_ = s.store.DB().QueryRowContext(r.Context(), `SELECT COUNT(1) FROM appointments WHERE chw_user_id = ?`, user.ID).Scan(&totalAppointments)
		_ = s.store.DB().QueryRowContext(r.Context(), `SELECT COUNT(1) FROM community_messages`).Scan(&totalCommunity)

		writeJSON(w, http.StatusOK, map[string]any{
			"user":                     user,
			"points":                   0,
			"chw_linked":               true,
			"total_checkins":           totalPatients,
			"total_risk_events":        totalRisk,
			"total_appointments":       totalAppointments,
			"total_community_messages": totalCommunity,
			"last_risk_level":          "monitoring",
		})
		return
	}

	points, _ := s.getRewardPoints(r.Context(), user.ID)
	var totalCheckins, totalRisk, totalAppointments, totalCommunity, linkedCount int
	var lastRisk string
	_ = s.store.DB().QueryRowContext(r.Context(), `SELECT COUNT(1) FROM chw_links WHERE user_id = ?`, user.ID).Scan(&linkedCount)
	_ = s.store.DB().QueryRowContext(r.Context(), `SELECT COUNT(1) FROM checkins WHERE user_id = ?`, user.ID).Scan(&totalCheckins)
	_ = s.store.DB().QueryRowContext(r.Context(), `SELECT COUNT(1) FROM risk_events WHERE user_id = ?`, user.ID).Scan(&totalRisk)
	_ = s.store.DB().QueryRowContext(r.Context(), `SELECT COUNT(1) FROM appointments WHERE user_id = ?`, user.ID).Scan(&totalAppointments)
	_ = s.store.DB().QueryRowContext(r.Context(), `SELECT COUNT(1) FROM community_messages`).Scan(&totalCommunity)
	_ = s.store.DB().QueryRowContext(r.Context(), `SELECT COALESCE((SELECT risk_level FROM checkins WHERE user_id = ? ORDER BY created_at DESC, id DESC LIMIT 1), 'low')`, user.ID).Scan(&lastRisk)

	writeJSON(w, http.StatusOK, map[string]any{
		"user":                     user,
		"points":                   points,
		"chw_linked":               linkedCount > 0,
		"total_checkins":           totalCheckins,
		"total_risk_events":        totalRisk,
		"total_appointments":       totalAppointments,
		"total_community_messages": totalCommunity,
		"last_risk_level":          lastRisk,
	})
}

func (s *server) handleSendMotivation(w http.ResponseWriter, r *http.Request) {
	user, ok := currentUser(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "not authenticated")
		return
	}

	var req motivationRequest
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	lang := normalizeLanguage(req.Language)
	if lang == "" {
		lang = normalizeLanguage(user.Language)
	}
	message := pickMotivation(lang)

	response := map[string]any{
		"message":  message,
		"language": lang,
	}
	if strings.TrimSpace(req.To) != "" {
		response["provider"] = map[string]any{
			"provider_status": "sent",
			"provider_id":     fmt.Sprintf("sim-%d", time.Now().UnixNano()),
			"provider_raw": map[string]any{
				"simulated": true,
			},
		}
	}

	writeJSON(w, http.StatusOK, response)
}

func (s *server) handleVoiceHelpline(w http.ResponseWriter, r *http.Request) {
	user, ok := currentUser(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "not authenticated")
		return
	}

	var req struct {
		Language string `json:"language"`
	}
	_ = decodeJSONAllowEmpty(r, &req)

	lang := normalizeLanguage(req.Language)
	if lang == "" {
		lang = normalizeLanguage(user.Language)
	}

	script := map[string]string{
		"en": "You are safe. Breathe in for four, hold for four, out for six. Help is available now.",
		"sw": "Uko salama. Vuta pumzi sekunde nne, shikilia nne, toa sita. Msaada upo sasa.",
		"fr": "Vous etes en securite. Inspirez quatre secondes, retenez quatre, expirez six. De l'aide est disponible.",
		"es": "Estas a salvo. Inhala cuatro segundos, sostén cuatro, exhala seis. Hay ayuda disponible ahora.",
		"ar": "You are safe. Breathe in for four, hold for four, out for six. Help is available now.",
	}[lang]

	writeJSON(w, http.StatusOK, map[string]any{"language": lang, "script": script})
}

func (s *server) handleResources(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, []map[string]any{
		{"category": "depression", "title": "Understanding Depression", "summary": "Signs, support options, and recovery steps."},
		{"category": "anxiety", "title": "Grounding for Anxiety", "summary": "Fast regulation techniques during panic."},
		{"category": "stress", "title": "Stress Recovery Plan", "summary": "Practical daily structure to reduce overload."},
		{"category": "sleep", "title": "Sleep Hygiene", "summary": "Habits that improve sleep quality."},
		{"category": "crisis", "title": "Crisis Contacts", "summary": "Immediate actions for suicidal or high-risk distress."},
	})
}

func (s *server) handleGetSessionProgress(w http.ResponseWriter, r *http.Request) {
	user, ok := currentUser(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "not authenticated")
		return
	}
	if err := requireRole(user, "mental_health_user"); err != nil {
		writeError(w, http.StatusForbidden, err.Error())
		return
	}

	status, err := s.getSessionProgressStatus(r.Context(), user.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to load session progress")
		return
	}

	writeJSON(w, http.StatusOK, status)
}

func (s *server) handleUpdateSessionProgress(w http.ResponseWriter, r *http.Request) {
	user, ok := currentUser(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "not authenticated")
		return
	}
	if err := requireRole(user, "mental_health_user"); err != nil {
		writeError(w, http.StatusForbidden, err.Error())
		return
	}

	var req sessionProgressUpdateRequest
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	if err := s.ensureSessionProgressRow(r.Context(), user.ID); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to prepare session progress")
		return
	}

	current, err := s.getSessionProgressStatus(r.Context(), user.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to load session progress")
		return
	}

	exercise := current.ExerciseComplete
	chwChat := current.CHWChatComplete
	guidance := current.GuidanceComplete
	reflection := current.Reflection
	if req.ExerciseComplete != nil {
		exercise = *req.ExerciseComplete
	}
	if req.CHWChatComplete != nil {
		chwChat = *req.CHWChatComplete
	}
	if req.GuidanceComplete != nil {
		guidance = *req.GuidanceComplete
	}
	if req.Reflection != nil {
		reflection = strings.TrimSpace(*req.Reflection)
	}

	_, err = s.store.DB().ExecContext(
		r.Context(),
		`UPDATE session_progress
		SET exercise_complete = ?, chw_chat_complete = ?, guidance_complete = ?, reflection = ?, updated_at = ?
		WHERE user_id = ?`,
		boolToInt(exercise),
		boolToInt(chwChat),
		boolToInt(guidance),
		reflection,
		time.Now().UTC(),
		user.ID,
	)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to update session progress")
		return
	}

	status, err := s.getSessionProgressStatus(r.Context(), user.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to reload session progress")
		return
	}

	writeJSON(w, http.StatusOK, status)
}

func (s *server) handleRequestCertificateApproval(w http.ResponseWriter, r *http.Request) {
	user, ok := currentUser(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "not authenticated")
		return
	}
	if err := requireRole(user, "mental_health_user"); err != nil {
		writeError(w, http.StatusForbidden, err.Error())
		return
	}

	status, err := s.getSessionProgressStatus(r.Context(), user.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to load session progress")
		return
	}
	if !status.RequiresCHWApproval {
		writeError(w, http.StatusBadRequest, "link a CHW before requesting certificate approval")
		return
	}
	if !status.ChecklistComplete {
		writeError(w, http.StatusBadRequest, "complete the session checklist before requesting CHW approval")
		return
	}

	now := time.Now().UTC()
	_, err = s.store.DB().ExecContext(
		r.Context(),
		`UPDATE session_progress
		SET certificate_requested_at = COALESCE(certificate_requested_at, ?), updated_at = ?
		WHERE user_id = ?`,
		now,
		now,
		user.ID,
	)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to request certificate approval")
		return
	}

	updated, err := s.getSessionProgressStatus(r.Context(), user.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to reload session progress")
		return
	}

	writeJSON(w, http.StatusOK, updated)
}

func (s *server) handleListCHWCertificateRequests(w http.ResponseWriter, r *http.Request) {
	user, ok := currentUser(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "not authenticated")
		return
	}
	if err := requireRole(user, "community_health_worker"); err != nil {
		writeError(w, http.StatusForbidden, err.Error())
		return
	}

	rows, err := s.store.DB().QueryContext(
		r.Context(),
		`SELECT
			u.id,
			u.name,
			u.phone,
			sp.exercise_complete,
			sp.chw_chat_complete,
			sp.guidance_complete,
			sp.reflection,
			sp.certificate_requested_at,
			sp.chw_approved_at,
			sp.updated_at,
			COALESCE((
				SELECT c.risk_level
				FROM checkins c
				WHERE c.user_id = u.id
				ORDER BY c.created_at DESC, c.id DESC
				LIMIT 1
			), 'low') AS current_risk_level
		FROM session_progress sp
		JOIN users u ON u.id = sp.user_id
		WHERE sp.user_id IN (
			SELECT DISTINCT user_id
			FROM chw_links
			WHERE chw_user_id = ?
		)
		AND sp.certificate_requested_at IS NOT NULL
		ORDER BY sp.certificate_requested_at DESC, sp.updated_at DESC`,
		user.ID,
	)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to load certificate requests")
		return
	}
	defer rows.Close()

	items := make([]map[string]any, 0)
	for rows.Next() {
		var (
			patientID              int64
			patientName            string
			patientPhone           string
			exerciseComplete       int
			chwChatComplete        int
			guidanceComplete       int
			reflection             string
			certificateRequestedAt sql.NullTime
			chwApprovedAt          sql.NullTime
			updatedAt              time.Time
			currentRisk            string
		)
		if err := rows.Scan(&patientID, &patientName, &patientPhone, &exerciseComplete, &chwChatComplete, &guidanceComplete, &reflection, &certificateRequestedAt, &chwApprovedAt, &updatedAt, &currentRisk); err != nil {
			writeError(w, http.StatusInternalServerError, "failed to scan certificate requests")
			return
		}
		checklistComplete := buildChecklistComplete(currentRisk, exerciseComplete == 1, chwChatComplete == 1, guidanceComplete == 1)
		items = append(items, map[string]any{
			"patient_id":               patientID,
			"patient_name":             patientName,
			"patient_phone":            patientPhone,
			"exercise_complete":        exerciseComplete == 1,
			"chw_chat_complete":        chwChatComplete == 1,
			"guidance_complete":        guidanceComplete == 1,
			"reflection":               reflection,
			"certificate_requested_at": nullTime(certificateRequestedAt),
			"chw_approved_at":          nullTime(chwApprovedAt),
			"updated_at":               updatedAt.UTC(),
			"current_risk_level":       currentRisk,
			"checklist_complete":       checklistComplete,
			"certificate_approved":     chwApprovedAt.Valid,
		})
	}

	writeJSON(w, http.StatusOK, items)
}

func (s *server) handleApproveCHWCertificateRequest(w http.ResponseWriter, r *http.Request) {
	user, ok := currentUser(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "not authenticated")
		return
	}
	if err := requireRole(user, "community_health_worker"); err != nil {
		writeError(w, http.StatusForbidden, err.Error())
		return
	}

	patientID, err := strconv.ParseInt(chi.URLParam(r, "patientID"), 10, 64)
	if err != nil || patientID <= 0 {
		writeError(w, http.StatusBadRequest, "invalid patient id")
		return
	}

	if !isLinkedToCHW(r.Context(), s.store.DB(), patientID, user.ID) {
		writeError(w, http.StatusForbidden, "this patient is not assigned to you")
		return
	}

	status, err := s.getSessionProgressStatus(r.Context(), patientID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to load patient progress")
		return
	}
	if !status.ChecklistComplete {
		writeError(w, http.StatusBadRequest, "the patient has not completed the required checklist yet")
		return
	}

	now := time.Now().UTC()
	_, err = s.store.DB().ExecContext(
		r.Context(),
		`UPDATE session_progress
		SET certificate_requested_at = COALESCE(certificate_requested_at, ?),
			chw_approved_at = ?,
			approved_by_chw_id = ?,
			updated_at = ?
		WHERE user_id = ?`,
		now,
		now,
		user.ID,
		now,
		patientID,
	)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to approve certificate request")
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"message":     "Certificate request approved",
		"patient_id":  patientID,
		"approved_at": now,
	})
}

func (s *server) handleGenerateCertificate(w http.ResponseWriter, r *http.Request) {
	user, ok := currentUser(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "not authenticated")
		return
	}
	if err := requireRole(user, "mental_health_user"); err != nil {
		writeError(w, http.StatusForbidden, err.Error())
		return
	}

	progress, err := s.getSessionProgressStatus(r.Context(), user.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to load session progress")
		return
	}
	if !progress.CanGenerateCertificate {
		if progress.RequiresCHWApproval && !progress.CertificateApproved {
			writeError(w, http.StatusBadRequest, "your CHW must approve the completed session before the certificate can be downloaded")
			return
		}
		writeError(w, http.StatusBadRequest, "complete the required session steps before downloading the certificate")
		return
	}

	rows, err := s.store.DB().QueryContext(r.Context(), `SELECT mood, risk_level FROM checkins WHERE user_id = ? ORDER BY created_at DESC, id DESC LIMIT 14`, user.ID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to load check-ins")
		return
	}
	defer rows.Close()

	totalMood := 0
	count := 0
	highCount := 0
	for rows.Next() {
		var mood int
		var risk string
		if err := rows.Scan(&mood, &risk); err != nil {
			writeError(w, http.StatusInternalServerError, "failed to scan check-ins")
			return
		}
		totalMood += mood
		count++
		if risk == "high" {
			highCount++
		}
	}

	avgMood := 0.0
	if count > 0 {
		avgMood = float64(totalMood) / float64(count)
	}

	status := "Stable"
	summary := "Consistent follow-up recommended."
	if highCount >= 2 || (count > 0 && avgMood < 4) {
		status = "Needs Intensive Follow-up"
		summary = "Multiple high-risk indicators detected."
	} else if count > 0 && avgMood < 6 {
		status = "Needs Follow-up"
		summary = "Moderate symptoms present; keep CHW support active."
	}
	if progress.CertificateApproved {
		summary = strings.TrimSpace(summary + " CHW approval confirmed for certificate release.")
	}

	result, err := s.store.DB().ExecContext(
		r.Context(),
		`INSERT INTO certificates(user_id, status, summary, approved_by_chw_id) VALUES(?, ?, ?, ?)`,
		user.ID,
		status,
		summary,
		nullableInt64Value(progress.ApprovedByCHWID),
	)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to store certificate")
		return
	}
	certificateID, _ := result.LastInsertId()

	writeJSON(w, http.StatusOK, map[string]any{
		"certificate_id": certificateID,
		"status":         status,
		"summary":        summary,
		"avg_mood":       avgMood,
		"created_at":     time.Now().UTC(),
	})
}

func (s *server) authorizeCareRoom(r *http.Request, user store.User, roomID string) error {
	firstID, secondID, err := parseRoomID(roomID)
	if err != nil {
		return errors.New("invalid room id")
	}
	if user.ID != firstID && user.ID != secondID {
		return errors.New("you do not have access to this care room")
	}

	otherID := secondID
	if otherID == user.ID {
		otherID = firstID
	}
	otherUser, err := s.store.GetUserByID(r.Context(), otherID)
	if err != nil {
		return errors.New("the other participant could not be found")
	}

	selfRole := normalizeRole(user.Role)
	otherRole := normalizeRole(otherUser.Role)
	if selfRole == otherRole {
		return errors.New("care chat only supports patient-to-CHW rooms")
	}

	patientID := user.ID
	chwID := otherID
	if selfRole == "community_health_worker" {
		patientID = otherID
		chwID = user.ID
	}
	if !isLinkedToCHW(r.Context(), s.store.DB(), patientID, chwID) {
		return errors.New("this patient and CHW are not linked")
	}
	return nil
}

func (s *server) ensureSessionProgressRow(ctx context.Context, userID int64) error {
	_, err := s.store.DB().ExecContext(ctx, `INSERT OR IGNORE INTO session_progress(user_id) VALUES(?)`, userID)
	return err
}

func (s *server) getSessionProgressStatus(ctx context.Context, userID int64) (sessionProgressStatus, error) {
	if err := s.ensureSessionProgressRow(ctx, userID); err != nil {
		return sessionProgressStatus{}, err
	}

	status := sessionProgressStatus{}
	var (
		exerciseComplete       int
		chwChatComplete        int
		guidanceComplete       int
		reflection             string
		certificateRequestedAt sql.NullTime
		chwApprovedAt          sql.NullTime
		approvedByCHWID        sql.NullInt64
		updatedAt              time.Time
	)

	err := s.store.DB().QueryRowContext(
		ctx,
		`SELECT exercise_complete, chw_chat_complete, guidance_complete, reflection, certificate_requested_at, chw_approved_at, approved_by_chw_id, updated_at
		FROM session_progress
		WHERE user_id = ?`,
		userID,
	).Scan(&exerciseComplete, &chwChatComplete, &guidanceComplete, &reflection, &certificateRequestedAt, &chwApprovedAt, &approvedByCHWID, &updatedAt)
	if err != nil {
		return sessionProgressStatus{}, err
	}

	currentRisk := latestRiskLevel(ctx, s.store.DB(), userID)
	status.ExerciseComplete = exerciseComplete == 1
	status.CHWChatComplete = chwChatComplete == 1
	status.GuidanceComplete = guidanceComplete == 1
	status.Reflection = reflection
	status.CertificateRequested = certificateRequestedAt.Valid
	status.CertificateApproved = chwApprovedAt.Valid
	status.RequiresCHWApproval = hasLinkedCHW(ctx, s.store.DB(), userID)
	status.CurrentRiskLevel = currentRisk
	status.ChecklistComplete = buildChecklistComplete(currentRisk, status.ExerciseComplete, status.CHWChatComplete, status.GuidanceComplete)
	status.CanGenerateCertificate = status.ChecklistComplete && (!status.RequiresCHWApproval || status.CertificateApproved)
	status.UpdatedAt = &updatedAt
	if certificateRequestedAt.Valid {
		t := certificateRequestedAt.Time.UTC()
		status.CertificateRequestedAt = &t
	}
	if chwApprovedAt.Valid {
		t := chwApprovedAt.Time.UTC()
		status.CHWApprovedAt = &t
	}
	if approvedByCHWID.Valid {
		id := approvedByCHWID.Int64
		status.ApprovedByCHWID = &id
	}

	return status, nil
}

func (s *server) getRewardPoints(ctx context.Context, userID int64) (int, error) {
	_, _ = s.store.DB().ExecContext(ctx, `INSERT OR IGNORE INTO rewards(user_id, points) VALUES(?, 0)`, userID)
	var points int
	if err := s.store.DB().QueryRowContext(ctx, `SELECT points FROM rewards WHERE user_id = ?`, userID).Scan(&points); err != nil {
		return 0, err
	}
	return points, nil
}

func (s *server) addRewardPoints(ctx context.Context, userID int64, delta int) (int, error) {
	points, err := s.getRewardPoints(ctx, userID)
	if err != nil {
		return 0, err
	}
	points += delta
	_, err = s.store.DB().ExecContext(ctx, `UPDATE rewards SET points = ?, updated_at = ? WHERE user_id = ?`, points, time.Now().UTC(), userID)
	return points, err
}

func (s *server) deductRewardPoints(ctx context.Context, userID int64, delta int) (int, error) {
	points, err := s.getRewardPoints(ctx, userID)
	if err != nil {
		return 0, err
	}
	if delta > points {
		return points, errors.New("not enough points")
	}
	points -= delta
	_, err = s.store.DB().ExecContext(ctx, `UPDATE rewards SET points = ?, updated_at = ? WHERE user_id = ?`, points, time.Now().UTC(), userID)
	return points, err
}

func decodeJSONAllowEmpty(r *http.Request, destination any) error {
	if r.Body == nil || r.ContentLength == 0 {
		return nil
	}
	return decodeJSON(r, destination)
}

func requireRole(user store.User, expected string) error {
	if normalizeRole(user.Role) != normalizeRole(expected) {
		return fmt.Errorf("access denied: %s role required", strings.ReplaceAll(expected, "_", " "))
	}
	return nil
}

func detectRiskFromSignals(text string, mood, stress, anxiety int, sleepHours float64) string {
	textRisk := detectRisk(text)
	if textRisk == "high" {
		return "high"
	}
	if mood <= 2 || stress >= 9 || anxiety >= 9 || sleepHours < 3 {
		return "high"
	}
	if textRisk == "medium" || mood <= 4 || stress >= 7 || anxiety >= 7 || sleepHours < 5 {
		return "medium"
	}
	return "low"
}

func assessPHQ9(answers []int) (phq9Assessment, error) {
	if len(answers) == 0 {
		return phq9Assessment{Provided: false, Severity: "not_assessed", RiskLevel: "low"}, nil
	}
	if len(answers) != 9 {
		return phq9Assessment{}, fmt.Errorf("phq9_answers must contain 9 values (0-3)")
	}

	score := 0
	for index, value := range answers {
		if value < 0 || value > 3 {
			return phq9Assessment{}, fmt.Errorf("phq9_answers[%d] must be between 0 and 3", index)
		}
		score += value
	}

	severity := "minimal"
	switch {
	case score >= 20:
		severity = "severe"
	case score >= 15:
		severity = "moderately_severe"
	case score >= 10:
		severity = "moderate"
	case score >= 5:
		severity = "mild"
	}

	risk := "low"
	if score >= 20 || answers[8] >= 2 {
		risk = "high"
	} else if score >= 10 || answers[8] == 1 {
		risk = "medium"
	}

	return phq9Assessment{
		Provided:  true,
		Score:     score,
		Severity:  severity,
		RiskLevel: risk,
	}, nil
}

func assessAdditionalAdmissionRisk(req admissionRequest) string {
	risk := "low"
	if len(req.GAD7Answers) == 7 {
		total := sumNumbers(req.GAD7Answers)
		if total >= 15 {
			risk = maxRiskLevel(risk, "high")
		} else if total >= 10 {
			risk = maxRiskLevel(risk, "medium")
		}
	}
	if len(req.AUDITAnswers) == 10 {
		total := sumNumbers(req.AUDITAnswers)
		if total >= 20 {
			risk = maxRiskLevel(risk, "high")
		} else if total >= 8 {
			risk = maxRiskLevel(risk, "medium")
		}
	}
	if len(req.CSSRSAnswers) > 0 {
		for index, value := range req.CSSRSAnswers {
			if value && index >= 1 {
				return "high"
			}
		}
	}
	return risk
}

func buildCareRecommendation(risk string, phq phq9Assessment, chwLinked bool, language string) careRecommendation {
	switch risk {
	case "high":
		actions := []string{"Use guided support now", "Contact your CHW or trusted person", "Do not stay alone if you feel unsafe"}
		if !chwLinked {
			actions[1] = "Link a CHW and book support now"
		}
		return careRecommendation{
			Type:    "escalation",
			Message: "High-risk signals were detected. Take the next supportive step now and involve another person if you can.",
			Actions: actions,
		}
	case "medium":
		return careRecommendation{
			Type:    "follow_up",
			Message: "Moderate symptoms are present. Use one practical exercise today and arrange a human follow-up soon.",
			Actions: []string{"Complete a grounding exercise", "Book a CHW or therapy follow-up", "Review your care resources"},
		}
	default:
		message := pickMotivation(normalizeLanguage(language))
		if phq.Provided && phq.Score >= 5 {
			message = "Symptoms look lower right now, but consistency still matters. Keep checking in and use one short exercise today."
		}
		return careRecommendation{
			Type:    "motivation",
			Message: message,
			Actions: []string{"Box breathing", "Short walk", "Journal one page"},
		}
	}
}

func composeAdmissionSummary(primaryConcern, safetyContact string) string {
	chunks := make([]string, 0, 2)
	if strings.TrimSpace(primaryConcern) != "" {
		chunks = append(chunks, "Primary concern: "+strings.TrimSpace(primaryConcern))
	}
	if strings.TrimSpace(safetyContact) != "" {
		chunks = append(chunks, "Safety contact: "+strings.TrimSpace(safetyContact))
	}
	return strings.Join(chunks, " | ")
}

func pickMotivation(language string) string {
	options := map[string][]string{
		"en": {
			"You are not alone. One small step today still counts.",
			"Breathe slowly: in 4, hold 4, out 6. You are doing your best.",
			"Healing is progress, not perfection.",
		},
		"sw": {
			"Hauko peke yako. Hatua ndogo leo ni muhimu.",
			"Vuta pumzi: ndani 4, shikilia 4, toa 6. Utafika.",
			"Kupona ni safari, sio mashindano.",
		},
		"fr": {
			"Vous n'etes pas seul. Chaque petit pas compte.",
			"Respirez lentement: 4, 4, 6. Continuez doucement.",
			"La guerison est un parcours, pas une course.",
		},
		"es": {
			"No estas solo. Un paso pequeno hoy todavia cuenta.",
			"Respira lento: entra 4, sostén 4, suelta 6. Lo estas intentando.",
			"Sanar es progreso, no perfeccion.",
		},
	}
	values := options[normalizeLanguage(language)]
	if len(values) == 0 {
		values = options["en"]
	}
	return values[int(time.Now().Unix()/86400)%len(values)]
}

func latestRiskLevel(ctx context.Context, db *sql.DB, userID int64) string {
	var risk string
	_ = db.QueryRowContext(ctx, `SELECT COALESCE((SELECT risk_level FROM checkins WHERE user_id = ? ORDER BY created_at DESC, id DESC LIMIT 1), 'low')`, userID).Scan(&risk)
	if strings.TrimSpace(risk) == "" {
		return "low"
	}
	return risk
}

func buildChecklistComplete(risk string, exerciseComplete, chwChatComplete, guidanceComplete bool) bool {
	if risk == "medium" || risk == "high" {
		return exerciseComplete && guidanceComplete && chwChatComplete
	}
	return exerciseComplete && guidanceComplete
}

func hasLinkedCHW(ctx context.Context, db *sql.DB, userID int64) bool {
	var count int
	_ = db.QueryRowContext(ctx, `SELECT COUNT(1) FROM chw_links WHERE user_id = ?`, userID).Scan(&count)
	return count > 0
}

func isLinkedToCHW(ctx context.Context, db *sql.DB, patientID, chwID int64) bool {
	var count int
	_ = db.QueryRowContext(ctx, `SELECT COUNT(1) FROM chw_links WHERE user_id = ? AND chw_user_id = ?`, patientID, chwID).Scan(&count)
	return count > 0
}

func parseRoomID(roomID string) (int64, int64, error) {
	if !strings.HasPrefix(roomID, "care-room-") {
		return 0, 0, errors.New("invalid prefix")
	}
	parts := strings.Split(strings.TrimPrefix(roomID, "care-room-"), "-")
	if len(parts) != 2 {
		return 0, 0, errors.New("invalid room format")
	}
	firstID, err := strconv.ParseInt(parts[0], 10, 64)
	if err != nil {
		return 0, 0, err
	}
	secondID, err := strconv.ParseInt(parts[1], 10, 64)
	if err != nil {
		return 0, 0, err
	}
	return firstID, secondID, nil
}

func firstNonZeroPatientID(ctx context.Context, db *sql.DB, firstID, secondID int64) int64 {
	for _, candidate := range []int64{firstID, secondID} {
		var role string
		if err := db.QueryRowContext(ctx, `SELECT role FROM users WHERE id = ?`, candidate).Scan(&role); err == nil && normalizeRole(role) == "mental_health_user" {
			return candidate
		}
	}
	return 0
}

func maxRiskLevel(left, right string) string {
	if riskRank(right) > riskRank(left) {
		return right
	}
	return left
}

func riskRank(risk string) int {
	switch strings.ToLower(strings.TrimSpace(risk)) {
	case "high":
		return 3
	case "medium":
		return 2
	default:
		return 1
	}
}

func sumNumbers(values []int) int {
	total := 0
	for _, value := range values {
		total += value
	}
	return total
}

func boolToInt(value bool) int {
	if value {
		return 1
	}
	return 0
}

func nullableInt64(value int64) any {
	if value <= 0 {
		return nil
	}
	return value
}

func nullableInt64Value(value *int64) any {
	if value == nil || *value <= 0 {
		return nil
	}
	return *value
}

func nullableScore(provided bool, score int) any {
	if !provided {
		return nil
	}
	return score
}

func nullTime(value sql.NullTime) any {
	if !value.Valid {
		return nil
	}
	return value.Time.UTC()
}

func nullInt64(value sql.NullInt64) any {
	if !value.Valid {
		return nil
	}
	return value.Int64
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return value
		}
	}
	return ""
}

func statusForPhone(phone string) string {
	if strings.TrimSpace(phone) == "" {
		return "skipped"
	}
	return "sent"
}

func warningForMissingPhone(phone, message string) string {
	if strings.TrimSpace(phone) == "" {
		return message
	}
	return ""
}
