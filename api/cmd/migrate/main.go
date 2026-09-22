package main

import (
	"context"
	"log/slog"
	"os"
	"time"

	"github.com/besterdev/cal-food-store-full-stack/api/migrations"
	"github.com/jackc/pgx/v5/pgxpool"
)

func main() {
	logger := slog.New(slog.NewJSONHandler(os.Stdout, nil))
	databaseURL := os.Getenv("DATABASE_URL")
	if databaseURL == "" {
		logger.Error("DATABASE_URL is required")
		os.Exit(1)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	pool, err := pgxpool.New(ctx, databaseURL)
	if err != nil {
		logger.Error("could not open postgres pool")
		os.Exit(1)
	}
	defer pool.Close()

	if err := migrations.Apply(ctx, pool); err != nil {
		logger.Error("apply migrations", "error", err)
		os.Exit(1)
	}
	logger.Info("migrations applied", "version", migrations.LatestVersion)
}
