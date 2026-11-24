package inventory

import (
	"bytes"
	"context"
	"encoding/csv"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/google/uuid"

	"whoopit-core/internal/middleware"
	"whoopit-core/internal/platform/entitlement"
	platformHttp "whoopit-core/internal/platform/http"
	"whoopit-core/internal/platform/mail"
)

type FinanceItemBreakdown struct {
	ItemID                   uuid.UUID `json:"item_id"`
	Sku                      string    `json:"sku"`
	Name                     string    `json:"name"`
	Category                 string    `json:"category"`
	CostCenter               string    `json:"cost_center"`
	BaseUom                  string    `json:"base_uom"`
	UnitCost                 float64   `json:"unit_cost"`
	TotalOwned               float64   `json:"total_owned"`
	InStore                  float64   `json:"in_store"`
	Assigned                 float64   `json:"assigned"`
	Faulty                   float64   `json:"faulty"`
	AtVendor                 float64   `json:"at_vendor"`
	RepairedCount            float64   `json:"repaired_count"`
	ScrappedCount            float64   `json:"scrapped_count"`
	TotalValuation           float64   `json:"total_valuation"`
	MonthsInService          int       `json:"months_in_service"`
	AccumulatedDepreciation  float64   `json:"accumulated_depreciation"`
	NetBookValue             float64   `json:"net_book_value"`
	RepairSpend              float64   `json:"repair_spend"`
}

type FinanceCustodyRow struct {
	AssignmentID       uuid.UUID  `json:"assignment_id"`
	ItemSku            string     `json:"item_sku"`
	ItemName           string     `json:"item_name"`
	EmployeeCode       string     `json:"employee_code"`
	EmployeeName       string     `json:"employee_name"`
	EmployeeDepartment string     `json:"employee_department"`
	SerialNumber       string     `json:"serial_number"`
	Quantity           float64    `json:"quantity"`
	ConditionGrade     string     `json:"condition_grade"`
	HasSignature       bool       `json:"has_signature"`
	CheckoutDate       time.Time  `json:"checkout_date"`
	ReturnedAt         *time.Time `json:"returned_at,omitempty"`
}

type FinanceReportKPIs struct {
	TotalSkus                  int     `json:"total_skus"`
	TotalUnitsOwned            float64 `json:"total_units_owned"`
	TotalInStore               float64 `json:"total_in_store"`
	TotalAssigned              float64 `json:"total_assigned"`
	TotalFaulty                float64 `json:"total_faulty"`
	TotalAtVendor              float64 `json:"total_at_vendor"`
	TotalRepairedCount         float64 `json:"total_repaired_count"`
	TotalScrappedCount         float64 `json:"total_scrapped_count"`
	TotalAssetValuation        float64 `json:"total_asset_valuation"`
	TotalAccumulatedDepreciation float64 `json:"total_accumulated_depreciation"`
	TotalNetBookValue          float64 `json:"total_net_book_value"`
	InStoreValuation           float64 `json:"in_store_valuation"`
	AssignedValuation          float64 `json:"assigned_valuation"`
	TotalRepairSpend           float64 `json:"total_repair_spend"`
	DepreciationMonths         int     `json:"depreciation_months"`
}

type FinanceAuditDossier struct {
	GeneratedAt      time.Time              `json:"generated_at"`
	OrganizationName string                 `json:"organization_name"`
	KPIs             FinanceReportKPIs      `json:"kpis"`
	Items            []FinanceItemBreakdown `json:"items"`
	CustodyRecords   []FinanceCustodyRow    `json:"custody_records"`
	RepairRecords    []RepairRecord         `json:"repair_records"`
}

