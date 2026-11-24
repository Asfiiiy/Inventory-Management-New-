# Whoopit Universal Multi-Tenant Inventory & Asset Lifecycle Management Platform

> **Enterprise-Grade SaaS Platform featuring PostgreSQL 18 Row-Level Security (RLS), Immutable Double-Entry Stock Ledger, 360° Product Dossier, Cryptographic Tool Custody Chain, Physical Barcode & Thermal Label Engine, Dynamic Custom Field Builder, and Automated Replenishment Telemetry.**

---

## 🏛 System Architecture Overview

Whoopit IMS is engineered around clean domain separation, high-throughput financial integrity, and strict multi-tenant isolation:

```
┌────────────────────────────────────────────────────────────────────────┐
│                        Next.js 16 (App Router)                         │
│   Tailwind CSS v4 • TanStack Query • Web Audio SFX • @media print      │
│   360° Product Dossier • Cryptographic Handover • CSV Bulk Bridge      │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ HTTP / REST (JWT Bearer Auth)
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                         Go 1.27 Core API (Chi)                         │
│   Argon2id + Bcrypt Auth • 4-Tier RBAC • Invariant Stock Ledger        │
│   River Background Queue Worker • Dynamic Custom Fields Validator      │
└───────────────────┬───────────────────────────────┬────────────────────┘
                    │                               │
                    ▼                               ▼
┌───────────────────────────────────┐   ┌────────────────────────────────┐
│   PostgreSQL 18 (Alpine Engine)   │   │     Valkey 9 / Redis Cache     │
│   • Multi-Tenant Row-Level Sec    │   │     • Sub-millisecond locks    │
│   • Two-Sided Double-Entry Moves  │   │     • Sliding-Window Limiter   │
│   • Hierarchical Locations (ltree)│   │     • Session caches           │
│   • Tamper-Evident SHA-256 Ledger │   └────────────────────────────────┘
└───────────────────────────────────┘
```

* **Core API (`backend/cmd/api/`, `backend/internal/`)**: Written in Go 1.27 using `go-chi`, `pgx/v5` connection pooling, and structured logging (`log/slog`).
* **Database Engine (`backend/db/`)**: PostgreSQL 18 utilizing native Row-Level Security (`FORCE ROW LEVEL SECURITY`) with tenant isolation enforced at the database transaction layer via `SET LOCAL app.org_id`.
* **Frontend Web App (`frontend/`)**: Built on Next.js 16 (React 19), Tailwind CSS v4, Lucide icons, Next Themes (dark/light mode), and client-side audio/print engines.

---

## 🎯 Implementation Roadmap: 100% Complete (Phase-by-Phase)

### Backend Phases (B0 – B6)
- [x] **Phase B0 (`8719197`)**: Go 1.27 scaffolding, standard layout, strict config validation, CI, and Docker context optimization (746MB -> 54KB).
- [x] **Phase B1 (`61aa452`)**: Universal PostgreSQL 18 schema, RLS policies, migrations, master seeds, constraints tests (`b1_schema_test.go`).
- [x] **Phase B2 (`c21dfbe`)**: Argon2id + Bcrypt authentication, 4-tier RBAC (`Owner`, `Manager`, `Storekeeper`, `Viewer`), session lifecycle, and immutable audit logs (`b2_auth_rbac_test.go`).
- [x] **Phase B3 (`7fc1acd`)**: Master data CRUD (suppliers, category tree, UOM conversions, soft-delete archive, dynamic custom fields validator, CSV import) (`b3_master_data_test.go`).
- [x] **Phase B4 (`988dc0a`)**: Stock engine (multi-unit UOM in movements, row locking `LockItemForUpdate`, negative stock protection, reservations hold/fulfill, 4-tier stock summaries) (`b4_stock_engine_test.go`).
- [x] **Phase B5 (`1a4f6ee`)**: Stock threshold alerts (`GetStockAlerts`), replenishment calculator, nightly ledger reconciliation (`ReconcileItemLedger`), River queue worker (`ReconciliationWorker`) (`b5_alerts_reconciliation_test.go`).
- [x] **Phase B6 (`4ad6721`)**: Production hardening (OWASP security headers, sliding-window IP rate limiter with RFC 7807 problem details, 10MB body size limiter, `/readyz` probes for PostgreSQL & Valkey) (`b6_production_hardening_test.go`).
- [x] **Mathematical Proof (`e2e`)**: Multi-industry mathematical invariant test verifying global stock conservation across Office IT, Warehouse, Retail, and Factory environments.

### Frontend Phases (F0 – F5)
- [x] **Phase F0**: Next.js 16 AppShell, AuthContext, login screen with quick demo accounts (`admin@whoopit.io` / `staff@whoopit.io`), cookie-based session verification in `middleware.ts`.
- [x] **Phase F1 (`77d34b9`)**:
  - `frontend/src/app/products/page.tsx`: Clickable SKU/name links to dossier, category filters, low-stock filter, cost masking for non-admins, thermal label printing.
  - `frontend/src/app/products/[id]/page.tsx`: Product 360° Dossier connected to `/api/v1/stock/items/{id}/summary`. Renders Active Shop Floor vs. Backup Godown reserve cards, 4-tier status badges, pricing/valuation, inventory thresholds, immutable movement audit timeline, and live ledger reconciliation button (`POST /api/v1/stock/items/{id}/reconcile`).
- [x] **Phase F2 (`c7faec7`)**:
  - Stock In (`/stock-in`): Integrated with multi-unit UOM conversion and idempotency keys, Goods Receipt Note (GRN) modal with QR code.
  - Stock Out (`/stock-out`): Integrated with negative stock 422 error handling, Sales Invoice modal with QR code, and scanner gun support.
  - Tool & Staff Custody (`/custody`): Serialized equipment check-outs (`POST /api/v1/assets/checkout`) and check-ins (`POST /api/v1/assets/checkin`) with tamper-evident cryptographic Handover Certificate modal and QR verification.
