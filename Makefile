.PHONY: up down logs restart ps sqlc-gen test test-e2e dev-backend dev-frontend build-frontend

up:
	docker compose up -d

down:
	docker compose down

logs:
	docker compose logs -f

restart:
	docker compose restart

ps:
	docker compose ps

dev-backend:
	cd backend && go run ./cmd/api

dev-frontend:
	cd frontend && npm run dev

build-frontend:
	cd frontend && npm run build

sqlc-gen:
	cd backend && sqlc generate

test:
	cd backend && go test -v ./...

test-e2e:
	node tests/e2e/test_all_features.js

ci: test test-e2e build-frontend
