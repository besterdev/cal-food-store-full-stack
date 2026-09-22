package ordering_test

import (
	"errors"
	"testing"

	"github.com/besterdev/cal-food-store-full-stack/api/internal/ordering"
)

func TestPrepareCanonicalizesIndependentOfLineOrderAndMemberWhitespace(t *testing.T) {
	member := "  ABC  "
	first, err := ordering.Prepare(ordering.Command{
		IdempotencyKey:   "same-key",
		MemberCardNumber: &member,
		Lines: []ordering.Line{
			{ProductCode: "YELLOW", Quantity: 1},
			{ProductCode: "BLUE", Quantity: 2},
		},
	})
	if err != nil {
		t.Fatalf("Prepare first: %v", err)
	}
	second, err := ordering.Prepare(ordering.Command{
		IdempotencyKey:   "same-key",
		MemberCardNumber: &member,
		Lines: []ordering.Line{
			{ProductCode: "BLUE", Quantity: 2},
			{ProductCode: "YELLOW", Quantity: 1},
		},
	})
	if err != nil {
		t.Fatalf("Prepare second: %v", err)
	}
	if first.IntentDigest != second.IntentDigest {
		t.Fatalf("intent digests differ for equivalent Orders")
	}
	if !first.MemberPresent {
		t.Fatal("expected member presence")
	}
}

func TestPrepareRejectsDuplicateProducts(t *testing.T) {
	_, err := ordering.Prepare(ordering.Command{
		IdempotencyKey: "key",
		Lines: []ordering.Line{
			{ProductCode: "BLUE", Quantity: 1},
			{ProductCode: "BLUE", Quantity: 2},
		},
	})
	var validation *ordering.ValidationError
	if !errors.As(err, &validation) {
		t.Fatalf("err = %v, want validation error", err)
	}
}
