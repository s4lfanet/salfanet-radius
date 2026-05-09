package main

import (
	"context"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/rs/zerolog"
	"github.com/rs/zerolog/log"

	"github.com/s4lfanet/salfanet-radius-go/internal/api"
	"github.com/s4lfanet/salfanet-radius-go/internal/config"
	"github.com/s4lfanet/salfanet-radius-go/internal/cron"
	"github.com/s4lfanet/salfanet-radius-go/internal/db"
	"github.com/s4lfanet/salfanet-radius-go/internal/olt/poller"
	"github.com/s4lfanet/salfanet-radius-go/internal/radius"
	"github.com/s4lfanet/salfanet-radius-go/internal/ws"
)

func main() {
	// Pretty logging in dev, JSON in prod
	if os.Getenv("APP_ENV") != "production" {
		log.Logger = log.Output(zerolog.ConsoleWriter{Out: os.Stdout, TimeFormat: time.RFC3339})
	}
	zerolog.TimeFieldFormat = zerolog.TimeFormatUnix

	// ─── Load config ─────────────────────────────────────────────────────────
	cfg, err := config.Load()
	if err != nil {
		log.Fatal().Err(err).Msg("failed to load config")
	}
	log.Info().Str("port", cfg.Port).Str("tz", cfg.AppTimezone).Msg("config loaded")

	// ─── Database ─────────────────────────────────────────────────────────────
	gormDB, err := db.Init(cfg.DatabaseURL)
	if err != nil {
		log.Fatal().Err(err).Msg("failed to connect to database")
	}
	log.Info().Msg("database connected")

	// ─── FreeRADIUS service ───────────────────────────────────────────────────
	radSvc := radius.New(gormDB)
	log.Info().Msg("radius service initialized")

	// ─── Cron Scheduler ──────────────────────────────────────────────────────
	scheduler := cron.New(gormDB, radSvc)
	scheduler.Start()
	log.Info().Msg("cron scheduler started")

	// ─── WebSocket Hub ────────────────────────────────────────────────────────
	hub := ws.New()

	// ─── OLT Poller ───────────────────────────────────────────────────────────
	p := poller.New(gormDB, hub.Adapter())
	p.StartAll()

	// ─── HTTP API ─────────────────────────────────────────────────────────────
	app := api.New(gormDB, p, hub, radSvc, scheduler)

	// ─── Graceful shutdown ────────────────────────────────────────────────────
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)

	go func() {
		<-quit
		log.Info().Msg("shutting down...")

		// Stop cron scheduler
		scheduler.Stop()

		// Stop all pollers
		p.StopAll()

		// Graceful fiber shutdown
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		if err := app.ShutdownWithContext(ctx); err != nil {
			log.Error().Err(err).Msg("fiber shutdown error")
		}

		// Close DB
		if sqlDB, err := gormDB.DB(); err == nil {
			sqlDB.Close()
		}

		log.Info().Msg("server stopped")
		os.Exit(0)
	}()

	addr := ":" + cfg.Port
	log.Info().Str("addr", addr).Msg("starting HTTP server")
	if err := app.Listen(addr); err != nil {
		log.Fatal().Err(err).Msg("server error")
	}
}
