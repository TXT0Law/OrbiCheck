.PHONY: help test test-frontend test-backend test-backend-unit test-backend-integration test-backend-e2e test-osint test-scanner test-phase1-network test-p2-hardening test-watch test-cov lint lint-frontend lint-backend lint-osint clean-safe db-migrate db-rollback export-openapi docs-generate check-docs check-bundle backup-restore-drill check-harness

.DEFAULT_GOAL := help

help: ## Show this help message
	@echo "Usage: make [target]"
	@echo ""
	@echo "Targets:"
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-26s\033[0m %s\n", $$1, $$2}'

db-migrate: ## Run database migrations (Alembic upgrade head)
	cd backend && uv run alembic upgrade head

db-rollback: ## Rollback last database migration
	cd backend && uv run alembic downgrade -1

lint: lint-frontend lint-backend lint-osint ## Lint all subsystems

lint-frontend: ## Lint frontend (Next.js ESLint)
	pnpm lint

lint-backend: ## Lint backend (Ruff)
	cd backend && UV_LINK_MODE=copy uv run ruff check .

lint-osint: ## Lint scan service
	cd backend/scan && npm run lint

test: test-frontend test-backend test-osint test-scanner ## Run all tests

test-frontend: ## Run frontend unit tests (Vitest)
	pnpm test

test-backend: ## Run all backend tests (pytest)
	cd backend && UV_LINK_MODE=copy uv run pytest

test-backend-unit: ## Run backend unit tests only
	cd backend && UV_LINK_MODE=copy uv run pytest -m unit

test-backend-integration: ## Run backend integration tests only
	cd backend && UV_LINK_MODE=copy uv run pytest -m integration

test-backend-e2e: ## Run backend e2e tests only
	cd backend && UV_LINK_MODE=copy uv run pytest -m e2e

test-osint: ## Run scan service tests (Jest)
	cd backend/scan && npm test

test-scanner: ## Run nmap scanner security tests
	cd backend && UV_LINK_MODE=copy uv run python -m unittest discover -s ../docker/scanner -p 'test_*.py'

test-phase1-network: ## Run Phase 1 container network security tests
	bash scripts/test-phase1-container-network.sh

test-p2-hardening: ## Verify runtime container hardening and port scan smoke
	bash scripts/test-p2-container-hardening.sh

test-watch: ## Run frontend tests in watch mode
	pnpm test:watch

test-cov: ## Run all tests with coverage reports
	pnpm test:cov
	cd backend && UV_LINK_MODE=copy uv run pytest --cov=app --cov-report=term-missing
	cd backend/scan && npm run test:cov

check-harness: ## Run all harness CI checks (dependency direction, boundary validation)
	bash scripts/ci/check-harness.sh

export-openapi: ## Export static OpenAPI schema to docs/openapi.json
	cd backend && UV_LINK_MODE=copy uv run python ../scripts/dev/export-openapi.py

docs-generate: ## Regenerate OpenAPI and repository inventory docs
	cd backend && UV_LINK_MODE=copy uv run python ../scripts/ci/check-docs-drift.py --write

check-docs: ## Check docs inventory, OpenAPI drift, and local links
	cd backend && UV_LINK_MODE=copy uv run python ../scripts/ci/check-docs-drift.py

check-bundle: ## Enforce per-route frontend bundle budgets after build
	pnpm check:bundle

backup-restore-drill: ## Backup local PostgreSQL and verify an isolated restore
	bash scripts/ops/backup-restore-drill.sh

clean-safe: ## Clean build artifacts safely
	rm -rf node_modules backend/scan/node_modules .next coverage test-results
	rm -rf .venv backend/.venv .pytest_cache backend/.pytest_cache .ruff_cache backend/.ruff_cache .mypy_cache
	rm -rf backend/orbicheck_backend.egg-info playwright-report .nyc_output
	find . -type d -name '__pycache__' -prune -exec rm -rf {} +
	find . -type f \( -name '*.pyc' -o -name '*.pyo' -o -name '*.log' -o -name '*.tmp' -o -name '*.swp' -o -name '.coverage' \) -delete
	find . -name '._*' -not -path './.git/*' -type f -delete 2>/dev/null || true
	@echo "Safe cleanup completed."
