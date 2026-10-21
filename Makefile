.PHONY: up down logs restart ps sqlc-gen test

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

sqlc-gen:
	sqlc generate

test:
	go test -v ./...