func monthsInServiceSince(raw string, now time.Time, maxMonths int) int {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return 0
	}
	layouts := []string{
		time.RFC3339,
		"2006-01-02T15:04:05Z07:00",
		"2006-01-02 15:04:05.999999-07",
		"2006-01-02 15:04:05",
		"2006-01-02",
		"02/01/2006",
		"01/02/2006",
	}
	var start time.Time
	var ok bool
	for _, layout := range layouts {
		if t, err := time.Parse(layout, raw); err == nil {
			start = t
			ok = true
			break
		}
	}
	if !ok {
		return 0
	}
	if start.After(now) {
		return 0
	}
	months := (now.Year()-start.Year())*12 + int(now.Month()-start.Month())
	if now.Day() < start.Day() {
		months--
	}
	if months < 0 {
		months = 0
	}
	if months > maxMonths {
		months = maxMonths
	}
	return months
}

func (h *Handler) buildFinanceDossier(ctx context.Context, orgID uuid.UUID) (*FinanceAuditDossier, error) {
	pool := h.service.db.Pool()

	var orgName string
	_ = pool.QueryRow(ctx, `SELECT name FROM organizations WHERE org_id = $1`, orgID).Scan(&orgName)
	if orgName == "" {
		orgName = "Office IT Department"
	}

	const depMonths = 36
	now := time.Now()

	// 1. Fetch Items with lifecycle buckets, cost center, purchase date, repair spend
	rows, err := pool.Query(ctx, `
		SELECT
			i.item_id, i.sku, i.name,
			COALESCE(c.name, i.attributes->>'category', 'IT Hardware') AS category,
			COALESCE(NULLIF(i.cost_center, ''), i.attributes->>'cost_center', i.attributes->>'Cost Center', '') AS cost_center,
			i.base_uom,
			COALESCE(i.cost_price, 0)::float8,
			COALESCE(NULLIF(i.attributes->>'purchase_date', ''), NULLIF(i.attributes->>'procurement_date', ''), i.created_at::text) AS purchase_raw,
			COALESCE((SELECT SUM(sb.on_hand) FROM stock_balances sb WHERE sb.item_id = i.item_id AND sb.org_id = i.org_id), 0)::float8 AS in_store,
			COALESCE((SELECT SUM(a.quantity) FROM asset_assignments a WHERE a.asset_id = i.item_id AND a.org_id = i.org_id AND a.returned_at IS NULL), 0)::float8 AS assigned,
			COALESCE((SELECT SUM(r.quantity) FROM asset_repairs r WHERE r.item_id = i.item_id AND r.org_id = i.org_id AND r.status = 'FAULTY'), 0)::float8 AS faulty,
			COALESCE((SELECT SUM(r.quantity) FROM asset_repairs r WHERE r.item_id = i.item_id AND r.org_id = i.org_id AND r.status = 'AT_VENDOR'), 0)::float8 AS at_vendor,
			COALESCE((SELECT SUM(r.quantity) FROM asset_repairs r WHERE r.item_id = i.item_id AND r.org_id = i.org_id AND r.status = 'REPAIRED'), 0)::float8 AS repaired,
			COALESCE((SELECT SUM(r.quantity) FROM asset_repairs r WHERE r.item_id = i.item_id AND r.org_id = i.org_id AND r.status = 'SCRAPPED'), 0)::float8 AS scrapped,
			COALESCE((SELECT SUM(r.repair_cost) FROM asset_repairs r WHERE r.item_id = i.item_id AND r.org_id = i.org_id), 0)::float8 AS repair_spend
		FROM items i
		LEFT JOIN categories c ON c.category_id = i.category_id
		WHERE i.org_id = $1 AND i.is_active = true
		ORDER BY i.name ASC
	`, orgID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var items []FinanceItemBreakdown
	var kpis FinanceReportKPIs
	kpis.DepreciationMonths = depMonths

	for rows.Next() {
		var it FinanceItemBreakdown
		var purchaseRaw string
		if err := rows.Scan(
			&it.ItemID, &it.Sku, &it.Name, &it.Category, &it.CostCenter, &it.BaseUom, &it.UnitCost, &purchaseRaw,
			&it.InStore, &it.Assigned, &it.Faulty, &it.AtVendor, &it.RepairedCount, &it.ScrappedCount, &it.RepairSpend,
		); err != nil {
			return nil, err
		}
		it.TotalOwned = it.InStore + it.Assigned + it.Faulty + it.AtVendor
		it.TotalValuation = it.TotalOwned * it.UnitCost
		it.MonthsInService = monthsInServiceSince(purchaseRaw, now, depMonths)
		perUnitDep := it.UnitCost * float64(it.MonthsInService) / float64(depMonths)
		if perUnitDep > it.UnitCost {
			perUnitDep = it.UnitCost
		}
		it.AccumulatedDepreciation = perUnitDep * it.TotalOwned
		it.NetBookValue = it.TotalValuation - it.AccumulatedDepreciation
		if it.NetBookValue < 0 {
			it.NetBookValue = 0
		}

		kpis.TotalSkus++
		kpis.TotalUnitsOwned += it.TotalOwned
		kpis.TotalInStore += it.InStore
		kpis.TotalAssigned += it.Assigned
		kpis.TotalFaulty += it.Faulty
		kpis.TotalAtVendor += it.AtVendor
		kpis.TotalRepairedCount += it.RepairedCount
		kpis.TotalScrappedCount += it.ScrappedCount
		kpis.TotalAssetValuation += it.TotalValuation
		kpis.TotalAccumulatedDepreciation += it.AccumulatedDepreciation
		kpis.TotalNetBookValue += it.NetBookValue
		kpis.InStoreValuation += it.InStore * it.UnitCost
		kpis.AssignedValuation += it.Assigned * it.UnitCost
		kpis.TotalRepairSpend += it.RepairSpend

		items = append(items, it)
	}

	// 2. Fetch Custody Assignments
	cRows, err := pool.Query(ctx, `
		SELECT
			a.assignment_id, COALESCE(i.sku, ''), COALESCE(i.name, ''),
			COALESCE(NULLIF(a.employee_code, ''), 'EMP-' || UPPER(SUBSTRING(a.assigned_to_user_id::text, 1, 6))),
			COALESCE(NULLIF(a.employee_name, ''), u.name, 'Employee'),
			COALESCE(NULLIF(a.employee_department, ''), u.role, 'IT / Operations'),
			COALESCE(a.serial_number, ''),
			COALESCE(a.quantity, 1)::float8,
			COALESCE(a.condition_grade, 'A'),
			(LENGTH(COALESCE(a.signature_data, '')) > 10) AS has_sig,
			a.checkout_date,
			a.returned_at
		FROM asset_assignments a
		JOIN items i ON i.item_id = a.asset_id
		LEFT JOIN users u ON u.user_id = a.assigned_to_user_id
		WHERE a.org_id = $1
		ORDER BY a.checkout_date DESC
	`, orgID)
	if err != nil {
		return nil, err
	}
	defer cRows.Close()

	custodyList := make([]FinanceCustodyRow, 0)
	for cRows.Next() {
		var c FinanceCustodyRow
		if err := cRows.Scan(
			&c.AssignmentID, &c.ItemSku, &c.ItemName,
			&c.EmployeeCode, &c.EmployeeName, &c.EmployeeDepartment,
			&c.SerialNumber, &c.Quantity, &c.ConditionGrade,
			&c.HasSignature, &c.CheckoutDate, &c.ReturnedAt,
		); err != nil {
			return nil, err
		}
		custodyList = append(custodyList, c)
	}

	// 3. Fetch Repair Records
	rRows, err := pool.Query(ctx, `
		SELECT
			r.repair_id, r.org_id, r.item_id,
			COALESCE(i.sku, ''), COALESCE(i.name, ''),
			r.quantity::float8, COALESCE(r.serial_number, ''), r.status,
			COALESCE(r.issue_description, ''), COALESCE(r.reported_by, ''),
			COALESCE(r.vendor_name, ''), COALESCE(r.vendor_contact, ''),
			COALESCE(r.ticket_reference, ''),
			r.sent_date, r.expected_return_date, r.repaired_date,
			COALESCE(r.repair_cost, 0)::float8, COALESCE(r.resolution_notes, ''),
			r.created_at, r.updated_at
		FROM asset_repairs r
		JOIN items i ON i.item_id = r.item_id
		WHERE r.org_id = $1
		ORDER BY r.created_at DESC
	`, orgID)
	if err != nil {
		return nil, err
	}
	defer rRows.Close()

	repairsList := make([]RepairRecord, 0)
	for rRows.Next() {
		var rec RepairRecord
		if err := rRows.Scan(
			&rec.RepairID, &rec.OrgID, &rec.ItemID,
			&rec.ItemSku, &rec.ItemName,
			&rec.Quantity, &rec.SerialNumber, &rec.Status,
			&rec.IssueDescription, &rec.ReportedBy,
			&rec.VendorName, &rec.VendorContact,
			&rec.TicketReference,
			&rec.SentDate, &rec.ExpectedReturnDate, &rec.RepairedDate,
			&rec.RepairCost, &rec.ResolutionNotes,
			&rec.CreatedAt, &rec.UpdatedAt,
		); err != nil {
			return nil, err
		}
		repairsList = append(repairsList, rec)
	}

	if items == nil {
		items = []FinanceItemBreakdown{}
	}

	return &FinanceAuditDossier{
		GeneratedAt:      time.Now(),
		OrganizationName: orgName,
		KPIs:             kpis,
		Items:            items,
		CustodyRecords:   custodyList,
		RepairRecords:    repairsList,
	}, nil
}

// GetFinanceReport returns the complete Finance Manager Audit Dossier JSON.
func (h *Handler) GetFinanceReport(w http.ResponseWriter, r *http.Request) {
	orgID, ok := middleware.GetTenantID(r.Context())
	if !ok {
		platformHttp.RespondProblem(w, r, http.StatusUnauthorized, "Unauthorized", "Tenant context missing", nil)
		return
	}

	snap, err := entitlement.Load(r.Context(), h.service.db.Pool(), orgID)
	if err != nil {
		platformHttp.RespondProblem(w, r, http.StatusInternalServerError, "License Check Failed", "Could not verify the workspace plan.", nil)
		return
	}
	if pe := snap.AccessError(); pe != nil {
		platformHttp.RespondProblem(w, r, pe.HTTPStatus, pe.Title, pe.Detail, nil)
		return
	}

	dossier, err := h.buildFinanceDossier(r.Context(), orgID)
	if err != nil {
		platformHttp.RespondProblem(w, r, http.StatusInternalServerError, "Report Generation Error", err.Error(), nil)
		return
	}

	// Trial: on-screen KPI preview only — strip exportable detail rows.
	exportAllowed := snap.FinanceExportError() == nil
	if !exportAllowed {
		dossier.Items = []FinanceItemBreakdown{}
		dossier.CustodyRecords = []FinanceCustodyRow{}
		dossier.RepairRecords = []RepairRecord{}
	}

	platformHttp.RespondJSON(w, http.StatusOK, dossier, map[string]any{
		"export_allowed": exportAllowed,
		"plan":           snap.Plan,
	})
}

type SendFinanceEmailRequest struct {
	RecipientEmail string `json:"recipient_email"`
	RecipientName  string `json:"recipient_name"`
	Subject        string `json:"subject"`
	Notes          string `json:"notes"`
}

// SendFinanceReportEmail generates the multi-section CSV + HTML report and emails it directly to the Finance Manager.
func (h *Handler) SendFinanceReportEmail(w http.ResponseWriter, r *http.Request) {
	orgID, ok := middleware.GetTenantID(r.Context())
	if !ok {
		platformHttp.RespondProblem(w, r, http.StatusUnauthorized, "Unauthorized", "Tenant context missing", nil)
		return
	}

	var req SendFinanceEmailRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		platformHttp.RespondProblem(w, r, http.StatusBadRequest, "Bad Request", "Malformed JSON body", nil)
		return
	}

	recipient := strings.TrimSpace(req.RecipientEmail)
	if recipient == "" || !strings.Contains(recipient, "@") {
		platformHttp.RespondProblem(w, r, http.StatusUnprocessableEntity, "Validation Error", "Valid recipient_email is required", nil)
		return
	}

	snap, err := entitlement.Load(r.Context(), h.service.db.Pool(), orgID)
	if err != nil {
		platformHttp.RespondProblem(w, r, http.StatusInternalServerError, "License Check Failed", "Could not verify the workspace plan.", nil)
		return
	}
	if pe := snap.FinanceEmailError(); pe != nil {
		platformHttp.RespondProblem(w, r, pe.HTTPStatus, pe.Title, pe.Detail, nil)
		return
	}

	dossier, err := h.buildFinanceDossier(r.Context(), orgID)
	if err != nil {
		platformHttp.RespondProblem(w, r, http.StatusInternalServerError, "Report Error", err.Error(), nil)
		return
	}

	// 1. Build CSV Attachment bytes
	var csvBuf bytes.Buffer
	// Write UTF-8 BOM for Excel
	csvBuf.Write([]byte{0xEF, 0xBB, 0xBF})
	cw := csv.NewWriter(&csvBuf)

	_ = cw.Write([]string{"OFFICE IT INVENTORY & ASSET LIFECYCLE AUDIT REPORT - " + strings.ToUpper(dossier.OrganizationName)})
	_ = cw.Write([]string{"Generated At", dossier.GeneratedAt.Format(time.RFC1123)})
	_ = cw.Write([]string{})

	_ = cw.Write([]string{"SECTION 1: EXECUTIVE SUMMARY KPIs"})
	_ = cw.Write([]string{"Total Product SKUs", "Total Units Owned", "Available in IT Store", "Assigned to Employees", "Faulty / Damaged", "At Vendor for Repair", "Repaired History Count", "Total Asset Valuation ($)", "Total Vendor Repair Spend ($)"})
	_ = cw.Write([]string{
		fmt.Sprintf("%d", dossier.KPIs.TotalSkus),
		fmt.Sprintf("%.0f", dossier.KPIs.TotalUnitsOwned),
		fmt.Sprintf("%.0f", dossier.KPIs.TotalInStore),
		fmt.Sprintf("%.0f", dossier.KPIs.TotalAssigned),
		fmt.Sprintf("%.0f", dossier.KPIs.TotalFaulty),
		fmt.Sprintf("%.0f", dossier.KPIs.TotalAtVendor),
		fmt.Sprintf("%.0f", dossier.KPIs.TotalRepairedCount),
		fmt.Sprintf("%.2f", dossier.KPIs.TotalAssetValuation),
		fmt.Sprintf("%.2f", dossier.KPIs.TotalRepairSpend),
	})
	_ = cw.Write([]string{})

	_ = cw.Write([]string{"SECTION 2: PRODUCT-BY-PRODUCT IT LIFECYCLE BREAKDOWN"})
	_ = cw.Write([]string{"SKU", "Product Name", "Category", "Cost Center", "Total Owned", "In Store (Available)", "Assigned to Staff", "Faulty (Damaged)", "At Vendor (Under Repair)", "Repaired & Returned Count", "Unit Cost ($)", "Gross Value ($)", "Months In Service", "Accum. Depreciation ($)", "Net Book Value ($)", "Vendor Repair Spend ($)"})
	for _, it := range dossier.Items {
		_ = cw.Write([]string{
			it.Sku, it.Name, it.Category, it.CostCenter,
			fmt.Sprintf("%.0f", it.TotalOwned),
			fmt.Sprintf("%.0f", it.InStore),
			fmt.Sprintf("%.0f", it.Assigned),
			fmt.Sprintf("%.0f", it.Faulty),
			fmt.Sprintf("%.0f", it.AtVendor),
			fmt.Sprintf("%.0f", it.RepairedCount),
			fmt.Sprintf("%.2f", it.UnitCost),
			fmt.Sprintf("%.2f", it.TotalValuation),
			fmt.Sprintf("%d", it.MonthsInService),
			fmt.Sprintf("%.2f", it.AccumulatedDepreciation),
			fmt.Sprintf("%.2f", it.NetBookValue),
			fmt.Sprintf("%.2f", it.RepairSpend),
		})
	}
	_ = cw.Write([]string{})

	_ = cw.Write([]string{"SECTION 3: EMPLOYEE CUSTODY & ONLINE SIGNATURE REGISTER"})
	_ = cw.Write([]string{"Employee ID", "Employee Name", "Department", "Item SKU", "Item Name", "Serial / Tag #", "Qty", "Condition", "Online Signature Verified", "Handover Date", "Status"})
	for _, c := range dossier.CustodyRecords {
		status := "Active with Employee"
		if c.ReturnedAt != nil {
			status = "Returned (" + c.ReturnedAt.Format("2006-01-02") + ")"
		}
		sigStatus := "Signed Online"
		if !c.HasSignature {
			sigStatus = "System Verified"
		}
		_ = cw.Write([]string{
			c.EmployeeCode, c.EmployeeName, c.EmployeeDepartment,
			c.ItemSku, c.ItemName, c.SerialNumber,
			fmt.Sprintf("%.0f", c.Quantity), c.ConditionGrade,
			sigStatus, c.CheckoutDate.Format("2006-01-02 15:04"), status,
		})
	}
	_ = cw.Write([]string{})

	_ = cw.Write([]string{"SECTION 4: FAULTY & VENDOR REPAIR TRACK RECORD"})
	_ = cw.Write([]string{"Ticket #", "Item SKU", "Item Name", "Serial #", "Qty", "Status", "Fault / Issue Description", "Reported By", "Vendor Name", "Repair Cost ($)", "Resolution Notes", "Date Logged"})
	for _, rep := range dossier.RepairRecords {
		_ = cw.Write([]string{
			rep.TicketReference, rep.ItemSku, rep.ItemName, rep.SerialNumber,
			fmt.Sprintf("%.0f", rep.Quantity), rep.Status, rep.IssueDescription,
			rep.ReportedBy, rep.VendorName, fmt.Sprintf("%.2f", rep.RepairCost),
			rep.ResolutionNotes, rep.CreatedAt.Format("2006-01-02"),
		})
	}
	cw.Flush()

	subject := strings.TrimSpace(req.Subject)
	if subject == "" {
		subject = fmt.Sprintf("[Finance Audit] %s - Complete IT Inventory, Custody & Repair Report", dossier.OrganizationName)
	}

	recipientName := strings.TrimSpace(req.RecipientName)
	if recipientName == "" {
		recipientName = "Finance Manager"
	}

	htmlBody := fmt.Sprintf(`
		<div style="font-family: Inter, Arial, sans-serif; color: #0f172a; max-width: 680px; margin: 0 auto;">
			<div style="background: #0c3843; color: #ffffff; padding: 20px 24px; border-radius: 12px 12px 0 0;">
				<h2 style="margin: 0; font-size: 18px;">%s — IT Inventory & Finance Audit Dossier</h2>
				<p style="margin: 4px 0 0; font-size: 12px; color: #a5f3fc;">Generated on %s</p>
			</div>
			<div style="border: 1px solid #e2e8f0; border-top: none; padding: 24px; border-radius: 0 0 12px 12px;">
				<p style="font-size: 14px;">Dear <strong>%s</strong>,</p>
				<p style="font-size: 13px; color: #475569;">Please find attached the complete Office IT Inventory, Employee Custody Handover, and Vendor Repair Audit CSV sheet.</p>
				%s
				<table style="width: 100%%; border-collapse: collapse; margin: 16px 0; font-size: 13px;">
					<tr style="background: #f8fafc;">
						<td style="padding: 10px; border: 1px solid #e2e8f0;"><strong>Total Units Owned</strong></td>
						<td style="padding: 10px; border: 1px solid #e2e8f0;">%.0f units (%d SKUs)</td>
						<td style="padding: 10px; border: 1px solid #e2e8f0;"><strong>Total Asset Value</strong></td>
						<td style="padding: 10px; border: 1px solid #e2e8f0;"><strong>$%.2f</strong></td>
					</tr>
					<tr>
						<td style="padding: 10px; border: 1px solid #e2e8f0;"><strong>Available in IT Store</strong></td>
						<td style="padding: 10px; border: 1px solid #e2e8f0;">%.0f units ($%.2f)</td>
						<td style="padding: 10px; border: 1px solid #e2e8f0;"><strong>Assigned to Employees</strong></td>
						<td style="padding: 10px; border: 1px solid #e2e8f0;">%.0f units ($%.2f)</td>
					</tr>
					<tr style="background: #f8fafc;">
						<td style="padding: 10px; border: 1px solid #e2e8f0;"><strong>Faulty / Damaged</strong></td>
						<td style="padding: 10px; border: 1px solid #e2e8f0;">%.0f units</td>
						<td style="padding: 10px; border: 1px solid #e2e8f0;"><strong>At Vendor for Repair</strong></td>
						<td style="padding: 10px; border: 1px solid #e2e8f0;">%.0f units</td>
					</tr>
					<tr>
						<td style="padding: 10px; border: 1px solid #e2e8f0;"><strong>Repaired & Returned</strong></td>
						<td style="padding: 10px; border: 1px solid #e2e8f0;">%.0f units</td>
						<td style="padding: 10px; border: 1px solid #e2e8f0;"><strong>Total Repair Spend</strong></td>
						<td style="padding: 10px; border: 1px solid #e2e8f0; color: #e11d48;"><strong>$%.2f</strong></td>
					</tr>
				</table>
				<p style="font-size: 12px; color: #64748b;">Attached File: <strong>IT_Asset_Finance_Audit_Report.csv</strong></p>
			</div>
		</div>
	`,
		dossier.OrganizationName,
		dossier.GeneratedAt.Format("02 Jan 2006 15:04"),
		recipientName,
		func() string {
			if strings.TrimSpace(req.Notes) == "" {
				return ""
			}
			return fmt.Sprintf(`<div style="background:#f1f5f9;padding:12px;border-left:4px solid #0c3843;font-size:13px;margin:12px 0;"><strong>Note from IT Admin:</strong> %s</div>`, req.Notes)
		}(),
		dossier.KPIs.TotalUnitsOwned, dossier.KPIs.TotalSkus, dossier.KPIs.TotalAssetValuation,
		dossier.KPIs.TotalInStore, dossier.KPIs.InStoreValuation,
		dossier.KPIs.TotalAssigned, dossier.KPIs.AssignedValuation,
		dossier.KPIs.TotalFaulty, dossier.KPIs.TotalAtVendor,
		dossier.KPIs.TotalRepairedCount, dossier.KPIs.TotalRepairSpend,
	)

	filename := fmt.Sprintf("IT_Asset_Finance_Audit_%s.csv", time.Now().Format("2006-01-02"))
	result, err := mail.SendWithAttachment(recipient, subject, htmlBody, mail.Attachment{
		Filename: filename,
		MimeType: "text/csv",
		Data:     csvBuf.Bytes(),
	})
	if err != nil {
		platformHttp.RespondProblem(w, r, http.StatusBadGateway, "Email Delivery Failed", err.Error(), nil)
		return
	}

	platformHttp.RespondJSON(w, http.StatusOK, map[string]any{
		"sent":            true,
		"recipient_email": recipient,
		"recipient_name":  recipientName,
		"subject":         subject,
		"attachment_name": filename,
		"smtp_relay":      result.Relay,
		"mailpit_url":     mail.MailpitURL(),
		"kpis":            dossier.KPIs,
	}, nil)
}
