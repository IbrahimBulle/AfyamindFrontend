package app

import (
	"afyamind/backend/internal/ai"
	"afyamind/backend/internal/config"
	"afyamind/backend/internal/store"
)

type App struct {
	Store *store.Store
	AI    *ai.Service
}

func New(cfg config.Config) (*App, error) {
	dataStore, err := store.New(cfg.DBPath)
	if err != nil {
		return nil, err
	}

	return &App{
		Store: dataStore,
		AI:    ai.NewService(cfg),
	}, nil
}

func (a *App) Close() error {
	if a == nil || a.Store == nil {
		return nil
	}
	return a.Store.Close()
}
