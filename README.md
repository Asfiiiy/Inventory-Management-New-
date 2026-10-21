# Whoopit Standard Inventory Management System (IMS)

> **Enterprise-Grade Inventory Management Platform with PostgreSQL 18 Row-Level Security, Immutable Double-Entry Stock Ledger, Physical Barcode Engine, Transaction Documents, and Role-Based Access Control.**

---

## 🏛 System Architecture Overview

Whoopit IMS is engineered around clean domain separation, high-throughput financial integrity, and strict multi-tenant isolation:

```
┌────────────────────────────────────────────────────────────────────────┐
│                        Next.js 16 (App Router)                         │
│   Tailwind CSS v4 • TanStack Query • Web Audio SFX • @media print      │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ HTTP / REST (JWT Bearer Auth)
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                         Go 1.27 Core API (Chi)                         │
│  Bcrypt / JWT Auth • RLS Context Injection • Invariant Balance Engine  │
└───────────────────┬───────────────────────────────┬────────────────────┘
                    │                               │
                    ▼                               ▼
┌───────────────────────────────────┐   ┌────────────────────────────────┐
│   PostgreSQL 18 (Alpine Engine)   │   │     Valkey 9 / Redis Cache     │
│   • Multi-Tenant Row-Level Sec    │   │     • Sub-millisecond locks    │
│   • Two-Sided Double-Entry Moves  │   │     • Session caches           │
│   • Hierarchical Locations (ltree)│   └────────────────────────────────┘
└───────────────────────────────────┘
```

* **Core API (`cmd/api/`, `internal/`)**: Written in Go 1.27 using `go-chi`, `pgx/v5` connection pooling, and structured logging (`log/slog`).
* **Database Engine (`db/`)**: PostgreSQL 18 utilizing native Row-Level Security (`FORCE ROW LEVEL SECURITY`) with tenant isolation enforced at the database transaction layer via `SET LOCAL app.org_id`.
* **Frontend Web App (`web/`)**: Built on Next.js 16 (React 19), Tailwind CSS v4, Lucide icons, Next Themes (dark/light mode), and client-side audio/print engines.

---

## ✨ Feature Summary

### 1. Immutable Two-Sided Stock Ledger
* Every inventory transaction (Purchase, Sale, Cycle Count, or Damage Write-Off) is an atomic double-entry movement between a source (`from_location_id`) and a destination (`to_location_id`).
* **Negative Stock Protection**: Real-time balance validation strictly prevents stock overdrafts. Attempting to dispatch more units than available returns `HTTP 422 Unprocessable Entity`.
* **Zero Discrepancy**: On-hand inventory is calculated directly from ledger entries, ensuring zero data divergence.

### 2. Barcode & QR Code Engine
* **Instant Barcode Generation**: Render standard Code 128 barcodes and 2D QR codes for any SKU using `jsbarcode` and `qrcode.react`.
* **Printable Label Preview Dialog**:
  * **Single Thermal Sticker (50x30mm)**: Optimized for thermal sticker printers.
  * **Standard A4 Label Sheet**: Clean grid of 24 or 30 printable stickers with page-break protection.
* **Physical Scanner Gun Auto-Fill**:
  * Fast keyboard-wedge barcode scanner auto-fill on Stock In and Stock Out pages.
  * Instant auditory feedback (harmonic success scan beep and error buzz via Web Audio API).

### 3. Business Documents & Reports Engine
* **Printable Sales Invoices & Receipts (`/stock-out`)**:
  * Generated automatically upon completing an outward sale or on-demand from transaction history.
  * Complete layout: Invoice Number (`INV-2026-XXXX`), Date & Time, Customer details, Itemized line items, Subtotals, and Authorized Signature line.
* **Printable Purchase Orders (`/stock-in`)**:
  * Official inward purchase orders with supplier information, PO numbers, item breakdown, and delivery verification blocks.
  * Styled with native `@media print` CSS rules (automatically hides sidebars, headers, and UI buttons).
* **Sanitized CSV Spreadsheet Export**:
  * Instant export for Products Master, Purchases, Sales, and Low Stock Alerts.
  * **Formula Injection Sanitization (CSV Injection / CWE-1236)**: Prevents spreadsheet execution exploits by neutralizing leading `=`, `+`, `-`, `@`, `\t`, and `\r` characters.

### 4. Authentication, Session Management & RBAC
* **Real JWT Authentication**: Passwords hashed with bcrypt (cost 12).
* **Next.js Route Middleware (`web/src/middleware.ts`)**: Automatic session validation protecting application routes and redirecting unauthenticated traffic to `/login`.
* **Role-Based Access Control**:
  * 👑 **Role `admin`**: Full access to all screens, financial valuation, cost prices, product deletion, and stock adjustments.
  * 👤 **Role `staff`**: Operational access to inward purchases, outward sales, and product view & barcode printing. Restricted from viewing cost prices and inventory valuation; blocked from deleting products or performing manual stock adjustments.
* **Header Profile**: Displays logged-in user name, dynamic role badges (`ADMIN` / `STAFF`), and functional **Sign Out**.

---

## 🔑 Pre-Seeded Demo Credentials

The platform includes pre-configured demo accounts with 1-click quick-fill buttons on the login screen (`http://localhost:3000/login`):

