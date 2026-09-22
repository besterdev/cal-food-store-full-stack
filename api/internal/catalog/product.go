package catalog

import (
	"context"
	"errors"
)

// ErrInvalidCatalog indicates that persisted catalog data violates the public contract.
var ErrInvalidCatalog = errors.New("catalog data violates the contract")

// Product is the public catalog representation defined by docs/openapi.yaml.
type Product struct {
	Code            string `json:"code"`
	Name            string `json:"name"`
	UnitPriceSatang int64  `json:"unit_price_satang"`
	Currency        string `json:"currency"`
	DisplayOrder    int16  `json:"display_order"`
	ColorToken      string `json:"color_token"`
}

// Lister is the Product Catalog Module Interface used by the HTTP Adapter.
type Lister interface {
	ListProducts(context.Context) ([]Product, error)
}
