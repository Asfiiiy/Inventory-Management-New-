const http = require("http");

const BASE_URL = process.env.API_URL || "http://127.0.0.1:8081";

function request(path, options = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const headers = {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    };

    const req = http.request(
      url,
      {
        method: options.method || "GET",
        headers,
      },
      (res) => {
        let body = "";
        res.on("data", (chunk) => (body += chunk));
        res.on("end", () => {
          let parsed;
          try {
            parsed = JSON.parse(body);
          } catch {
            parsed = body;
          }
          resolve({ status: res.statusCode, headers: res.headers, data: parsed });
        });
      }
    );

    req.on("error", reject);

    if (options.body) {
      req.write(typeof options.body === "string" ? options.body : JSON.stringify(options.body));
    }
    req.end();
  });
}

async function runAllTests() {
  console.log("==================================================");
  console.log("   WHOOPIT IMS: COMPREHENSIVE E2E VERIFICATION   ");
  console.log("==================================================");

  let passed = 0;
  let failed = 0;

  function assert(condition, testName, details = "") {
    if (condition) {
      console.log(`[PASS] ${testName}`);
      passed++;
    } else {
      console.error(`[FAIL] ${testName} ${details ? "- " + details : ""}`);
      failed++;
    }
  }

  try {
    // 1. Healthcheck
    const health = await request("/healthz");
    assert(health.status === 200 && health.data.data?.status === "healthy", "1. Backend Healthcheck (/healthz)");

    // 2. SuperAdmin Login
    const loginRes = await request("/api/v1/auth/login", {
      method: "POST",
      body: { email: "admin@whoopit.io", password: "Password123!" },
    });
    assert(loginRes.status === 200 && loginRes.data.data?.token, "2. SuperAdmin Authentication");
    const superToken = loginRes.data.data.token;
    const defaultOrgId = loginRes.data.data.user.org_id;

    const superHeaders = { Authorization: `Bearer ${superToken}` };

    // 3. SuperAdmin Provision New Organization ("Give Software")
    const testOrgName = `Atlas Dynamics ${Date.now().toString().slice(-4)}`;
    const testAdminEmail = `admin-${Date.now()}@atlasdynamics.com`;
    const provRes = await request("/api/v1/superadmin/organizations", {
      method: "POST",
      headers: superHeaders,
      body: {
        name: testOrgName,
        plan: "enterprise",
        admin_name: "Atlas Admin",
        admin_email: testAdminEmail,
        admin_password: "Password123!",
      },
    });
    assert(provRes.status === 201 && provRes.data.data?.org_id, "3. Provision Client Software ('Give Software')");
    const newOrgId = provRes.data.data.org_id;

    // 4. Multi-Tenant Switching ("Open Store") with X-Tenant-ID Header override
    const tenantHeaders = {
      Authorization: `Bearer ${superToken}`,
      "X-Tenant-ID": newOrgId,
    };
    const locRes = await request("/api/v1/locations", { headers: tenantHeaders });
    assert(locRes.status === 200 && Array.isArray(locRes.data.data), "4. Multi-Tenant Context Switch ('Open Store')");
    const locs = locRes.data.data;
    const categories = locs.map((l) => l.category);
    assert(
      categories.includes("virtual_vendor") &&
      categories.includes("virtual_customer") &&
      categories.includes("virtual_scrap") &&
      categories.includes("virtual_custody") &&
      (categories.includes("physical_office") || categories.includes("physical_warehouse")),
      "5. Provisioned Tenant has complete Physical & Virtual Topology",
      `Categories found: ${categories.join(", ")}`
    );

    const vendorLoc = locs.find((l) => l.category === "virtual_vendor");
    const custLoc = locs.find((l) => l.category === "virtual_customer");
    const scrapLoc = locs.find((l) => l.category === "virtual_scrap");
    const warehouseLoc = locs.find((l) => l.category === "physical_warehouse" || l.category === "physical_office");

    // 6. Custom Fields CRUD (/settings/custom-fields)
    const cfRes = await request("/api/v1/custom-fields", {
      method: "POST",
      headers: tenantHeaders,
      body: {
        field_name: "warranty_expiry",
        field_type: "text",
        is_required: true,
      },
    });
    assert(cfRes.status === 201 && cfRes.data.data?.field_id, "6. Create Custom Field Definition (is_required: true)");
    const customFieldId = cfRes.data.data.field_id;

    const cfList = await request("/api/v1/custom-fields", { headers: tenantHeaders });
    assert(
      cfList.status === 200 && cfList.data.data.some((f) => f.field_name === "warranty_expiry"),
      "7. List Custom Fields contains newly created field"
    );

    // 7. Product Creation with Custom Field Validation
    // 7a: Missing required custom field should fail with 422
    const failProdRes = await request("/api/v1/items", {
      method: "POST",
      headers: tenantHeaders,
      body: {
        sku: "FAIL-ITEM-01",
        name: "Missing Warranty Item",
        attributes: {},
      },
    });
    assert(failProdRes.status === 422, "8. Custom Field Validation correctly rejects missing required field (HTTP 422)");

    // 7b: Valid Product Creation
    const itemSku = `ITEM-${Date.now().toString().slice(-4)}`;
    const createProdRes = await request("/api/v1/items", {
      method: "POST",
      headers: tenantHeaders,
      body: {
        sku: itemSku,
        name: "Dell PowerEdge Server R760",
        base_uom: "unit",
        barcode: `890${Date.now().toString().slice(-9)}`,
        cost_price: 2400.0,
        selling_price: 3600.0,
        reorder_level: 3,
        buffer_stock: 1,
        attributes: {
          warranty_expiry: "2028-12-31",
        },
      },
    });
    assert(createProdRes.status === 201 && createProdRes.data.data?.item_id, "9. Create Product with Custom Field & Pricing (HTTP 201)");
    const itemId = createProdRes.data.data.item_id;

    // 8. Update Product (PUT /api/v1/items/{id})
    const updateRes = await request(`/api/v1/items/${itemId}`, {
      method: "PUT",
      headers: tenantHeaders,
      body: {
        name: "Dell PowerEdge Server R760 Enterprise Edition",
        selling_price: 3850.0,
        cost_price: 2450.0,
        reorder_level: 4,
      },
    });
    assert(
      updateRes.status === 200 &&
      updateRes.data.data?.name === "Dell PowerEdge Server R760 Enterprise Edition" &&
      Number(updateRes.data.data?.selling_price) === 3850,
      "10. Product Master Update persisted to Database (PUT /items/{id})"
    );

    // 9. Stock In (Inward Receipt) with Supplier and Unit Cost
    const stockInRes = await request("/api/v1/stock/moves", {
      method: "POST",
      headers: tenantHeaders,
      body: {
        item_id: itemId,
        from_location_id: vendorLoc.location_id,
        to_location_id: warehouseLoc.location_id,
        quantity: 10,
        move_type: "INWARD_RECEIPT",
        reference_code: `PO-${Date.now().toString().slice(-6)}`,
        usage_target: "Dell Global Distribution Inc",
        unit_cost: 2450.0,
      },
    });
    assert(stockInRes.status === 201 && stockInRes.data.data?.move?.move_id, "11. Stock In (Receive + Restock) with Supplier & Cost");

    // Check Balance
    const balRes = await request(`/api/v1/stock/locations/${warehouseLoc.location_id}/balance?item_id=${itemId}`, {
      headers: tenantHeaders,
    });
    assert(balRes.status === 200 && Number(balRes.data.data?.balance) === 10, "12. Materialized Two-Sided Ledger Balance is exactly 10 units");

    // 10. Stock Out (Dispatch / Sell) with Customer
    const stockOutRes = await request("/api/v1/stock/moves", {
      method: "POST",
      headers: tenantHeaders,
      body: {
        item_id: itemId,
        from_location_id: warehouseLoc.location_id,
        to_location_id: custLoc.location_id,
        quantity: 2,
        move_type: "RETAIL_SALE",
        reference_code: `INV-${Date.now().toString().slice(-6)}`,
        usage_target: "National Data Corp",
        unit_cost: 3850.0,
      },
    });
    assert(stockOutRes.status === 201, "13. Stock Out (Dispatch + Sell) with Customer Name");

    // 11. Inventory Adjustment (Scrap / Damage) with Reason
    const adjRes = await request("/api/v1/stock/moves", {
      method: "POST",
      headers: tenantHeaders,
      body: {
        item_id: itemId,
        from_location_id: warehouseLoc.location_id,
        to_location_id: scrapLoc.location_id,
        quantity: 1,
        move_type: "INVENTORY_ADJUSTMENT",
        reference_code: `ADJ-${Date.now().toString().slice(-4)}`,
        usage_target: "Damaged during warehouse transit",
      },
    });
    assert(adjRes.status === 201, "14. Stock Adjustment (Damage / Scrap) with Audit Reason");

    // Verify Stock Moves Ledger contains all usage_target values
    const movesRes = await request("/api/v1/stock/moves?limit=10", { headers: tenantHeaders });
    assert(movesRes.status === 200 && Array.isArray(movesRes.data.data), "15. List Stock Movements Ledger");
    const targets = movesRes.data.data.map((m) => m.usage_target);
    assert(
      targets.includes("Dell Global Distribution Inc") &&
      targets.includes("National Data Corp") &&
      targets.includes("Damaged during warehouse transit"),
      "16. Movements Ledger preserved Supplier, Customer, and Adjustment Reason in PostgreSQL",
      `Recorded targets: ${targets.join(", ")}`
    );

    // 12. Create Staff User (Checking role parameter fix)
    const staffEmail = `staff-${Date.now()}@atlasdynamics.com`;
    const userRes = await request("/api/v1/users", {
      method: "POST",
      headers: tenantHeaders,
      body: {
        name: "Muhammad Ali",
        email: staffEmail,
        password: "StaffPassword123!",
        role: "staff",
      },
    });
    assert(
      userRes.status === 201 &&
      userRes.data.data?.name === "Muhammad Ali" &&
      (userRes.data.data?.role === "staff" || userRes.data.data?.role === "storekeeper"),
      "17. User Creation correctly stores Name and Role (No Parameter Swap Bug)"
    );
    const staffUserId = userRes.data.data.id;

    // 13. Asset Custody Checkout
    const checkoutRes = await request("/api/v1/assets/checkout", {
      method: "POST",
      headers: tenantHeaders,
      body: {
        asset_id: itemId,
        employee_user_id: staffUserId,
        source_location_id: warehouseLoc.location_id,
        condition_grade: "A+",
      },
    });
    assert(checkoutRes.status === 201 && checkoutRes.data.data?.assignment?.assignment_id, "18. Tool & Equipment Custody Checkout to Staff");
    const assignmentId = checkoutRes.data.data.assignment.assignment_id;

    // 14. Handover Certificate & SHA-256 Verification
    const certRes = await request(`/api/v1/assets/assignments/${assignmentId}/certificate`, {
      headers: tenantHeaders,
    });
    assert(
      certRes.status === 200 &&
      certRes.data.data?.is_valid === true &&
      certRes.data.data?.tamper_detected === false &&
      certRes.data.data?.computed_hash,
      "19. Cryptographic Handover Certificate SHA-256 Chain Verification (Zero Tamper)"
    );

    // 15. Asset Custody Checkin (Return)
    const checkinRes = await request("/api/v1/assets/checkin", {
      method: "POST",
      headers: tenantHeaders,
      body: {
        assignment_id: assignmentId,
        return_to_location_id: warehouseLoc.location_id,
        condition_grade: "A",
        notes: "Returned in perfect working condition",
      },
    });
    assert(checkinRes.status === 200 && checkinRes.data.data?.assignment?.returned_at, "20. Equipment Custody Checkin / Return to Warehouse");

    // 16. Verify Returned Assignment is accessible (Returned Filter Fix)
    const empCustodyRes = await request(`/api/v1/assets/custody/employee/${staffUserId}`, {
      headers: tenantHeaders,
    });
    assert(
      empCustodyRes.status === 200 &&
      empCustodyRes.data.data?.some((a) => a.assignment_id === assignmentId && a.returned_at),
      "21. Returned Custody Assignments preserved for History & Returned Tab Filter"
    );

    // 17. Delete Product with Movement References (Graceful Archiving Fix)
    const delRes = await request(`/api/v1/items/${itemId}`, {
      method: "DELETE",
      headers: tenantHeaders,
    });
    assert(
      delRes.status === 200 && delRes.data.data?.deleted === true && delRes.data.data?.archived === true,
      "22. Product with Transaction History is safely archived without Foreign Key Crash"
    );

    // ==================================================
    // 18. OFFICE IT LIFECYCLE E2E TESTS (Laptops, Mice, Employee ID + Signature, Vendor Repair, Finance Report)
    // ==================================================
    const laptopRes = await request("/api/v1/items", {
      method: "POST",
      headers: tenantHeaders,
      body: {
        sku: `LAP-${Date.now().toString().slice(-4)}`,
        name: "Dell Latitude 5440 Core i7 Laptop",
        base_uom: "pcs",
        cost_price: 1200.0,
        selling_price: 1200.0,
        reorder_level: 2,
        attributes: {
          category: "Laptops & Computers",
          Brand: "Dell",
          RAM: "16GB DDR5",
          Storage: "512GB NVMe SSD",
          warranty_expiry: "2029-12-31",
        },
      },
    });
    assert(laptopRes.status === 201 && laptopRes.data.data?.item_id, "23. Create Office IT Product (Dell Latitude 5440 Laptop)");
    const laptopId = laptopRes.data.data.item_id;

    // Purchase 10 Laptops into IT Store Room
    const laptopStockIn = await request("/api/v1/stock/moves", {
      method: "POST",
      headers: tenantHeaders,
      body: {
        item_id: laptopId,
        from_location_id: vendorLoc.location_id,
        to_location_id: warehouseLoc.location_id,
        quantity: 10,
        move_type: "INWARD_RECEIPT",
        reference_code: `PO-LAP-${Date.now().toString().slice(-4)}`,
        usage_target: "Dell Pakistan Official Partner",
        unit_cost: 1200.0,
      },
    });
    assert(laptopStockIn.status === 201, "24. Receive 10 Laptops into Office IT Store Room");

    // Issue Laptop #1 to Employee 1 with Employee ID & Online Digital Signature
    const sampleSignature = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
    const assign1 = await request("/api/v1/assets/checkout", {
      method: "POST",
      headers: tenantHeaders,
      body: {
        asset_id: laptopId,
        employee_user_id: staffUserId,
        source_location_id: warehouseLoc.location_id,
        quantity: 1,
        condition_grade: "A+",
        employee_code: "EMP-1024",
        employee_name: "Ahmed Raza",
        employee_department: "Software Engineering",
        employee_email: "ahmed.raza@company.com",
        serial_number: "DL-5440-SN001",
        signature_data: sampleSignature,
        notes: "Issued with original 65W Type-C charger",
      },
    });
    assert(
      assign1.status === 201 &&
      assign1.data.data?.assignment?.employee_code === "EMP-1024" &&
      assign1.data.data?.assignment?.signature_data === sampleSignature,
      "25. Assign Laptop #1 to Employee (EMP-1024) with Online Digital Signature"
    );

    // Issue Laptop #2 of the SAME product to Employee 2 concurrently (multi-unit assignment fix)
    const assign2 = await request("/api/v1/assets/checkout", {
      method: "POST",
      headers: tenantHeaders,
      body: {
        asset_id: laptopId,
        employee_user_id: staffUserId,
        source_location_id: warehouseLoc.location_id,
        quantity: 2,
        condition_grade: "A",
        employee_code: "EMP-1088",
        employee_name: "Sara Khan",
        employee_department: "Finance & Accounts",
        serial_number: "DL-5440-SN002, DL-5440-SN003",
        signature_data: sampleSignature,
        notes: "2 Laptops issued for Finance audit team",
      },
    });
    assert(
      assign2.status === 201 &&
      assign2.data.data?.assignment?.employee_code === "EMP-1088" &&
      assign2.data.data?.assignment?.quantity === 2,
      "26. Assign 2 more Laptops of same SKU to second Employee (EMP-1088) concurrently"
    );

    // Verify All Assignments List endpoint returns Employee ID & Signature
    const allAssignRes = await request("/api/v1/assets/assignments", { headers: tenantHeaders });
    assert(
      allAssignRes.status === 200 &&
      Array.isArray(allAssignRes.data.data) &&
      allAssignRes.data.data.some((a) => a.employee_code === "EMP-1024" && a.signature_data === sampleSignature),
      "27. List All Employee Assignments (/api/v1/assets/assignments) returns Employee ID & Signature"
    );

    // Log 1 Laptop as Faulty (Kharab) from IT Store Room
    const createRepairRes = await request("/api/v1/repairs", {
      method: "POST",
      headers: tenantHeaders,
      body: {
        item_id: laptopId,
        quantity: 1,
        serial_number: "DL-5440-SN009",
        issue_description: "Motherboard power IC failure & hinge issue",
        status: "FAULTY",
        source_location_id: warehouseLoc.location_id,
        reported_by_name: "IT Support Desk",
        reported_by_emp_code: "IT-01",
      },
    });
    assert(
      createRepairRes.status === 201 && createRepairRes.data.data?.repair_id && createRepairRes.data.data?.status === "FAULTY",
      "28. Log Faulty Office IT Equipment (Status: FAULTY, deducts 1 unit from Store)"
    );
    const repairId = createRepairRes.data.data.repair_id;

    // Send Faulty Laptop to External Vendor for Repair
    const sendVendorRes = await request(`/api/v1/repairs/${repairId}/send-vendor`, {
      method: "POST",
      headers: tenantHeaders,
      body: {
        vendor_name: "Dell Authorized Care Center Lahore",
        vendor_contact: "0300-1112233",
        vendor_ticket_no: "DELL-RMA-9981",
        expected_return_date: "2026-12-01",
      },
    });
    assert(
      sendVendorRes.status === 200 && sendVendorRes.data.data?.status === "AT_VENDOR",
      "29. Dispatch Faulty Laptop to Vendor for Repair (Status: AT_VENDOR)"
    );

    // Check 6-Bucket Catalog Counts while 7 in store, 3 assigned, 0 faulty, 1 in_repair
    const midItemCheck = await request(`/api/v1/items/${laptopId}`, { headers: tenantHeaders });
    assert(
      midItemCheck.status === 200 &&
      Number(midItemCheck.data.data?.total_on_hand) === 6 &&
      Number(midItemCheck.data.data?.assigned_count) === 3 &&
      Number(midItemCheck.data.data?.in_repair_count) === 1 &&
      Number(midItemCheck.data.data?.total_owned) === 10,
      "30. 6-Bucket Catalog Math Verified (10 Total = 6 In Store + 3 Assigned + 1 At Vendor)",
      JSON.stringify(midItemCheck.data.data)
    );

    // Receive Repaired Laptop back from Vendor into IT Store Room
    const completeRepairRes = await request(`/api/v1/repairs/${repairId}/complete`, {
      method: "POST",
      headers: tenantHeaders,
      body: {
        return_location_id: warehouseLoc.location_id,
        repair_cost: 85.0,
        resolution_notes: "Replaced power IC and hinges; tested OK",
      },
    });
    assert(
      completeRepairRes.status === 200 && completeRepairRes.data.data?.status === "REPAIRED",
      "31. Receive Repaired Laptop back from Vendor & Restore to IT Store Stock"
    );

    // Verify 6-Bucket Catalog Counts after repair return (7 In Store, 3 Assigned, 1 Repaired track record)
    const afterRepairCheck = await request(`/api/v1/items/${laptopId}`, { headers: tenantHeaders });
    assert(
      afterRepairCheck.status === 200 &&
      Number(afterRepairCheck.data.data?.total_on_hand) === 7 &&
      Number(afterRepairCheck.data.data?.assigned_count) === 3 &&
      Number(afterRepairCheck.data.data?.in_repair_count) === 0 &&
      Number(afterRepairCheck.data.data?.repaired_count) === 1 &&
      Number(afterRepairCheck.data.data?.total_owned) === 10,
      "32. Post-Repair 6-Bucket Math Verified (7 In Store + 3 Assigned = 10 Owned, 1 Repaired History)"
    );

    // Verify Finance Manager Report Data (/api/v1/reports/finance)
    const finReportRes = await request("/api/v1/reports/finance", { headers: tenantHeaders });
    assert(
      finReportRes.status === 200 &&
      Array.isArray(finReportRes.data.data?.items) &&
      Array.isArray(finReportRes.data.data?.custody_records) &&
      Array.isArray(finReportRes.data.data?.repair_records),
      "33. Generate Finance Manager Comprehensive Audit Report (/api/v1/reports/finance)"
    );

    // Verify Finance Manager Direct Email with CSV Attachment (/api/v1/reports/finance-email)
    const finEmailRes = await request("/api/v1/reports/finance-email", {
      method: "POST",
      headers: tenantHeaders,
      body: {
        recipient_email: "finance.manager@atlasdynamics.com",
        recipient_name: "Chief Finance Manager",
        subject: "Monthly Office IT Inventory & Asset Audit Report",
        message: "Please find attached the complete Office IT Inventory & Employee Handover report.",
      },
    });
    assert(
      finEmailRes.status === 200 && finEmailRes.data.data?.sent === true,
      "34. Email Finance Manager Report with Attached CSV via SMTP (/api/v1/reports/finance-email)"
    );

    console.log("==================================================");
    console.log(`TOTAL PASSED: ${passed} / ${passed + failed}`);
    if (failed === 0) {
      console.log("ALL FEATURES, BUTTONS, MODALS & FLOWS VERIFIED 100% WORKING!");
    } else {
      console.log(`FAILURES: ${failed}`);
    }
    console.log("==================================================");
  } catch (err) {
    console.error("Test execution aborted with error:", err);
  }
}

runAllTests();

