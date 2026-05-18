package store

import (
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	_ "github.com/mattn/go-sqlite3"
)

var (
	ErrNotFound = errors.New("not found")
	ErrConflict = errors.New("conflict")
)

type User struct {
	ID       int64  `json:"id"`
	Name     string `json:"name"`
	Email    string `json:"email"`
	Phone    string `json:"phone"`
	Language string `json:"language"`
	Role     string `json:"role"`
}

type CreateUserInput struct {
	Name         string
	Email        string
	Phone        string
	Language     string
	Role         string
	PasswordHash string
}

type Store struct {
	db *sql.DB
}

func (s *Store) DB() *sql.DB {
	if s == nil {
		return nil
	}
	return s.db
}

func New(dbPath string) (*Store, error) {
	cleanPath := filepath.Clean(dbPath)
	if err := os.MkdirAll(filepath.Dir(cleanPath), 0o755); err != nil {
		return nil, fmt.Errorf("create db dir: %w", err)
	}

	db, err := sql.Open("sqlite3", cleanPath)
	if err != nil {
		return nil, fmt.Errorf("open sqlite: %w", err)
	}

	db.SetMaxOpenConns(1)
	db.SetMaxIdleConns(1)
	db.SetConnMaxLifetime(0)

	if _, err := db.Exec(`PRAGMA foreign_keys = ON;`); err != nil {
		_ = db.Close()
		return nil, fmt.Errorf("enable foreign keys: %w", err)
	}

	store := &Store{db: db}
	if err := store.migrate(); err != nil {
		_ = db.Close()
		return nil, err
	}

	return store, nil
}

func (s *Store) Close() error {
	if s == nil || s.db == nil {
		return nil
	}
	return s.db.Close()
}

func (s *Store) migrate() error {
	statements := []string{
		`CREATE TABLE IF NOT EXISTS users (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			name TEXT NOT NULL,
			email TEXT NOT NULL UNIQUE,
			phone TEXT NOT NULL DEFAULT '',
			language TEXT NOT NULL DEFAULT 'en',
			role TEXT NOT NULL DEFAULT 'mental_health_user',
			password_hash TEXT NOT NULL,
			created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
		);`,
		`CREATE TABLE IF NOT EXISTS sessions (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			user_id INTEGER NOT NULL,
			token TEXT NOT NULL UNIQUE,
			expires_at DATETIME NOT NULL,
			created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
			FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
		);`,
		`CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token);`,
		`CREATE TABLE IF NOT EXISTS risk_events (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			user_id INTEGER NOT NULL,
			source TEXT NOT NULL,
			severity TEXT NOT NULL,
			message TEXT NOT NULL,
			created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
			FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
		);`,
		`CREATE TABLE IF NOT EXISTS rewards (
			user_id INTEGER PRIMARY KEY,
			points INTEGER NOT NULL DEFAULT 0,
			updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
			FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
		);`,
		`CREATE TABLE IF NOT EXISTS chw_links (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			user_id INTEGER NOT NULL,
			chw_name TEXT NOT NULL,
			phone TEXT NOT NULL,
			region TEXT NOT NULL,
			chw_user_id INTEGER,
			created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
			FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
			FOREIGN KEY(chw_user_id) REFERENCES users(id) ON DELETE SET NULL
		);`,
		`CREATE TABLE IF NOT EXISTS checkins (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			user_id INTEGER NOT NULL,
			mood INTEGER NOT NULL,
			stress INTEGER NOT NULL,
			anxiety INTEGER NOT NULL,
			sleep_hours REAL NOT NULL,
			note TEXT NOT NULL DEFAULT '',
			risk_level TEXT NOT NULL,
			created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
			FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
		);`,
		`CREATE TABLE IF NOT EXISTS journal_entries (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			user_id INTEGER NOT NULL,
			entry TEXT NOT NULL,
			created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
			FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
		);`,
		`CREATE TABLE IF NOT EXISTS reminders (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			user_id INTEGER NOT NULL,
			title TEXT NOT NULL,
			schedule_time TEXT NOT NULL,
			is_active INTEGER NOT NULL DEFAULT 1,
			created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
			FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
		);`,
		`CREATE TABLE IF NOT EXISTS appointments (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			user_id INTEGER NOT NULL,
			chw_user_id INTEGER,
			therapist TEXT NOT NULL,
			session_mode TEXT NOT NULL,
			appointment_time TEXT NOT NULL,
			status TEXT NOT NULL DEFAULT 'booked',
			created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
			FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
			FOREIGN KEY(chw_user_id) REFERENCES users(id) ON DELETE SET NULL
		);`,
		`CREATE TABLE IF NOT EXISTS community_messages (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			user_id INTEGER NOT NULL,
			room TEXT NOT NULL,
			message TEXT NOT NULL,
			created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
			FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
		);`,
		`CREATE TABLE IF NOT EXISTS care_messages (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			room_id TEXT NOT NULL,
			sender_id INTEGER NOT NULL,
			sender_name TEXT NOT NULL,
			sender_role TEXT NOT NULL,
			message TEXT NOT NULL,
			created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
			FOREIGN KEY(sender_id) REFERENCES users(id) ON DELETE CASCADE
		);`,
		`CREATE TABLE IF NOT EXISTS certificates (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			user_id INTEGER NOT NULL,
			status TEXT NOT NULL,
			summary TEXT NOT NULL,
			approved_by_chw_id INTEGER,
			created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
			FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
			FOREIGN KEY(approved_by_chw_id) REFERENCES users(id) ON DELETE SET NULL
		);`,
		`CREATE TABLE IF NOT EXISTS session_progress (
			user_id INTEGER PRIMARY KEY,
			exercise_complete INTEGER NOT NULL DEFAULT 0,
			chw_chat_complete INTEGER NOT NULL DEFAULT 0,
			guidance_complete INTEGER NOT NULL DEFAULT 0,
			reflection TEXT NOT NULL DEFAULT '',
			certificate_requested_at DATETIME,
			chw_approved_at DATETIME,
			approved_by_chw_id INTEGER,
			updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
			FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
			FOREIGN KEY(approved_by_chw_id) REFERENCES users(id) ON DELETE SET NULL
		);`,
		`CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);`,
		`CREATE INDEX IF NOT EXISTS idx_chw_links_user ON chw_links(user_id);`,
		`CREATE INDEX IF NOT EXISTS idx_chw_links_chw_user ON chw_links(chw_user_id);`,
		`CREATE INDEX IF NOT EXISTS idx_checkins_user_created ON checkins(user_id, created_at DESC);`,
		`CREATE INDEX IF NOT EXISTS idx_appointments_user_created ON appointments(user_id, created_at DESC);`,
		`CREATE INDEX IF NOT EXISTS idx_appointments_chw_user ON appointments(chw_user_id, appointment_time);`,
		`CREATE INDEX IF NOT EXISTS idx_community_room_created ON community_messages(room, created_at DESC);`,
		`CREATE INDEX IF NOT EXISTS idx_care_room_created ON care_messages(room_id, created_at DESC);`,
	}

	for _, statement := range statements {
		if _, err := s.db.Exec(statement); err != nil {
			return fmt.Errorf("migrate sqlite: %w", err)
		}
	}

	_, _ = s.db.Exec(`ALTER TABLE appointments ADD COLUMN chw_user_id INTEGER`)
	_, _ = s.db.Exec(`ALTER TABLE certificates ADD COLUMN approved_by_chw_id INTEGER`)

	return nil
}

