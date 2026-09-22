package httpapi

import (
	"bytes"
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"strings"
	"sync/atomic"
	"time"

	"github.com/besterdev/cal-food-store-full-stack/api/internal/catalog"
	"github.com/besterdev/cal-food-store-full-stack/api/internal/ordering"
	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/recover"
)

const (
	requestIDHeader      = "X-Request-ID"
	idempotencyKeyHeader = "Idempotency-Key"
	maxOrderBodyBytes    = 16 * 1024
)

var fallbackRequestIDCounter atomic.Uint64

type readinessChecker interface {
	Ready(context.Context) error
}

type orderPlacer interface {
	PlaceOrder(context.Context, ordering.Command) (ordering.Receipt, error)
}

// Config contains HTTP Adapter configuration.
type Config struct {
	AllowedOrigins   []string
	BaseContext      context.Context
	Logger           *slog.Logger
	RequestTimeout   time.Duration
	ReadinessTimeout time.Duration
}

type productListResponse struct {
	Products []catalog.Product `json:"products"`
}

type healthResponse struct {
	Status string `json:"status"`
}

type errorResponse struct {
	Code        string                `json:"code"`
	Message     string                `json:"message"`
	RequestID   string                `json:"request_id"`
	FieldErrors []ordering.FieldError `json:"field_errors,omitempty"`
	AvailableAt string                `json:"available_at,omitempty"`
}

type createOrderLineWire struct {
	ProductCode string `json:"product_code"`
	Quantity    int32  `json:"quantity"`
}

type createOrderRequestWire struct {
	Lines            []createOrderLineWire `json:"lines"`
	MemberCardNumber *string               `json:"member_card_number"`
}

type receiptLineWire struct {
	ProductCode                   string `json:"product_code"`
	ProductName                   string `json:"product_name"`
	Quantity                      int32  `json:"quantity"`
	UnitPriceSatang               int64  `json:"unit_price_satang"`
	LineTotalBeforeDiscountSatang int64  `json:"line_total_before_discount_satang"`
}

type pairDiscountWire struct {
	ProductCode             string `json:"product_code"`
	PairCount               int32  `json:"pair_count"`
	PairedQuantity          int32  `json:"paired_quantity"`
	DiscountRateBasisPoints int32  `json:"discount_rate_basis_points"`
	DiscountSatang          int64  `json:"discount_satang"`
}

type orderReceiptWire struct {
	OrderID                   string             `json:"order_id"`
	AcceptedAt                string             `json:"accepted_at"`
	Currency                  string             `json:"currency"`
	Lines                     []receiptLineWire  `json:"lines"`
	TotalBeforeDiscountSatang int64              `json:"total_before_discount_satang"`
	PairDiscounts             []pairDiscountWire `json:"pair_discounts"`
	PairDiscountTotalSatang   int64              `json:"pair_discount_total_satang"`
	MemberApplied             bool               `json:"member_applied"`
	MemberDiscountSatang      int64              `json:"member_discount_satang"`
	FinalTotalSatang          int64              `json:"final_total_satang"`
}

