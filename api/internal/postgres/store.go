package postgres

import (
	"context"
	"fmt"

	"github.com/besterdev/cal-food-store-full-stack/api/internal/catalog"
	"github.com/besterdev/cal-food-store-full-stack/api/migrations"
	"github.com/jackc/pgx/v5/pgxpool"
)

var contractProducts = []catalog.Product{
	{Code: "RED", Name: "Red set", UnitPriceSatang: 5000, Currency: "THB", DisplayOrder: 1, ColorToken: "red"},
	{Code: "GREEN", Name: "Green set", UnitPriceSatang: 4000, Currency: "THB", DisplayOrder: 2, ColorToken: "green"},
	{Code: "BLUE", Name: "Blue set", UnitPriceSatang: 3000, Currency: "THB", DisplayOrder: 3, ColorToken: "blue"},
	{Code: "YELLOW", Name: "Yellow set", UnitPriceSatang: 5000, Currency: "THB", DisplayOrder: 4, ColorToken: "yellow"},
	{Code: "PINK", Name: "Pink set", UnitPriceSatang: 8000, Currency: "THB", DisplayOrder: 5, ColorToken: "pink"},
	{Code: "PURPLE", Name: "Purple set", UnitPriceSatang: 9000, Currency: "THB", DisplayOrder: 6, ColorToken: "purple"},
	{Code: "ORANGE", Name: "Orange set", UnitPriceSatang: 12000, Currency: "THB", DisplayOrder: 7, ColorToken: "orange"},
}

// Store is the concrete PostgreSQL Adapter for catalog and readiness behavior.
type Store struct {
	pool *pgxpool.Pool
}

// New creates a PostgreSQL Adapter using the provided connection pool.
func New(pool *pgxpool.Pool) *Store {
	return &Store{pool: pool}
}

// ListProducts returns the authoritative Product Catalog in display order.
func (s *Store) ListProducts(ctx context.Context) ([]catalog.Product, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT code, name, unit_price_satang, currency, display_order, color_token
		FROM products
		ORDER BY display_order ASC
	`)
	if err != nil {
		return nil, fmt.Errorf("query products: %w", err)
	}
	defer rows.Close()

	products := make([]catalog.Product, 0, len(contractProducts))
	for rows.Next() {
		var product catalog.Product
		if err := rows.Scan(
			&product.Code,
			&product.Name,
			&product.UnitPriceSatang,
			&product.Currency,
			&product.DisplayOrder,
			&product.ColorToken,
		); err != nil {
			return nil, fmt.Errorf("scan product: %w", err)
		}
		products = append(products, product)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate products: %w", err)
	}
	if !matchesContract(products) {
		return nil, fmt.Errorf("validate products: %w", catalog.ErrInvalidCatalog)
	}
	return products, nil
}

// ResetRedAvailability restores the Red gate to immediate availability.
// Demo/ops helper for the rolling 60-minute Red window; does not delete Orders.
func (s *Store) ResetRedAvailability(ctx context.Context) error {
	tag, err := s.pool.Exec(ctx, `
		UPDATE red_availability_gate
		SET available_at = '-infinity'::timestamptz
		WHERE product_code = 'RED'
	`)
	if err != nil {
		return fmt.Errorf("reset red availability: %w", err)
	}
	if tag.RowsAffected() != 1 {
		return fmt.Errorf("reset red availability: expected 1 gate row, got %d", tag.RowsAffected())
	}
	return nil
}

// Ready verifies PostgreSQL connectivity and the latest required migration.
func (s *Store) Ready(ctx context.Context) error {
	if err := s.pool.Ping(ctx); err != nil {
		return fmt.Errorf("ping postgres: %w", err)
	}
	var migrationPresent bool
	if err := s.pool.QueryRow(
		ctx,
		`SELECT EXISTS (SELECT 1 FROM schema_migrations WHERE version = $1)`,
		migrations.LatestVersion,
	).Scan(&migrationPresent); err != nil {
		return fmt.Errorf("read required schema version: %w", err)
	}
	if !migrationPresent {
		return fmt.Errorf("required schema version %d is not applied", migrations.LatestVersion)
	}
	return nil
}

func matchesContract(products []catalog.Product) bool {
	if len(products) != len(contractProducts) {
		return false
	}
	for index := range contractProducts {
		if products[index] != contractProducts[index] {
			return false
		}
	}
	return true
}