- [x] **Phase F3 (`1a99254`)**:
  - Dashboard Analytics & Replenishment Telemetry (`/`): Real-time stock alerts feed from `/api/v1/stock/alerts`, inventory valuation breakdown by category with progress bars, live audit timeline, and cluster probe monitors.
- [x] **Phase F4 (`ad549c0`)**:
  - Dynamic Custom Field Builder (`/settings/custom-fields`): Create and manage dynamic fields (text, number, decimal, date, dropdown, boolean, barcode) enforced by backend Phase B3 validator.
  - Bulk CSV Import Bridge (`/import`): Two-stage importer with client-side syntax validation, dry-run error preview table (`?dry_run=true`), sample template generator, and atomic commit to PostgreSQL.
- [x] **Phase F5 (`master`)**: Production verification, 100% green unit & invariant test suites, Next.js 16 static prerender validation (14/14 routes clean), and documentation wrap-up.

---

## 🔑 Pre-Seeded Demo Credentials

The platform includes pre-configured demo accounts with 1-click quick-fill buttons on the login screen (`http://localhost:3100/login`):

| Role | Email Address | Password | Permissions & Scope |
| :--- | :--- | :--- | :--- |
| **Admin** | `admin@whoopit.io` | `AdminPass123!` | **Full Access**: Financial valuation, cost prices, catalog editing, deletions, stock adjustments, schema builder. |
| **Staff** | `staff@whoopit.io` | `StaffPass123!` | **Operational Only**: Purchases (`/stock-in`), sales (`/stock-out`), custody deployments, barcode printing. Valuation & cost masked. |

---

## 🚀 Quick Start Guide

### Launch Stack via Docker Compose
Launch the entire stack (PostgreSQL 18, Valkey 9, Go Core API, Next.js Web App, Storage, and Mailpit) in one command:

```bash
# 1. Copy environment configuration
cp .env.example .env

# 2. Build and launch all containers
docker compose up -d

# 3. View running services status
docker compose ps
```

Once started:
* **Web Application**: [http://localhost:3100](http://localhost:3100)
* **Backend Core API**: [http://localhost:8080](http://localhost:8080)
* **OpenAPI Documentation**: [http://localhost:8080/swagger](http://localhost:8080/swagger)
* **Health & Probes**: [http://localhost:8080/healthz](http://localhost:8080/healthz) and [http://localhost:8080/readyz](http://localhost:8080/readyz)

---

## 📡 API Reference Overview

All inventory endpoints require authentication via `Authorization: Bearer <token>` and tenant context `X-Tenant-ID`:

| Method | Endpoint | Description | Phase |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/v1/auth/login` | Authenticate user (Argon2id + Bcrypt), returns session token | B2 |
| `POST` | `/api/v1/auth/register` | Register new organization & owner | B2 |
| `GET` | `/api/v1/auth/me` | Fetch authenticated session profile & role | B2 |
| `GET` | `/api/v1/users` | List organization users / staff members | B2 |
| `GET` | `/api/v1/items` | List catalog items with search and category filters | B1, B3 |
| `POST` | `/api/v1/items` | Create product with dynamic custom fields validation | B3 |
| `GET` | `/api/v1/items/{id}` | Get product details by ID | B1 |
| `DELETE`| `/api/v1/items/{id}` | Delete catalog item (Admin Only) | B2 |
| `POST` | `/api/v1/items/import-csv` | Two-phase CSV bulk import with dry-run support | B3 |
| `GET` | `/api/v1/custom-fields` | List dynamic custom field definitions | B3 |
| `POST` | `/api/v1/custom-fields` | Define new dynamic custom field | B3 |
| `DELETE`| `/api/v1/custom-fields/{id}`| Remove dynamic custom field | B3 |
| `POST` | `/api/v1/stock/moves` | Execute double-entry stock move (idempotent, UOM conversion) | B4 |
| `GET` | `/api/v1/stock/moves` | List immutable stock movements history | B1, B4 |
| `GET` | `/api/v1/stock/items/{id}/summary` | 360° summary (on-hand, reserved, available, locations) | B4 |
| `GET` | `/api/v1/stock/alerts` | Automated replenishment and safety buffer alerts | B5 |
| `POST` | `/api/v1/stock/items/{id}/reconcile` | On-demand ledger audit and auto-healing | B5 |
| `GET` | `/api/v1/assets/summary` | Aggregate asset fleet summary (total, deployed, storage) | B1 |
| `GET` | `/api/v1/assets/custody/employee/{id}` | List active serialized assets deployed to worker | B1 |
| `POST` | `/api/v1/assets/checkout` | Assign asset to staff and seal cryptographic evidence | B1, B4 |
| `POST` | `/api/v1/assets/checkin` | Return asset from custody back to warehouse | B1, B4 |
| `GET` | `/api/v1/assets/assignments/{id}/certificate` | Verify tamper-evident SHA-256 certificate | B1 |
| `GET` | `/readyz` | Kubernetes readiness probe (PostgreSQL & Valkey health) | B6 |
| `GET` | `/healthz` | Platform liveness check | B0 |

---

## 🧪 Testing & Validation Runbook

Run backend test suite (unit tests, constraints tests, and multi-industry mathematical invariant E2E test):
```bash
cd backend
go test -v ./test/...
```

Run frontend production build verification:
```bash
cd frontend
cmd.exe /c npm run build
```

---

## 📄 License
This project is licensed under the Apache 2.0 License.
