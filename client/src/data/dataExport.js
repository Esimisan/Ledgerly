import { supabase } from "../lib/supabase";
import { csvDate, csvDateTime, csvMoney, csvNumber } from "../lib/csv";
import { humanize } from "../lib/format";

const PAGE = 1000;

async function pageOf(table, businessId, orders, page, size) {
  const from = (page - 1) * size;
  let query = supabase
    .from(table)
    .select("*", { count: "exact" })
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

// Returns a fetchPage(page, size) for ExportButton. The name lookups load once per export.
function makeSource(table, orders, lookups) {
  return (businessId) => {
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
      const res = await pageOf(table, businessId, orders, page, size);
      if (res.error) return res;
      return {
        ...res,
        rows: res.rows.map((r) => {
          const row = { ...r };
          for (const [out, { idField, map }] of Object.entries(maps))
            row[out] = map[r[idField]] ?? "";
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
);
export const customersSource = makeSource("customers", [["name", true]], []);
export const salesSource = makeSource(
  "sales",
  [["sold_at", false]],
  [{ out: "customer_name", idField: "customer_id", table: "customers" }],
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

export const PRODUCT_COLUMNS = [
  { header: "Name", value: (r) => r.name },
  { header: "SKU", value: (r) => excelText(r.sku) },
  { header: "Barcode", value: (r) => excelText(r.barcode) },
  { header: "Category", value: (r) => r.category_name },
  { header: "Supplier", value: (r) => r.supplier_name },
  { header: "Unit", value: (r) => r.unit },
  { header: "Cost price", value: (r) => csvMoney(r.cost_price) },
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

export const SALE_COLUMNS = [
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
  { header: "Cost of goods", value: (r) => csvMoney(r.cost_total) },
  { header: "Voided on", value: (r) => csvDateTime(r.voided_at) },
  { header: "Void reason", value: (r) => r.void_reason },
  { header: "Notes", value: (r) => r.notes },
];

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
