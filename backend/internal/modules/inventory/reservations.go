package inventory

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"

	"whoopit-core/internal/platform/database"
	"whoopit-core/internal/platform/db"
)

var (
	ErrReservationNotFound = errors.New("reservation not found")
	ErrReservationInactive = errors.New("reservation is not active")
)

type CreateReservationInput struct {
	OrgID       uuid.UUID  `json:"org_id"`
	ItemID      uuid.UUID  `json:"item_id"`
	LocationID  uuid.UUID  `json:"location_id"`
	Quantity    float64    `json:"quantity"`
	Kind        string     `json:"kind"` // sales_order, work_order, custody
	Target      string     `json:"target"`
	DueBackDate *time.Time `json:"due_back_date,omitempty"`
	CreatedBy   uuid.UUID  `json:"created_by"`
}

type ReservationsService struct {
	db *database.TenantDB
}

func NewReservationsService(tdb *database.TenantDB) *ReservationsService {
	return &ReservationsService{db: tdb}
}

// CreateReservation reserves physical stock at a location, preventing other orders from claiming it.
func (s *ReservationsService) CreateReservation(ctx context.Context, input CreateReservationInput) (*db.Reservation, error) {
	if input.Quantity <= 0 {
		return nil, ErrInvalidMoveQty
	}
	if input.Kind != "reserve" && input.Kind != "check_out" {
		input.Kind = "reserve"
	}
	if input.CreatedBy == uuid.Nil {
		input.CreatedBy = uuid.New()
	}

	var created db.Reservation

	err := s.db.WithTenantTxRaw(ctx, input.OrgID, func(q *db.Queries, tx pgx.Tx) error {
		// 1. Lock item row
		_, err := q.LockItemForUpdate(ctx, db.LockItemForUpdateParams{
			ItemID: input.ItemID,
			OrgID:  input.OrgID,
		})
		if err != nil {
			return err
		}

		// 2. Lock & Check current balance at source location
		var onHand, reserved float64
		row := tx.QueryRow(ctx, `
			SELECT 
				COALESCE(on_hand, 0)::float8, 
				COALESCE(reserved, 0)::float8 
			FROM stock_balances
			WHERE org_id = $1 AND item_id = $2 AND location_id = $3
			FOR UPDATE
		`, input.OrgID, input.ItemID, input.LocationID)

		err = row.Scan(&onHand, &reserved)
		if err != nil && !errors.Is(err, pgx.ErrNoRows) {
			return err
		}

		available := onHand - reserved
		if available < input.Quantity {
			return fmt.Errorf("%w: requested %.2f, available %.2f", ErrInsufficientStock, input.Quantity, available)
		}

		// 3. Create Reservation row
		var dueBack pgtype.Timestamptz
		if input.DueBackDate != nil {
			dueBack = pgtype.Timestamptz{Time: *input.DueBackDate, Valid: true}
		}

		var qtyNum pgtype.Numeric
		_ = qtyNum.Scan(fmt.Sprintf("%.4f", input.Quantity))

		res, err := q.CreateReservation(ctx, db.CreateReservationParams{
			OrgID:       input.OrgID,
			ItemID:      input.ItemID,
			LocationID:  input.LocationID,
			Quantity:    qtyNum,
			Kind:        input.Kind,
			Target:      input.Target,
			DueBackDate: dueBack,
			CreatedBy:   input.CreatedBy,
		})
		if err != nil {
			return err
		}
		created = res

		// 4. Update stock_balances reserved count
		_, err = tx.Exec(ctx, `
			INSERT INTO stock_balances (org_id, item_id, location_id, on_hand, reserved, checked_out, updated_at)
			VALUES ($1, $2, $3, $4, $5, 0, CURRENT_TIMESTAMP)
			ON CONFLICT (org_id, item_id, location_id)
			DO UPDATE SET
				reserved = stock_balances.reserved + $5,
				updated_at = CURRENT_TIMESTAMP
		`, input.OrgID, input.ItemID, input.LocationID, onHand, input.Quantity)
		return err
	})

	if err != nil {
		return nil, err
	}
	return &created, nil
}

// ReleaseReservation cancels an active hold, returning the reserved stock to available.
func (s *ReservationsService) ReleaseReservation(ctx context.Context, orgID, reservationID uuid.UUID) (*db.Reservation, error) {
	var released db.Reservation

	err := s.db.WithTenantTxRaw(ctx, orgID, func(q *db.Queries, tx pgx.Tx) error {
		// 1. Fetch active reservation with FOR UPDATE
		var r db.Reservation
		var qty float64
		err := tx.QueryRow(ctx, `
			SELECT reservation_id, org_id, item_id, location_id, quantity::float8, kind, target, status
			FROM reservations
			WHERE reservation_id = $1 AND org_id = $2
			FOR UPDATE
		`, reservationID, orgID).Scan(
			&r.ReservationID, &r.OrgID, &r.ItemID, &r.LocationID, &qty, &r.Kind, &r.Target, &r.Status,
		)
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				return ErrReservationNotFound
			}
			return err
		}

		if r.Status != "active" {
			return ErrReservationInactive
		}

		// 2. Set status to released
		updated, err := q.UpdateReservationStatus(ctx, db.UpdateReservationStatusParams{
			ReservationID: reservationID,
			OrgID:         orgID,
			Status:        "released",
		})
		if err != nil {
			return err
		}
		released = updated

		// 3. Decrement reserved on stock_balances
		_, err = tx.Exec(ctx, `
			UPDATE stock_balances
			SET reserved = GREATEST(0, reserved - $4),
			    updated_at = CURRENT_TIMESTAMP
			WHERE org_id = $1 AND item_id = $2 AND location_id = $3
		`, orgID, r.ItemID, r.LocationID, qty)
		return err
	})

	if err != nil {
		return nil, err
	}
	return &released, nil
}

