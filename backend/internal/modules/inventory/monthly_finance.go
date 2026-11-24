package inventory

import (
	"bytes"
	"context"
	"encoding/csv"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"

	"whoopit-core/internal/platform/mail"
)

// SendMonthlyFinanceEmail implements jobs.FinanceMailer for automated month-start digests.
func (h *Handler) SendMonthlyFinanceEmail(ctx context.Context, orgID uuid.UUID, recipient string) error {
	dossier, err := h.buildFinanceDossier(ctx, orgID)
	if err != nil {
		return err
	}

	var csvBuf bytes.Buffer
	csvBuf.Write([]byte{0xEF, 0xBB, 0xBF})
	cw := csv.NewWriter(&csvBuf)
	_ = cw.Write([]string{"MONTHLY IT FINANCE DIGEST - " + strings.ToUpper(dossier.OrganizationName)})
	_ = cw.Write([]string{"Generated At", dossier.GeneratedAt.Format(time.RFC1123)})
	_ = cw.Write([]string{})
	_ = cw.Write([]string{"Gross Asset Value ($)", fmt.Sprintf("%.2f", dossier.KPIs.TotalAssetValuation)})
	_ = cw.Write([]string{"Accumulated Depreciation ($)", fmt.Sprintf("%.2f", dossier.KPIs.TotalAccumulatedDepreciation)})
	_ = cw.Write([]string{"Net Book Value ($)", fmt.Sprintf("%.2f", dossier.KPIs.TotalNetBookValue)})
	_ = cw.Write([]string{"Units Owned", fmt.Sprintf("%.0f", dossier.KPIs.TotalUnitsOwned)})
	_ = cw.Write([]string{"Assigned to Staff", fmt.Sprintf("%.0f", dossier.KPIs.TotalAssigned)})
	_ = cw.Write([]string{"Repair Spend ($)", fmt.Sprintf("%.2f", dossier.KPIs.TotalRepairSpend)})
	_ = cw.Write([]string{})
	_ = cw.Write([]string{"SKU", "Name", "Cost Center", "Owned", "Gross ($)", "NBV ($)"})
	for _, it := range dossier.Items {
		_ = cw.Write([]string{
			it.Sku, it.Name, it.CostCenter,
			fmt.Sprintf("%.0f", it.TotalOwned),
			fmt.Sprintf("%.2f", it.TotalValuation),
			fmt.Sprintf("%.2f", it.NetBookValue),
		})
	}
	cw.Flush()

	subject := fmt.Sprintf("[Monthly Finance] %s — IT asset NBV digest", dossier.OrganizationName)
	html := fmt.Sprintf(`
		<div style="font-family:Segoe UI,Arial,sans-serif;max-width:640px;color:#0f172a">
		  <h2 style="color:#0c3843">Monthly IT Finance Digest</h2>
		  <p><strong>%s</strong> — automated month-start report</p>
		  <ul>
		    <li>Gross asset value: <strong>$%.2f</strong></li>
		    <li>Accumulated depreciation (36-mo SL): <strong>$%.2f</strong></li>
		    <li>Net book value: <strong>$%.2f</strong></li>
		    <li>Units assigned: %.0f</li>
		  </ul>
		  <p>Full CSV attached. Open dashboard: <a href="%s/dashboard">%s/dashboard</a></p>
		</div>`,
		dossier.OrganizationName,
		dossier.KPIs.TotalAssetValuation,
		dossier.KPIs.TotalAccumulatedDepreciation,
		dossier.KPIs.TotalNetBookValue,
		dossier.KPIs.TotalAssigned,
		mail.PublicAppURL(), mail.PublicAppURL(),
	)

	filename := fmt.Sprintf("Monthly_IT_Finance_%s.csv", time.Now().Format("2006-01"))
	_, err = mail.SendWithAttachment(recipient, subject, html, mail.Attachment{
		Filename: filename,
		MimeType: "text/csv",
		Data:     csvBuf.Bytes(),
	})
	return err
}