| Role | Email Address | Password | Permissions & Scope |
| :--- | :--- | :--- | :--- |
| **Admin** | `admin@whoopit.io` | `AdminPass123!` | **Full Access**: Financial valuation, cost prices, catalog editing, deletions, stock adjustments. |
| **Staff** | `staff@whoopit.io` | `StaffPass123!` | **Operational Only**: Purchases (`/stock-in`), sales (`/stock-out`), barcode printing. Valuation & cost masked. |

---

## 🚀 Quick Start Guide

### Option A: Complete Docker Compose (Production Ready)

Launch the entire stack (PostgreSQL 18, Valkey 9, Go Core API, Next.js Web App, Storage, and Mailpit) in one command:

```bash
# 1. Clone repository
git clone https://github.com/your-org/it-inventory-management.git
cd it-inventory-management

# 2. Copy environment file
cp .env.example .env

# 3. Build and launch all containers
docker compose up -d

# 4. View running services
docker compose ps
```

Once started:
* **Web Application**: [http://localhost:3000](http://localhost:3000)
* **Backend Core API**: [http://localhost:8080](http://localhost:8080)
* **OpenAPI Documentation**: [http://localhost:8080/swagger](http://localhost:8080/swagger)
* **Health Check**: [http://localhost:8080/healthz](http://localhost:8080/healthz)

---

### Option B: Local Development Workflow

#### 1. Start Infrastructure (PostgreSQL & Valkey)
```bash
docker compose up -d postgres valkey
```

#### 2. Run Database Migrations
Migrations run automatically on container init, or you can run them manually:
```bash
# Using migrate CLI or psql
psql -h localhost -U whoopit_admin -d whoopit_inventory_v4 -f db/migrations/000001_init_core_and_ledger.up.sql
psql -h localhost -U whoopit_admin -d whoopit_inventory_v4 -f db/migrations/000004_add_user_name.up.sql
```

#### 3. Start Go Backend Core API
```bash
go run ./cmd/api
```
The API server starts on `:8080` with PostgreSQL RLS and Valkey cache connected.

#### 4. Start Next.js Frontend
```bash
cd web
npm install
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 📡 API Reference Overview

All inventory endpoints require authentication via `Authorization: Bearer <token>` (or `X-Tenant-ID` in dev):

| Method | Endpoint | Description | Auth & Role |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/v1/auth/login` | Authenticate user, returns JWT and user profile | Public |
| `POST` | `/api/v1/auth/register` | Register new organization & owner | Public |
| `GET` | `/api/v1/auth/me` | Fetch authenticated session profile & role | Authenticated |
| `GET` | `/api/v1/items` | List all catalog items with attributes | Authenticated |
| `POST` | `/api/v1/items` | Create new catalog product | Authenticated (Admin) |
| `GET` | `/api/v1/items/{id}` | Get product details by ID | Authenticated |
| `DELETE` | `/api/v1/items/{id}` | Delete catalog item | **Admin Only** |
| `GET` | `/api/v1/locations` | List hierarchical storage locations (ltree) | Authenticated |
| `POST` | `/api/v1/stock/moves` | Execute two-sided stock move | Authenticated (Adjustments: Admin) |
| `GET` | `/api/v1/stock/moves` | List ledger stock movements history | Authenticated |
| `GET` | `/api/v1/stock/locations/{id}/balance` | Query on-hand balance for an item at location | Authenticated |
| `GET` | `/healthz` | Platform health & liveness check | Public |

---

## 📁 Repository Structure

```
├── cmd/
│   └── api/                # Main entrypoint for Go Core HTTP API server
├── internal/
│   ├── middleware/         # JWT auth, RLS tenant context, RBAC guards
│   ├── modules/
│   │   ├── auth/           # Authentication handlers, service, and routes
│   │   ├── catalog/        # Items & Locations master data handlers
│   │   └── inventory/      # Double-entry stock ledger & balance service
│   └── platform/
│       ├── auth/           # JWT token generation & verification
│       ├── database/       # PostgreSQL connection pool & RLS transaction wrappers
│       └── http/           # Chi router, CORS middleware, RFC 7807 responses
├── db/
│   └── migrations/         # PostgreSQL DDL migrations (RLS policies, schema)
├── web/
│   ├── src/
│   │   ├── app/            # Next.js 16 App Router pages
│   │   │   ├── login/      # Sleek login page with demo quick-fills
│   │   │   ├── products/   # Products master with barcode printing & RBAC
│   │   │   ├── stock-in/   # Inward purchases & PO generation
│   │   │   ├── stock-out/  # Outward sales, barcode scanner & invoices
│   │   │   └── adjustments/# Manual cycle counts & write-offs
│   │   ├── components/     # UI primitives, modals, layout, barcode renderers
│   │   └── lib/            # API client, auth context, inventory store, CSV export
│   └── Dockerfile          # Production multi-stage Docker build for web
├── Dockerfile              # Production multi-stage Docker build for Go API
├── docker-compose.yml      # Orchestration for full production stack
├── .env.example            # Environment configuration template
└── README.md               # System documentation & quick start guide
```

---

## 🧪 Testing & Validation

Run backend unit and integration test suites:
```bash
go test -v ./...
```

Run frontend production build verification:
```bash
cd web
npm run build
```

---

## 📄 License
This project is licensed under the Apache 2.0 License.
