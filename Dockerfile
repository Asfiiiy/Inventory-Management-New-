# ====================================================================
# Whoopit Core API - Multi-Stage Production Dockerfile
# ====================================================================

# Stage 1: Build binary
FROM golang:1.24-alpine AS builder

WORKDIR /app

# Install git and build dependencies
RUN apk add --no-cache git ca-certificates tzdata

COPY go.mod go.sum ./
RUN go mod download

COPY . .

# Build statically-linked optimized binary
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-w -s" -o /app/bin/whoopit-api ./cmd/api

# Stage 2: Minimal runtime image
FROM alpine:3.21

WORKDIR /app

RUN apk --no-cache add ca-certificates tzdata \
    && addgroup -S whoopit && adduser -S whoopit -G whoopit

COPY --from=builder /app/bin/whoopit-api /app/whoopit-api
COPY --from=builder /app/api /app/api

USER whoopit

EXPOSE 8080

ENTRYPOINT ["/app/whoopit-api"]
