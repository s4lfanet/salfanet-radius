.PHONY: build run dev test lint migrate-up migrate-down

# Binary output
BIN := bin/server

build:
	go build -ldflags="-s -w" -o $(BIN) ./cmd/server

run: build
	./$(BIN)

dev:
	@which air > /dev/null 2>&1 || go install github.com/air-verse/air@latest
	air -c .air.toml

test:
	go test ./... -v

lint:
	@which golangci-lint > /dev/null 2>&1 || curl -sSfL https://raw.githubusercontent.com/golangci/golangci-lint/master/install.sh | sh -s -- -b $$(go env GOPATH)/bin
	golangci-lint run ./...

tidy:
	go mod tidy

migrate-up:
	@which goose > /dev/null 2>&1 || go install github.com/pressly/goose/v3/cmd/goose@latest
	goose -dir migrations mysql "$${DATABASE_URL}" up

migrate-down:
	goose -dir migrations mysql "$${DATABASE_URL}" down

# Docker
docker-build:
	docker build -t salfanet-radius-go:latest .

docker-run:
	docker-compose up -d
