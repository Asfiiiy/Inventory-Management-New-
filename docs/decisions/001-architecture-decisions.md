# Architecture Decision Record (ADR 001)

## Title: Core Multi-Tenancy & Negative Stock Invariant Decisions (Phase B0)

**Date**: October 2026  
**Status**: Accepted  
**Applies to**: Whoopit Standard Inventory Management Platform  

---

### Decision 1: One Business or Many (Single-Tenant vs. Multi-Tenant SaaS)

#### Context:
An inventory management platform must establish whether it operates as an isolated single-tenant application or supports multi-tenant SaaS organizations. The PDF design specification explicitly advises:
> *"Decide early whether one installation serves one business (simplest) or many separate businesses (a hosted service). The simple advice is to build for one business first, but keep a single 'organization' record and an organization id on main tables so that turning it into a multi-business service later does not need a rewrite."*

#### Decision:
1. **Organization-Ready Architecture**:
   - Every primary data table (`products`, `locations`, `stock_movements`, `stock_balances`, `users`, `reservations`, `audit_log`) contains a mandatory `organization_id` foreign key.
   - For single-tenant deployments, the database seeds and uses the default organization:
     `a0000000-0000-0000-0000-000000000001` ("Headquarters / Main Organization").
2. **PostgreSQL Row-Level Security (RLS)**:
   - Tenant isolation is strictly enforced at the database transaction layer using PostgreSQL native RLS (`FORCE ROW LEVEL SECURITY`) with runtime tenant injection:
     ```sql
     SET LOCAL app.org_id = '<current_tenant_uuid>';
     ```
   - This guarantees 100% data isolation for future SaaS expansion with zero schema rewrites.
3. **Session & JWT Injection**:
   - Every authenticated JWT contains `org_id`, which the Go backend middleware extracts and attaches to the request context.

---

### Decision 2: Negative Stock Policy (Can Stock Ever Go Below Zero?)

#### Context:
In fast-paced retail or hospital operations, goods may physically leave the store shelf before the receiving clerk enters the supplier's inward purchase order into the software. However, allowing uncontrolled negative stock destroys audit integrity, distorts cost valuation (FIFO/Weighted Average), and masks shrinkage/theft.

#### Decision:
1. **Strictly Block Negative Stock by Default**:
   - By default, attempting to dispatch or issue more units than are physically available at the source location will be rejected with `HTTP 422 Unprocessable Entity` ("Source location does not have enough stock").
   - The double-entry balance validation engine checks:
     $$\text{Balance}_{\text{Source}} - \text{Requested Quantity} \ge 0$$
2. **Organization-Level Configurable Override**:
   - If a business explicitly enables `settings.allow_negative_stock = true`, the validation engine permits temporary overdraft movements while raising an audit warning.
3. **Audit & Reversal Integrity**:
   - Stock entries are never deleted. Discrepancies are fixed exclusively via recorded `adjustment` or `reversal` movements to maintain an unbroken audit trail.