// New constructs the Fiber HTTP Adapter around the Catalog, Order, and readiness Interfaces.
func New(config Config, products catalog.Lister, readiness readinessChecker, orders orderPlacer) *fiber.App {
	if config.BaseContext == nil {
		config.BaseContext = context.Background()
	}
	if config.Logger == nil {
		config.Logger = slog.New(slog.NewTextHandler(io.Discard, nil))
	}
	if config.RequestTimeout <= 0 {
		config.RequestTimeout = 3 * time.Second
	}
	if config.ReadinessTimeout <= 0 {
		config.ReadinessTimeout = 2 * time.Second
	}

	app := fiber.New(fiber.Config{
		DisableStartupMessage: true,
		ErrorHandler: func(c *fiber.Ctx, _ error) error {
			return writeError(c, http.StatusInternalServerError, "INTERNAL_ERROR", "An unexpected error occurred.", nil, "")
		},
	})
	app.Use(requestIDMiddleware)
	app.Use(baseContextMiddleware(config.BaseContext))
	app.Use(requestLogMiddleware(config.Logger))
	app.Use(recover.New())
	app.Use(corsMiddleware(config.AllowedOrigins))

	app.Get("/health/live", func(c *fiber.Ctx) error {
		return c.Status(http.StatusOK).JSON(healthResponse{Status: "ok"})
	})
	app.Get("/health/ready", func(c *fiber.Ctx) error {
		ctx, cancel := context.WithTimeout(c.UserContext(), config.ReadinessTimeout)
		defer cancel()
		if err := readiness.Ready(ctx); err != nil {
			return writeError(c, http.StatusServiceUnavailable, "SERVICE_UNAVAILABLE", "The service is temporarily unavailable.", nil, "")
		}
		return c.Status(http.StatusOK).JSON(healthResponse{Status: "ok"})
	})
	app.Get("/api/v1/products", func(c *fiber.Ctx) error {
		ctx, cancel := context.WithTimeout(c.UserContext(), config.RequestTimeout)
		defer cancel()
		items, err := products.ListProducts(ctx)
		if err != nil {
			if errors.Is(err, catalog.ErrInvalidCatalog) {
				return writeError(c, http.StatusInternalServerError, "INTERNAL_ERROR", "An unexpected error occurred.", nil, "")
			}
			return writeError(c, http.StatusServiceUnavailable, "SERVICE_UNAVAILABLE", "The service is temporarily unavailable.", nil, "")
		}
		return c.Status(http.StatusOK).JSON(productListResponse{Products: items})
	})
	app.Post("/api/v1/orders", func(c *fiber.Ctx) error {
		return handleCreateOrder(c, config.RequestTimeout, orders)
	})

	return app
}

func handleCreateOrder(c *fiber.Ctx, timeout time.Duration, orders orderPlacer) error {
	key := c.Get(idempotencyKeyHeader)
	if !validIdempotencyKeyHeader(key) {
		return writeError(
			c,
			http.StatusBadRequest,
			"INVALID_IDEMPOTENCY_KEY",
			"Idempotency-Key must contain 1 through 128 printable ASCII characters.",
			[]ordering.FieldError{{
				Field:   idempotencyKeyHeader,
				Code:    "REQUIRED",
				Message: "header is required",
			}},
			"",
		)
	}

	body := c.Body()
	if int64(len(body)) > maxOrderBodyBytes {
		return writeError(c, http.StatusBadRequest, "MALFORMED_JSON", "Request body is too large.", nil, "")
	}

	request, fieldErrors, err := decodeCreateOrderRequest(body)
	if err != nil {
		return writeError(c, http.StatusBadRequest, "MALFORMED_JSON", err.Error(), fieldErrors, "")
	}

	command := ordering.Command{
		IdempotencyKey:   key,
		MemberCardNumber: request.MemberCardNumber,
	}
	for _, line := range request.Lines {
		command.Lines = append(command.Lines, ordering.Line{
			ProductCode: line.ProductCode,
			Quantity:    line.Quantity,
		})
	}

	ctx, cancel := context.WithTimeout(c.UserContext(), timeout)
	defer cancel()
	receipt, err := orders.PlaceOrder(ctx, command)
	if err != nil {
		return writeOrderError(c, err)
	}

	c.Set(fiber.HeaderLocation, "/api/v1/orders/"+receipt.OrderID.String())
	return c.Status(http.StatusCreated).JSON(toReceiptWire(receipt))
}

