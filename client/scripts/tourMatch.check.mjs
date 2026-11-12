import { TOUR_ROUTES } from "../src/config/tourRoutes.js";
import { TOURS } from "../src/config/tours.js";
import { matchTourKey, visibleSteps } from "../src/lib/tourMatch.js";

let failures = 0;
function expect(label, got, want) {
  if (got !== want) {
    failures += 1;
    console.error(`FAIL ${label}: got ${got}, want ${want}`);
  }
}

const ID = "3f2b8c1e-0000-4000-8000-000000000000";
const cases = [
  ["/", "overview"],
  ["/products", "products"],
  ["/products/new", "product-form"],
  ["/products/import", "import-products"],
  [`/products/${ID}/edit`, "product-form"],
  ["/products/abc", null],
  ["/inventory", "inventory"],
  ["/inventory/suppliers", "suppliers"],
  ["/inventory/purchase-orders", "purchase-orders"],
  ["/inventory/purchase-orders/new", "new-purchase-order"],
  [`/inventory/purchase-orders/${ID}`, "purchase-order-detail"],
  [`/inventory/purchase-orders/${ID}/edit`, "new-purchase-order"],
  ["/sales", "sales"],
  ["/sales/", "sales"],
  ["/sales/new", "new-sale"],
  ["/sales/discounts", "discounts"],
  [`/sales/${ID}`, "sale-detail"],
  ["/customers", "customers"],
  [`/customers/${ID}`, "customer-profile"],
  ["/expenses", "expenses"],
  ["/expenses/categories", "expense-categories"],
  ["/analytics", "analytics"],
  ["/analytics/reports", "reports"],
  ["/settings", "settings"],
  ["/settings/staff", "staff"],
  ["/settings/audit-log", "audit-log"],
  ["/settings/backups", "backups"],
  ["/guide", null],
  ["/login", null],
  ["/onboarding", null],
  ["/accept-invite", null],
];
for (const [path, want] of cases) {
  expect(`route ${path}`, matchTourKey(path, TOUR_ROUTES), want);
}

for (const r of TOUR_ROUTES) {
  expect(`tour exists for key ${r.key}`, Boolean(TOURS[r.key]), true);
}
for (const [key, tour] of Object.entries(TOURS)) {
  const n = tour.steps?.length ?? 0;
  expect(`${key}: 2-4 steps`, n >= 2 && n <= 4, true);
  for (const s of tour.steps) {
    expect(`${key}: step has title and text`, Boolean(s.title && s.text), true);
  }
}

const none = () => false;
const all = () => true;
expect(
  "staff tour hidden without permission",
  visibleSteps(TOURS.staff, none).length,
  0,
);
expect(
  "staff tour full with permission",
  visibleSteps(TOURS.staff, all).length,
  TOURS.staff.steps.length,
);
expect(
  "settings: only ungated steps without permission",
  visibleSteps(TOURS.settings, none).length,
  2,
);

if (failures) {
  console.error(`${failures} failure(s)`);
  process.exitCode = 1;
} else {
  console.log("tourMatch check: 0 failure(s)");
}
