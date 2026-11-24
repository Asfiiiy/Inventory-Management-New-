package auth

import "strings"

// Standard Roles defined in the Inventory System Technical Plan (Phase B2)
const (
	RoleOwner       = "owner"
	RoleManager     = "manager"
	RoleStorekeeper = "storekeeper"
	RoleViewer      = "viewer"

	// Backwards compatibility aliases
	RoleAdmin = "admin"
	RoleStaff = "staff"
)

// Permissions within the inventory platform
type Permission string

const (
	// Products
	PermProductsView   Permission = "products:view"
	PermProductsManage Permission = "products:manage"
	PermProductsDelete Permission = "products:delete"

	// Stock Operations
	PermStockIn      Permission = "stock:in"
	PermStockOut     Permission = "stock:out"
	PermStockAdjust  Permission = "stock:adjust"
	PermStockCount   Permission = "stock:count"
	PermStockReserve Permission = "stock:reserve"

	// Financials & Reporting
	PermValuationView Permission = "valuation:view"
	PermReportsExport Permission = "reports:export"

	// Administration
	PermUsersManage Permission = "users:manage"
	PermSettingsEdit Permission = "settings:edit"
	PermAuditView    Permission = "audit:view"
)

// PermissionTable maps each role to its granted permissions.
var PermissionTable = map[string]map[Permission]bool{
	RoleOwner: {
		PermProductsView:   true,
		PermProductsManage: true,
		PermProductsDelete: true,
		PermStockIn:        true,
		PermStockOut:       true,
		PermStockAdjust:    true,
		PermStockCount:     true,
		PermStockReserve:   true,
		PermValuationView:  true,
		PermReportsExport:  true,
		PermUsersManage:    true,
		PermSettingsEdit:   true,
		PermAuditView:      true,
	},
	RoleManager: {
		PermProductsView:   true,
		PermProductsManage: true,
		PermProductsDelete: false, // Managers cannot delete products
		PermStockIn:        true,
		PermStockOut:       true,
		PermStockAdjust:    true,
		PermStockCount:     true,
		PermStockReserve:   true,
		PermValuationView:  true,
		PermReportsExport:  true,
		PermUsersManage:    false,
		PermSettingsEdit:   false,
		PermAuditView:      true,
	},
	RoleStorekeeper: {
		PermProductsView:   true,
		PermProductsManage: false,
		PermProductsDelete: false,
		PermStockIn:        true,
		PermStockOut:       true,
		PermStockAdjust:    false, // Only counts, not raw manual adjustments
		PermStockCount:     true,
		PermStockReserve:   true,
		PermValuationView:  false, // Valuation masked for storekeepers
		PermReportsExport:  false,
		PermUsersManage:    false,
		PermSettingsEdit:   false,
		PermAuditView:      false,
	},
	// Office IT product role — same capability set as storekeeper, kept as "staff" in DB/UI.
	RoleStaff: {
		PermProductsView:   true,
		PermProductsManage: false,
		PermProductsDelete: false,
		PermStockIn:        false,
		PermStockOut:       false,
		PermStockAdjust:    false,
		PermStockCount:     false,
		PermStockReserve:   false,
		PermValuationView:  false,
		PermReportsExport:  false,
		PermUsersManage:    false,
		PermSettingsEdit:   false,
		PermAuditView:      false,
	},
	RoleViewer: {
		PermProductsView:   true,
		PermProductsManage: false,
		PermProductsDelete: false,
		PermStockIn:        false,
		PermStockOut:       false,
		PermStockAdjust:    false,
		PermStockCount:     false,
		PermStockReserve:   false,
		PermValuationView:  false,
		PermReportsExport:  true,
		PermUsersManage:    false,
		PermSettingsEdit:   false,
		PermAuditView:      false,
	},
}

// CanonicalRole standardizes incoming role strings and legacy aliases.
func CanonicalRole(role string) string {
	r := strings.ToLower(strings.TrimSpace(role))
	switch r {
	case RoleAdmin, RoleOwner:
		return RoleOwner
	case RoleManager:
		return RoleManager
	case RoleStaff, RoleStorekeeper, "employee":
		return RoleStaff
	case "superadmin", "platform_admin":
		return RoleOwner
	case RoleViewer:
		return RoleViewer
	default:
		return RoleViewer
	}
}

// HasPermission checks whether a given role possesses the requested permission.
func HasPermission(role string, perm Permission) bool {
	canonical := CanonicalRole(role)
	perms, ok := PermissionTable[canonical]
	if !ok {
		return false
	}
	return perms[perm]
}