func decodeCreateOrderRequest(body []byte) (createOrderRequestWire, []ordering.FieldError, error) {
	decoder := json.NewDecoder(bytes.NewReader(body))
	decoder.DisallowUnknownFields()
	var request createOrderRequestWire
	if err := decoder.Decode(&request); err != nil {
		var syntax *json.SyntaxError
		var unmarshalType *json.UnmarshalTypeError
		switch {
		case errors.As(err, &syntax):
			return createOrderRequestWire{}, nil, errors.New("Request body is not valid JSON.")
		case errors.As(err, &unmarshalType):
			field := unmarshalType.Field
			if field == "" {
				field = "body"
			}
			return createOrderRequestWire{}, []ordering.FieldError{{
				Field: field, Code: "INVALID_TYPE", Message: "field has an invalid type",
			}}, errors.New("Request body contains an invalid field type.")
		case strings.Contains(err.Error(), "unknown field"):
			field := strings.Trim(strings.TrimPrefix(err.Error(), "json: unknown field "), `"`)
			return createOrderRequestWire{}, []ordering.FieldError{{
				Field: field, Code: "UNKNOWN_FIELD", Message: "field is not allowed",
			}}, errors.New("Request body contains an unknown field.")
		default:
			return createOrderRequestWire{}, nil, errors.New("Request body is not valid JSON.")
		}
	}
	if decoder.More() {
		return createOrderRequestWire{}, nil, errors.New("Request body must contain a single JSON value.")
	}
	return request, nil, nil
}

func writeOrderError(c *fiber.Ctx, err error) error {
	var validation *ordering.ValidationError
	if errors.As(err, &validation) {
		return writeError(c, http.StatusUnprocessableEntity, "VALIDATION_ERROR", "The Order contains invalid fields.", validation.Fields, "")
	}
	var redConflict *ordering.RedConflictError
	if errors.As(err, &redConflict) {
		return writeError(
			c,
			http.StatusConflict,
			"RED_UNAVAILABLE",
			"Red is unavailable until the specified time.",
			nil,
			redConflict.AvailableAt.UTC().Format(time.RFC3339),
		)
	}
	switch {
	case errors.Is(err, ordering.ErrInvalidIdempotencyKey):
		return writeError(
			c,
			http.StatusBadRequest,
			"INVALID_IDEMPOTENCY_KEY",
			"Idempotency-Key must contain 1 through 128 printable ASCII characters.",
			[]ordering.FieldError{{
				Field: idempotencyKeyHeader, Code: "REQUIRED", Message: "header is required",
			}},
			"",
		)
	case errors.Is(err, ordering.ErrIdempotencyConflict):
		return writeError(c, http.StatusConflict, "IDEMPOTENCY_CONFLICT", "Idempotency-Key was already used for a different Order Intent.", nil, "")
	case errors.Is(err, ordering.ErrServiceUnavailable):
		return writeError(c, http.StatusServiceUnavailable, "SERVICE_UNAVAILABLE", "The service is temporarily unavailable.", nil, "")
	default:
		return writeError(c, http.StatusInternalServerError, "INTERNAL_ERROR", "An unexpected error occurred.", nil, "")
	}
}

func toReceiptWire(receipt ordering.Receipt) orderReceiptWire {
	lines := make([]receiptLineWire, 0, len(receipt.Lines))
	for _, line := range receipt.Lines {
		lines = append(lines, receiptLineWire{
			ProductCode:                   line.ProductCode,
			ProductName:                   line.ProductName,
			Quantity:                      line.Quantity,
			UnitPriceSatang:               line.UnitPriceSatang,
			LineTotalBeforeDiscountSatang: line.LineTotalBeforeDiscountSatang,
		})
	}
	pairDiscounts := make([]pairDiscountWire, 0, len(receipt.PairDiscounts))
	for _, discount := range receipt.PairDiscounts {
		pairDiscounts = append(pairDiscounts, pairDiscountWire{
			ProductCode:             discount.ProductCode,
			PairCount:               discount.PairCount,
			PairedQuantity:          discount.PairedQuantity,
			DiscountRateBasisPoints: discount.DiscountRateBasisPoints,
			DiscountSatang:          discount.DiscountSatang,
		})
	}
	return orderReceiptWire{
		OrderID:                   receipt.OrderID.String(),
		AcceptedAt:                receipt.AcceptedAt.UTC().Format(time.RFC3339Nano),
		Currency:                  receipt.Currency,
		Lines:                     lines,
		TotalBeforeDiscountSatang: receipt.TotalBeforeDiscountSatang,
		PairDiscounts:             pairDiscounts,
		PairDiscountTotalSatang:   receipt.PairDiscountTotalSatang,
		MemberApplied:             receipt.MemberApplied,
		MemberDiscountSatang:      receipt.MemberDiscountSatang,
		FinalTotalSatang:          receipt.FinalTotalSatang,
	}
}

