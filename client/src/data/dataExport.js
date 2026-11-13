import { supabase } from "../lib/supabase";
import { csvDate, csvDateTime, csvMoney, csvNumber } from "../lib/csv";
import { humanize } from "../lib/format";

const PAGE = 1000;
const COST_CHUNK = 500;

// Cost columns are not readable from the tables, so the export names its columns.
const PRODUCT_EXPORT_SELECT =
  "id, category_id, supplier_id, name, sku, barcode, unit, selling_price, quantity_on_hand, min_stock_level, is_active, created_at, deleted_at";
const SALE_EXPORT_SELECT =
  "id, sale_number, sold_at, customer_id, status, subtotal, discount_total, tax_total, total, amount_paid, balance_due, payment_method, voided_at, void_reason, notes";

async function pageOf(table, businessId, orders, page, size, columns) {
  const from = (page - 1) * size;
  let query = supabase
    .from(table)
    .select(columns, { count: "exact" })
    .eq("business_id", businessId);
  for (const [column, ascending] of orders)
    query = query.order(column, { ascending });
  const { data, count, error } = await query
    .order("id")
    .range(from, from + size - 1);
  return { rows: data ?? [], total: count ?? 0, error: error?.message ?? "" };
}

async function nameMap(table, businessId) {
  const map = {};
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from(table)
      .select("id, name")
      .eq("business_id", businessId)
      .order("id")
      .range(from, from + PAGE - 1);
    if (error) return { map, error: error.message };
    for (const r of data ?? []) map[r.id] = r.name;
    if ((data ?? []).length < PAGE) break;
  }
  return { map, error: "" };
}

// Costs come from a finance-only function, in chunks. { map: id -> cost }.
async function loadCosts(cost, businessId, ids) {
  const map = {};
  for (let i = 0; i < ids.length; i += COST_CHUNK) {
    const { data, error } = await supabase.rpc(cost.rpc, {
      p_business_id: businessId,
      [cost.idsArg]: ids.slice(i, i + COST_CHUNK),
    });
    if (error) return { map, error: error.message };
    for (const r of data ?? []) map[r[cost.idKey]] = r[cost.valueKey];
  }
  return { map, error: "" };
}

// Returns (businessId, { withCost }) => fetchPage(page, size) for ExportButton.
// The name lookups load once per export. withCost adds the cost field to each row and must only be true for people with finance.view.
function makeSource(table, orders, lookups, options = {}) {
  const { columns = "*", cost = null } = options;
  return (businessId, { withCost = false } = {}) => {
    let maps = null;
    return async (page, size) => {
      if (!maps) {
        const loaded = {};
        for (const l of lookups) {
          const res = await nameMap(l.table, businessId);
          if (res.error) return { rows: [], total: 0, error: res.error };
          loaded[l.out] = { idField: l.idField, map: res.map };
        }
        maps = loaded;
      }
      const res = await pageOf(table, businessId, orders, page, size, columns);
      if (res.error) return res;

      let costMap = null;
      if (cost && withCost) {
        const c = await loadCosts(
          cost,
          businessId,
          res.rows.map((r) => r.id),
        );
        if (c.error) return { rows: [], total: 0, error: c.error };
        costMap = c.map;
      }

      return {
        ...res,
        rows: res.rows.map((r) => {
          const row = { ...r };
          for (const [out, { idField, map }] of Object.entries(maps))
            row[out] = map[r[idField]] ?? "";
          if (costMap) row[cost.out] = costMap[r.id] ?? null;
          return row;
        }),
      };
    };
  };
}

export const productsSource = makeSource(
  "products",
  [["name", true]],
  [
    { out: "category_name", idField: "category_id", table: "categories" },
    { out: "supplier_name", idField: "supplier_id", table: "suppliers" },
  ],
  {
    columns: PRODUCT_EXPORT_SELECT,
    cost: {
      rpc: "get_product_costs",
      idsArg: "p_product_ids",
      idKey: "product_id",
      valueKey: "cost_price",
      out: "cost_price",
    },
  },
);
export const customersSource = makeSource("customers", [["name", true]], []);
export const salesSource = makeSource(
  "sales",
  [["sold_at", false]],
  [{ out: "customer_name", idField: "customer_id", table: "customers" }],
  {
    columns: SALE_EXPORT_SELECT,
    cost: {
      rpc: "get_sale_costs",
      idsArg: "p_sale_ids",
      idKey: "sale_id",
      valueKey: "cost_total",
      out: "cost_total",
    },
  },
);
export const expensesSource = makeSource(
  "expenses",
  [["expense_date", false]],
  [
    {
      out: "category_name",
      idField: "category_id",
      table: "expense_categories",
    },
  ],
);

