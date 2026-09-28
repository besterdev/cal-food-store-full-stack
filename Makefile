# Food Store Calculator — common local commands
#
# Usage: make <target>
# Run `make help` to list targets.

COMPOSE ?= docker compose
API_DIR ?= api
WEB_DIR ?= web
PNPM ?= pnpm
DB_SERVICE ?= db
DB_USER ?= food_store
DB_NAME ?= food_store
TEST_DATABASE_URL ?= postgres://food_store:food_store@localhost:5432/food_store?sslmode=disable

.DEFAULT_GOAL := help

.PHONY: help \
	up up-build down restart logs ps \
	install api-install web-install \
	api-dev web-dev \
	api-typecheck web-typecheck typecheck \
	api-test web-test test \
	api-build web-build build \
	migrate db-reset db-shell \
	openapi e2e \
	ci

help: ## Show this help
	@awk 'BEGIN {FS = ":.*##"; printf "\nTargets:\n"} \
		/^[a-zA-Z0-9_-]+:.*?##/ { printf "  %-16s %s\n", $$1, $$2 }' $(MAKEFILE_LIST)
	@printf "\n"

# --- Docker Compose -----------------------------------------------------------

up: ## Start the local stack (web, api, postgres)
	$(COMPOSE) up -d

up-build: ## Rebuild images and start the local stack
	$(COMPOSE) up --build -d

down: ## Stop containers (keep the postgres volume)
	$(COMPOSE) down

restart: ## Restart the local stack
	$(COMPOSE) restart

logs: ## Follow compose logs
	$(COMPOSE) logs -f

ps: ## Show compose service status
	$(COMPOSE) ps

# --- Install ------------------------------------------------------------------

install: api-install web-install ## Install api and web dependencies

api-install: ## Install api dependencies
	cd $(API_DIR) && $(PNPM) install

web-install: ## Install web dependencies
	cd $(WEB_DIR) && $(PNPM) install

# --- Dev ----------------------------------------------------------------------

api-dev: ## Run the API with tsx watch (needs DATABASE_URL)
	cd $(API_DIR) && $(PNPM) run dev

web-dev: ## Run Next.js in development mode
	cd $(WEB_DIR) && $(PNPM) run dev

# --- Checks -------------------------------------------------------------------

api-typecheck: ## Typecheck the API
	cd $(API_DIR) && $(PNPM) run typecheck

web-typecheck: ## Typecheck the web app
	cd $(WEB_DIR) && $(PNPM) run typecheck

typecheck: api-typecheck web-typecheck ## Typecheck api and web

api-test: ## Run API unit + Postgres contract tests
	cd $(API_DIR) && TEST_DATABASE_URL='$(TEST_DATABASE_URL)' $(PNPM) test

web-test: ## Run web unit/component tests
	cd $(WEB_DIR) && $(PNPM) test

test: api-test web-test ## Run api and web unit tests

api-build: ## Build the API
	cd $(API_DIR) && $(PNPM) run build

web-build: ## Build the web app
	cd $(WEB_DIR) && $(PNPM) run build

build: api-build web-build ## Build api and web

openapi: ## Lint the OpenAPI document
	npx --yes @redocly/cli@1 lint docs/openapi.yaml

e2e: ## Run Playwright against the local stack (stack must be up)
	cd $(WEB_DIR) && $(PNPM) exec playwright install chromium && $(PNPM) run test:e2e

ci: typecheck test api-build web-build openapi ## Approximate local CI checks

# --- Database -----------------------------------------------------------------

migrate: ## Apply SQL migrations against compose postgres
	cd $(API_DIR) && DATABASE_URL='$(TEST_DATABASE_URL)' $(PNPM) run migrate

db-reset: ## Clear orders and reopen the Red gate (keep seeded products)
	$(COMPOSE) exec -T $(DB_SERVICE) \
		psql -U $(DB_USER) -d $(DB_NAME) -v ON_ERROR_STOP=1 \
		-c "TRUNCATE order_lines, order_idempotency, orders RESTART IDENTITY;" \
		-c "UPDATE red_availability_gate SET available_at = '-infinity'::timestamptz WHERE product_code = 'RED';"
	@echo "orders cleared; red gate open; products kept"

db-shell: ## Open psql in the compose postgres container
	$(COMPOSE) exec $(DB_SERVICE) psql -U $(DB_USER) -d $(DB_NAME)
