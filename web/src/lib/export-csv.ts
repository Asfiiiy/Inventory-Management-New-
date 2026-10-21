import { Product } from "@/lib/inventory-store";

/**
 * Sanitizes a cell string to prevent CSV Formula Injection (DDE injection).
 * If a cell begins with '=', '+', '-', '@', tab, or carriage return,
 * prepends a single quote (') so spreadsheet engines (Excel, Google Sheets, LibreOffice)
 * treat it strictly as text.
 */
export function sanitizeCSVCell(value: any): string {
  if (value === null || value === undefined) {
    return "";
  }

  let str = String(value);

  // Check for formula injection triggers
  const firstChar = str.charAt(0);
  if (["=", "+", "-", "@", "\t", "\r"].includes(firstChar)) {
    str = `'${str}`;
  }

  // Escape quotes according to RFC 4180: double any existing double-quotes
  if (str.includes('"') || str.includes(",") || str.includes("\n") || str.includes("\r")) {
    str = `"${str.replace(/"/g, '""')}"`;
  }

  return str;
}

/**
 * Triggers a client-side file download of CSV content with UTF-8 BOM
 * (ensuring proper rendering of symbols and characters in MS Excel).
 */
export function downloadCSV(csvContent: string, fileName: string) {
  const BOM = "\uFEFF"; // Byte Order Mark for Excel UTF-8 compatibility
  const blob = new Blob([BOM + csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);

  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", fileName);
  link.style.visibility = "hidden";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Exports the full Product catalog to a clean spreadsheet
 */
export function exportProductsToCSV(products: Product[], customFilename?: string) {
  const headers = [
    "SKU",
    "Product Name",
    "Category",
    "Current Stock",
    "Unit",
    "Cost Price ($)",
    "Selling Price ($)",
    "Total Valuation ($)",
    "Reorder Level",
    "Stock Status",
    "Last Updated",
  ];

  const rows = products.map((p) => {
    const valuation = (p.currentStock * p.cost).toFixed(2);
    let status = "IN STOCK";
    if (p.currentStock === 0) {
      status = "OUT OF STOCK";
    } else if (p.currentStock <= p.reorderLevel) {
      status = "LOW STOCK ALERT";
    }

    return [
      sanitizeCSVCell(p.sku),
      sanitizeCSVCell(p.name),
      sanitizeCSVCell(p.category),
      sanitizeCSVCell(p.currentStock),
      sanitizeCSVCell(p.unit),
      sanitizeCSVCell(p.cost.toFixed(2)),
      sanitizeCSVCell(p.price.toFixed(2)),
      sanitizeCSVCell(valuation),
      sanitizeCSVCell(p.reorderLevel),
      sanitizeCSVCell(status),
      sanitizeCSVCell(p.updatedAt ? new Date(p.updatedAt).toLocaleDateString() : "N/A"),
    ].join(",");
  });

  const csv = [headers.map(sanitizeCSVCell).join(","), ...rows].join("\r\n");
  const dateStr = new Date().toISOString().split("T")[0];
  const filename = customFilename || `inventory_catalog_${dateStr}.csv`;

  downloadCSV(csv, filename);
}

/**
 * Exports low-stock items into an urgent purchase replenishment report
 */
export function exportLowStockReportToCSV(lowStockProducts: Product[], customFilename?: string) {
  const headers = [
    "SKU",
    "Product Name",
    "Category",
    "Current Stock",
    "Reorder Level",
    "Suggested Reorder Qty",
    "Unit Cost ($)",
    "Estimated Restock Cost ($)",
    "Stock Deficit Status",
  ];

  const rows = lowStockProducts.map((p) => {
    // Recommend restock to bring up to at least twice the reorder level
    const targetBuffer = Math.max(10, p.reorderLevel * 2);
    const suggestedQty = Math.max(1, targetBuffer - p.currentStock);
    const estimatedCost = (suggestedQty * p.cost).toFixed(2);
    const deficitStatus = p.currentStock === 0 ? "CRITICAL (Zero Stock)" : "WARNING (Below Reorder)";

    return [
      sanitizeCSVCell(p.sku),
      sanitizeCSVCell(p.name),
      sanitizeCSVCell(p.category),
      sanitizeCSVCell(p.currentStock),
      sanitizeCSVCell(p.reorderLevel),
      sanitizeCSVCell(suggestedQty),
      sanitizeCSVCell(p.cost.toFixed(2)),
      sanitizeCSVCell(estimatedCost),
      sanitizeCSVCell(deficitStatus),
    ].join(",");
  });

  const csv = [headers.map(sanitizeCSVCell).join(","), ...rows].join("\r\n");
  const dateStr = new Date().toISOString().split("T")[0];
  const filename = customFilename || `low_stock_procurement_report_${dateStr}.csv`;

  downloadCSV(csv, filename);
}