// Excel turns long digit-only text (phones, barcodes) into numbers and drops leading
// zeros, so a space after the first four digits keeps it as text.
function excelText(value) {
  if (value === null || value === undefined) return "";
  const text = String(value).trim();
  return /^\+?\d{8,}$/.test(text)
    ? text.replace(/^(\+?\d{4})(\d+)$/, "$1 $2")
    : text;
}

const label = (value) => (value ? humanize(value) : "");

const PRODUCT_BEFORE_COST = [
  { header: "Name", value: (r) => r.name },
  { header: "SKU", value: (r) => excelText(r.sku) },
  { header: "Barcode", value: (r) => excelText(r.barcode) },
  { header: "Category", value: (r) => r.category_name },
  { header: "Supplier", value: (r) => r.supplier_name },
  { header: "Unit", value: (r) => r.unit },
];
const PRODUCT_COST_COLUMN = {
  header: "Cost price",
  value: (r) => csvMoney(r.cost_price),
};
const PRODUCT_AFTER_COST = [
  { header: "Selling price", value: (r) => csvMoney(r.selling_price) },
  { header: "In stock", value: (r) => csvNumber(r.quantity_on_hand) },
  { header: "Minimum stock", value: (r) => csvNumber(r.min_stock_level) },
  {
    header: "Status",
    value: (r) =>
      r.deleted_at ? "Removed" : r.is_active ? "Active" : "Inactive",
  },
  { header: "Date added", value: (r) => csvDate(r.created_at) },
];

// No cost column. Use productColumns(true) together with productsSource(id, { withCost: true }) for finance users.
export const PRODUCT_COLUMNS = [...PRODUCT_BEFORE_COST, ...PRODUCT_AFTER_COST];
export const productColumns = (canSeeCost) =>
  canSeeCost
    ? [...PRODUCT_BEFORE_COST, PRODUCT_COST_COLUMN, ...PRODUCT_AFTER_COST]
    : PRODUCT_COLUMNS;

export const CUSTOMER_COLUMNS = [
  { header: "Name", value: (r) => r.name },
  { header: "Phone", value: (r) => excelText(r.phone) },
  { header: "Email", value: (r) => r.email },
  { header: "Address", value: (r) => r.address },
  { header: "Discount %", value: (r) => csvNumber(r.discount_percent) },
  { header: "Balance", value: (r) => csvMoney(r.balance) },
  { header: "Orders", value: (r) => r.total_orders },
  { header: "Total spent", value: (r) => csvMoney(r.total_spent) },
  { header: "Last purchase", value: (r) => csvDate(r.last_purchase_at) },
  { header: "Status", value: (r) => (r.is_active ? "Active" : "Inactive") },
  { header: "Date joined", value: (r) => csvDate(r.created_at) },
];

const SALE_BEFORE_COST = [
  { header: "Sale number", value: (r) => r.sale_number },
  { header: "Date", value: (r) => csvDateTime(r.sold_at) },
  { header: "Customer", value: (r) => r.customer_name || "Walk-in customer" },
  { header: "Status", value: (r) => label(r.status) },
  { header: "Subtotal", value: (r) => csvMoney(r.subtotal) },
  { header: "Discount", value: (r) => csvMoney(r.discount_total) },
  { header: "Tax", value: (r) => csvMoney(r.tax_total) },
  { header: "Total", value: (r) => csvMoney(r.total) },
  { header: "Amount paid", value: (r) => csvMoney(r.amount_paid) },
  { header: "Balance due", value: (r) => csvMoney(r.balance_due) },
  { header: "Payment method", value: (r) => label(r.payment_method) },
];
const SALE_COST_COLUMN = {
  header: "Cost of goods",
  value: (r) => csvMoney(r.cost_total),
};
const SALE_AFTER_COST = [
  { header: "Voided on", value: (r) => csvDateTime(r.voided_at) },
  { header: "Void reason", value: (r) => r.void_reason },
  { header: "Notes", value: (r) => r.notes },
];

// No cost column. Use saleColumns(true) together with salesSource(id, { withCost: true }) for finance users.
export const SALE_COLUMNS = [...SALE_BEFORE_COST, ...SALE_AFTER_COST];
export const saleColumns = (canSeeCost) =>
  canSeeCost
    ? [...SALE_BEFORE_COST, SALE_COST_COLUMN, ...SALE_AFTER_COST]
    : SALE_COLUMNS;

export const EXPENSE_COLUMNS = [
  { header: "Date", value: (r) => csvDate(r.expense_date) },
  { header: "Category", value: (r) => r.category_name },
  { header: "Description", value: (r) => r.description },
  { header: "Vendor", value: (r) => r.vendor },
  { header: "Amount", value: (r) => csvMoney(r.amount) },
  { header: "Payment method", value: (r) => label(r.payment_method) },
  { header: "Status", value: (r) => (r.voided_at ? "Voided" : "Active") },
  { header: "Void reason", value: (r) => r.void_reason },
  { header: "Recorded on", value: (r) => csvDate(r.created_at) },
];