// FulfillReservation completes an active reservation by moving stock to target location and clearing hold.
func (s *ReservationsService) FulfillReservation(ctx context.Context, orgID, reservationID, toLocationID, actorID uuid.UUID) (*db.Reservation, error) {
	var fulfilled db.Reservation

	err := s.db.WithTenantTxRaw(ctx, orgID, func(q *db.Queries, tx pgx.Tx) error {
		// 1. Fetch reservation
		var r db.Reservation
		var qty float64
		err := tx.QueryRow(ctx, `
			SELECT reservation_id, org_id, item_id, location_id, quantity::float8, kind, target, status
			FROM reservations
			WHERE reservation_id = $1 AND org_id = $2
			FOR UPDATE
		`, reservationID, orgID).Scan(
			&r.ReservationID, &r.OrgID, &r.ItemID, &r.LocationID, &qty, &r.Kind, &r.Target, &r.Status,
		)
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				return ErrReservationNotFound
			}
			return err
		}

		if r.Status != "active" {
			return ErrReservationInactive
		}

		// 2. Record stock movement
		var moveQty pgtype.Numeric
		_ = moveQty.Scan(fmt.Sprintf("%.4f", qty))

		refCode := pgtype.Text{String: fmt.Sprintf("RES-FULFILL-%s", reservationID.String()[:8]), Valid: true}
		_, err = q.CreateStockMove(ctx, db.CreateStockMoveParams{
			OrgID:          orgID,
			ItemID:         r.ItemID,
			FromLocationID: r.LocationID,
			ToLocationID:   toLocationID,
			Quantity:       moveQty,
			MoveType:       "RESERVATION_FULFILLMENT",
			ReferenceCode:  refCode,
			ActorID:        actorID,
		})
		if err != nil {
			return err
		}

		// 3. Mark reservation fulfilled
		updated, err := q.UpdateReservationStatus(ctx, db.UpdateReservationStatusParams{
			ReservationID: reservationID,
			OrgID:         orgID,
			Status:        "fulfilled",
		})
		if err != nil {
			return err
		}
		fulfilled = updated

		// 4. Update balances: decrease on_hand and reserved at source
		_, err = tx.Exec(ctx, `
			UPDATE stock_balances
			SET on_hand = on_hand - $4,
			    reserved = GREATEST(0, reserved - $4),
			    updated_at = CURRENT_TIMESTAMP
			WHERE org_id = $1 AND item_id = $2 AND location_id = $3
		`, orgID, r.ItemID, r.LocationID, qty)
		if err != nil {
			return err
		}

		// 5. Increase on_hand at destination
		_, err = tx.Exec(ctx, `
			INSERT INTO stock_balances (org_id, item_id, location_id, on_hand, reserved, checked_out, updated_at)
			VALUES ($1, $2, $3, $4, 0, 0, CURRENT_TIMESTAMP)
			ON CONFLICT (org_id, item_id, location_id)
			DO UPDATE SET
				on_hand = stock_balances.on_hand + $4,
				updated_at = CURRENT_TIMESTAMP
		`, orgID, r.ItemID, toLocationID, qty)
		return err
	})

	if err != nil {
		return nil, err
	}
	return &fulfilled, nil
}

// ListReservations lists active or all reservations for an organization.
func (s *ReservationsService) ListReservations(ctx context.Context, orgID uuid.UUID, itemID *uuid.UUID, status string) ([]db.Reservation, error) {
	pool := s.db.Pool()

	query := `
		SELECT reservation_id, org_id, item_id, location_id, quantity, kind, target, status, due_back_date, created_by, created_at, updated_at
		FROM reservations
		WHERE org_id = $1
	`
	args := []any{orgID}
	argIdx := 2

	if itemID != nil && *itemID != uuid.Nil {
		query += fmt.Sprintf(" AND item_id = $%d", argIdx)
		args = append(args, *itemID)
		argIdx++
	}

	if status != "" {
		query += fmt.Sprintf(" AND status = $%d", argIdx)
		args = append(args, status)
		argIdx++
	} else {
		query += " AND status = 'active'"
	}

	query += " ORDER BY created_at DESC"

	rows, err := pool.Query(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var reservations []db.Reservation
	for rows.Next() {
		var r db.Reservation
		err := rows.Scan(
			&r.ReservationID, &r.OrgID, &r.ItemID, &r.LocationID, &r.Quantity,
			&r.Kind, &r.Target, &r.Status, &r.DueBackDate, &r.CreatedBy,
			&r.CreatedAt, &r.UpdatedAt,
		)
		if err != nil {
			return nil, err
		}
		reservations = append(reservations, r)
	}

	return reservations, nil
}
