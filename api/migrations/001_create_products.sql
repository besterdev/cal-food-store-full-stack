CREATE TABLE products (
    code text PRIMARY KEY CHECK (code IN ('RED', 'GREEN', 'BLUE', 'YELLOW', 'PINK', 'PURPLE', 'ORANGE')),
    name text NOT NULL CHECK (length(name) > 0),
    unit_price_satang bigint NOT NULL CHECK (unit_price_satang > 0),
    currency char(3) NOT NULL CHECK (currency = 'THB'),
    display_order smallint NOT NULL UNIQUE CHECK (display_order BETWEEN 1 AND 7),
    color_token text NOT NULL CHECK (length(color_token) > 0)
);

INSERT INTO products (code, name, unit_price_satang, currency, display_order, color_token)
VALUES
    ('RED', 'Red set', 5000, 'THB', 1, 'red'),
    ('GREEN', 'Green set', 4000, 'THB', 2, 'green'),
    ('BLUE', 'Blue set', 3000, 'THB', 3, 'blue'),
    ('YELLOW', 'Yellow set', 5000, 'THB', 4, 'yellow'),
    ('PINK', 'Pink set', 8000, 'THB', 5, 'pink'),
    ('PURPLE', 'Purple set', 9000, 'THB', 6, 'purple'),
    ('ORANGE', 'Orange set', 12000, 'THB', 7, 'orange');
