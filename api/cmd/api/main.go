package main

import (
	"context"
	"errors"
	"log/slog"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/besterdev/cal-food-store-full-stack/api/internal/httpapi"
	"github.com/besterdev/cal-food-store-full-stack/api/internal/ordering"
	storepg "github.com/besterdev/cal-food-store-full-stack/api/internal/postgres"
	"github.com/jackc/pgx/v5/pgxpool"
)

func main() {
	logger := slog.New(slog.NewJSONHandler(os.Stdout, nil))
	databaseURL := os.Getenv("DATABASE_URL")
	if databaseURL == "" {
		logger.Error("DATABASE_URL is required")
		os.Exit(1)
	}

	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()
	pool, err := pgxpool.New(ctx, databaseURL)
	if err != nil {
		logger.Error("could not open postgres pool")
		os.Exit(1)
	}
	defer pool.Close()

	store := storepg.New(pool)
	orders := &ordering.Service{Store: store}
	app := httpapi.New(httpapi.Config{
		AllowedOrigins: allowedOrigins(),
		BaseContext:    ctx,
		Logger:         logger,
	}, store, store, orders)
	address := envOrDefault("API_ADDRESS", "")
	if address == "" {
		port := envOrDefault("PORT", "8080")
		address = ":" + port
	}

	serveErrors := make(chan error, 1)
	go func() {
		logger.Info("api listening", "address", address)
		serveErrors <- app.Listen(address)
	}()

	select {
	case err := <-serveErrors:
		if err != nil {
			logger.Error("api stopped", "error", err)
			os.Exit(1)
		}
	case <-ctx.Done():
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		if err := app.ShutdownWithContext(shutdownCtx); err != nil && !errors.Is(err, context.Canceled) {
			logger.Error("graceful shutdown", "error", err)
		}
	}
}

func allowedOrigins() []string {
	raw := envOrDefault("CORS_ALLOWED_ORIGINS", "http://localhost:3000")
	values := strings.Split(raw, ",")
	origins := make([]string, 0, len(values))
	for _, value := range values {
		if value = strings.TrimSpace(value); value != "" {
			origins = append(origins, value)
		}
	}
	return origins
}

func envOrDefault(name, fallback string) string {
	if value := os.Getenv(name); value != "" {
		return value
	}
	return fallback
}
