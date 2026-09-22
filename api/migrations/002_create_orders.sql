CREATE TABLE orders (
    id uuid PRIMARY KEY,
    placed_at timestamptz NOT NULL,
    currency char(3) NOT NULL CHECK (currency = 'THB'),
    member_discount_applied boolean NOT NULL,
    total_before_discount_satang bigint NOT NULL CHECK (total_before_discount_satang >= 0),
    pair_discount_satang bigint NOT NULL CHECK (pair_discount_satang >= 0),
    member_discount_satang bigint NOT NULL CHECK (member_discount_satang >= 0),
    final_total_satang bigint NOT NULL CHECK (final_total_satang >= 0),
    CHECK (
        final_total_satang
        = total_before_discount_satang
          - pair_discount_satang
          - member_discount_satang
    )
);

CREATE TABLE order_lines (
    order_id uuid NOT NULL REFERENCES orders (id) ON DELETE RESTRICT,
    product_code text NOT NULL,
    product_name text NOT NULL CHECK (length(product_name) > 0),
    display_order smallint NOT NULL CHECK (display_order > 0),
    quantity integer NOT NULL CHECK (quantity BETWEEN 1 AND 999),
    unit_price_satang bigint NOT NULL CHECK (unit_price_satang > 0),
    line_subtotal_satang bigint NOT NULL CHECK (line_subtotal_satang >= 0),
    pair_count integer NOT NULL CHECK (pair_count >= 0),
    pair_discount_satang bigint NOT NULL CHECK (pair_discount_satang >= 0),
    line_total_after_pair_satang bigint NOT NULL CHECK (line_total_after_pair_satang >= 0),
    PRIMARY KEY (order_id, product_code),
    CHECK (
        line_total_after_pair_satang
        = line_subtotal_satang - pair_discount_satang
    )
);

CREATE TABLE order_idempotency (
    key_digest bytea PRIMARY KEY CHECK (octet_length(key_digest) = 32),
    intent_digest bytea NOT NULL CHECK (octet_length(intent_digest) = 32),
    order_id uuid NOT NULL UNIQUE,
    created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT order_idempotency_order_id_fkey
        FOREIGN KEY (order_id) REFERENCES orders (id)
        DEFERRABLE INITIALLY DEFERRED
);

CREATE TABLE red_availability_gate (
    product_code text PRIMARY KEY CHECK (product_code = 'RED'),
    available_at timestamptz NOT NULL
);

INSERT INTO red_availability_gate (product_code, available_at)
VALUES ('RED', '-infinity'::timestamptz);