func validIdempotencyKeyHeader(value string) bool {
	if len(value) < 1 || len(value) > 128 {
		return false
	}
	for i := 0; i < len(value); i++ {
		if value[i] < 0x20 || value[i] > 0x7e {
			return false
		}
	}
	return true
}

func requestIDMiddleware(c *fiber.Ctx) error {
	requestID := c.Get(requestIDHeader)
	if !validRequestID(requestID) {
		requestID = generateRequestID()
	}
	c.Locals(requestIDHeader, requestID)
	c.Set(requestIDHeader, requestID)
	return c.Next()
}

func validRequestID(value string) bool {
	if len(value) < 5 || len(value) > 128 || !strings.HasPrefix(value, "req_") {
		return false
	}
	for i := 4; i < len(value); i++ {
		character := value[i]
		if !((character >= 'a' && character <= 'z') ||
			(character >= 'A' && character <= 'Z') ||
			(character >= '0' && character <= '9') ||
			character == '_' || character == '-') {
			return false
		}
	}
	return true
}

func generateRequestID() string {
	value := make([]byte, 16)
	if _, err := rand.Read(value); err != nil {
		return fmt.Sprintf("req_fallback_%x_%x", time.Now().UnixNano(), fallbackRequestIDCounter.Add(1))
	}
	return "req_" + hex.EncodeToString(value)
}

func baseContextMiddleware(base context.Context) fiber.Handler {
	return func(c *fiber.Ctx) error {
		ctx, cancel := context.WithCancel(base)
		defer cancel()
		c.SetUserContext(ctx)
		return c.Next()
	}
}

func requestLogMiddleware(logger *slog.Logger) fiber.Handler {
	return func(c *fiber.Ctx) error {
		startedAt := time.Now()
		err := c.Next()
		if err != nil {
			err = c.App().Config().ErrorHandler(c, err)
		}
		status := c.Response().StatusCode()
		attributes := []any{
			"request_id", c.Locals(requestIDHeader),
			"method", c.Method(),
			"route", c.Route().Path,
			"status_class", fmt.Sprintf("%dxx", status/100),
			"duration_ms", time.Since(startedAt).Milliseconds(),
		}
		if code, ok := c.Locals("error_code").(string); ok {
			attributes = append(attributes, "error_code", code)
		}
		logger.Info("http request", attributes...)
		return err
	}
}

func corsMiddleware(allowedOrigins []string) fiber.Handler {
	allowed := make(map[string]struct{}, len(allowedOrigins))
	for _, origin := range allowedOrigins {
		origin = strings.TrimSpace(origin)
		if origin != "" {
			allowed[origin] = struct{}{}
		}
	}

	return func(c *fiber.Ctx) error {
		origin := c.Get(fiber.HeaderOrigin)
		if _, ok := allowed[origin]; ok {
			c.Set(fiber.HeaderAccessControlAllowOrigin, origin)
			c.Set(fiber.HeaderVary, fiber.HeaderOrigin)
			c.Set(fiber.HeaderAccessControlAllowMethods, "GET,POST,OPTIONS")
			c.Set(fiber.HeaderAccessControlAllowHeaders, "Content-Type,Idempotency-Key,X-Request-ID")
			c.Set(fiber.HeaderAccessControlExposeHeaders, "Location,X-Request-ID")
			if c.Method() == fiber.MethodOptions {
				return c.SendStatus(http.StatusNoContent)
			}
		}
		return c.Next()
	}
}

func writeError(c *fiber.Ctx, status int, code, message string, fieldErrors []ordering.FieldError, availableAt string) error {
	requestID, _ := c.Locals(requestIDHeader).(string)
	c.Locals("error_code", code)
	response := errorResponse{
		Code:        code,
		Message:     message,
		RequestID:   requestID,
		FieldErrors: fieldErrors,
		AvailableAt: availableAt,
	}
	return c.Status(status).JSON(response)
}