func (s *Store) CreateUser(ctx context.Context, input CreateUserInput) (User, error) {
	result, err := s.db.ExecContext(
		ctx,
		`INSERT INTO users(name, email, phone, language, role, password_hash) VALUES(?, ?, ?, ?, ?, ?)`,
		input.Name,
		input.Email,
		input.Phone,
		input.Language,
		input.Role,
		input.PasswordHash,
	)
	if err != nil {
		if strings.Contains(strings.ToLower(err.Error()), "unique") {
			return User{}, ErrConflict
		}
		return User{}, err
	}

	id, err := result.LastInsertId()
	if err != nil {
		return User{}, err
	}

	_, _ = s.db.ExecContext(ctx, `INSERT OR IGNORE INTO rewards(user_id, points) VALUES(?, 0)`, id)
	_, _ = s.db.ExecContext(ctx, `INSERT OR IGNORE INTO session_progress(user_id) VALUES(?)`, id)

	return s.GetUserByID(ctx, id)
}

func (s *Store) GetUserByID(ctx context.Context, id int64) (User, error) {
	var user User
	row := s.db.QueryRowContext(ctx, `SELECT id, name, email, phone, language, role FROM users WHERE id = ?`, id)
	if err := row.Scan(&user.ID, &user.Name, &user.Email, &user.Phone, &user.Language, &user.Role); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return User{}, ErrNotFound
		}
		return User{}, err
	}
	return user, nil
}

func (s *Store) GetUserByEmail(ctx context.Context, email string) (User, string, error) {
	var user User
	var passwordHash string
	row := s.db.QueryRowContext(ctx, `SELECT id, name, email, phone, language, role, password_hash FROM users WHERE email = ?`, email)
	if err := row.Scan(&user.ID, &user.Name, &user.Email, &user.Phone, &user.Language, &user.Role, &passwordHash); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return User{}, "", ErrNotFound
		}
		return User{}, "", err
	}
	return user, passwordHash, nil
}

func (s *Store) CreateSession(ctx context.Context, userID int64, expiresAt time.Time) (string, error) {
	token, err := randomToken(32)
	if err != nil {
		return "", err
	}

	if _, err := s.db.ExecContext(
		ctx,
		`INSERT INTO sessions(user_id, token, expires_at) VALUES(?, ?, ?)`,
		userID,
		token,
		expiresAt.UTC(),
	); err != nil {
		return "", err
	}

	return token, nil
}

func (s *Store) GetUserByToken(ctx context.Context, token string) (User, error) {
	var user User
	row := s.db.QueryRowContext(
		ctx,
		`SELECT u.id, u.name, u.email, u.phone, u.language, u.role
		FROM sessions s
		JOIN users u ON u.id = s.user_id
		WHERE s.token = ? AND s.expires_at > ?`,
		token,
		time.Now().UTC(),
	)
	if err := row.Scan(&user.ID, &user.Name, &user.Email, &user.Phone, &user.Language, &user.Role); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return User{}, ErrNotFound
		}
		return User{}, err
	}
	return user, nil
}

func (s *Store) CreateRiskEvent(ctx context.Context, userID int64, source, severity, message string) error {
	_, err := s.db.ExecContext(
		ctx,
		`INSERT INTO risk_events(user_id, source, severity, message) VALUES(?, ?, ?, ?)`,
		userID,
		source,
		severity,
		message,
	)
	return err
}

func randomToken(size int) (string, error) {
	buffer := make([]byte, size)
	if _, err := rand.Read(buffer); err != nil {
		return "", err
	}
	return hex.EncodeToString(buffer), nil
}
