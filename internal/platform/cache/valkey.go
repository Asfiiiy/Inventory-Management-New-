package cache

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/redis/go-redis/v9"
)

// Lua script ensuring single-roundtrip atomic stock checking and decrement with TTL reservation.
const reserveStockLua = `
local current_stock = tonumber(redis.call('GET', KEYS[1]) or '0')
local requested_qty = tonumber(ARGV[1])

if current_stock >= requested_qty then
    redis.call('DECRBY', KEYS[1], requested_qty)
    redis.call('SET', KEYS[2], ARGV[2], 'EX', ARGV[3])
    return 1
else
    return 0
end
`

// ValkeyClient manages high-concurrency atomic stock reservations in Valkey 9.
type ValkeyClient struct {
	client *redis.Client
	script *redis.Script
}

// NewValkeyClient creates a new Valkey/Redis client instance.
func NewValkeyClient(addr string) (*ValkeyClient, error) {
	if addr == "" {
		addr = "localhost:6379"
	}

	rdb := redis.NewClient(&redis.Options{
		Addr:         addr,
		DialTimeout:  3 * time.Second,
		ReadTimeout:  3 * time.Second,
		WriteTimeout: 3 * time.Second,
		PoolSize:     20,
	})

	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()

	if err := rdb.Ping(ctx).Err(); err != nil {
		return nil, fmt.Errorf("valkey: ping failed: %w", err)
	}

	return &ValkeyClient{
		client: rdb,
		script: redis.NewScript(reserveStockLua),
	}, nil
}

// Client returns the underlying redis.Client.
func (v *ValkeyClient) Client() *redis.Client {
	return v.client
}

// Close closes the connection pool.
func (v *ValkeyClient) Close() error {
	return v.client.Close()
}

// StockKey builds standard namespaced key for stock balances.
func StockKey(orgID, itemID, locationID uuid.UUID) string {
	return fmt.Sprintf("stock:%s:%s:%s", orgID, itemID, locationID)
}

// ReservationKey builds standard namespaced key for temporary reservation tokens.
func ReservationKey(orgID uuid.UUID, token string) string {
	return fmt.Sprintf("reservation:%s:%s", orgID, token)
}

// SetAvailableStock seeds or updates the high-speed cached stock balance.
func (v *ValkeyClient) SetAvailableStock(ctx context.Context, orgID, itemID, locationID uuid.UUID, qty int64) error {
	key := StockKey(orgID, itemID, locationID)
	return v.client.Set(ctx, key, qty, 0).Err()
}

// GetAvailableStock reads the cached balance.
func (v *ValkeyClient) GetAvailableStock(ctx context.Context, orgID, itemID, locationID uuid.UUID) (int64, error) {
	key := StockKey(orgID, itemID, locationID)
	val, err := v.client.Get(ctx, key).Int64()
	if err == redis.Nil {
		return 0, nil
	}
	return val, err
}

type ReservationPayload struct {
	Token        string    `json:"token"`
	OrgID        uuid.UUID `json:"org_id"`
	ItemID       uuid.UUID `json:"item_id"`
	LocationID   uuid.UUID `json:"location_id"`
	Quantity     int64     `json:"quantity"`
	CreatedAt    time.Time `json:"created_at"`
	ExpiresAt    time.Time `json:"expires_at"`
}

// ReserveStock atomically verifies stock and holds quantity with 5-minute TTL.
func (v *ValkeyClient) ReserveStock(ctx context.Context, orgID, itemID, locationID uuid.UUID, qty int64) (string, bool, error) {
	if qty <= 0 {
		return "", false, fmt.Errorf("reservation quantity must be > 0")
	}

	token := "resv_" + uuid.New().String()
	stockKey := StockKey(orgID, itemID, locationID)
	resvKey := ReservationKey(orgID, token)
	ttlSeconds := 300 // 5 minutes

	payload := ReservationPayload{
		Token:      token,
		OrgID:      orgID,
		ItemID:     itemID,
		LocationID: locationID,
		Quantity:   qty,
		CreatedAt:  time.Now(),
		ExpiresAt:  time.Now().Add(5 * time.Minute),
	}
	rawPayload, _ := json.Marshal(payload)

	res, err := v.script.Run(ctx, v.client, []string{stockKey, resvKey}, qty, string(rawPayload), ttlSeconds).Int()
	if err != nil {
		return "", false, fmt.Errorf("valkey: atomic reservation script failed: %w", err)
	}

	if res == 1 {
		return token, true, nil
	}

	return "", false, nil
}
