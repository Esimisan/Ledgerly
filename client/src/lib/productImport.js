import { csvMoney, csvNumber, parseCsv, toCsv } from "./csv.js";

export const MAX_FILE_BYTES = 2 * 1024 * 1024;
export const MAX_IMPORT_ROWS = 2000;

// The columns of the template, in order. These exact names are also what a CSV export writes, so "download current products, edit, upload again" works.
export const IMPORT_FIELDS = [
  "name",
  "sku",
  "barcode",
  "category",
  "supplier",
  "unit",
  "cost_price",
  "selling_price",
  "opening_stock",
  "min_stock_level",
  "description",
];

// Header names people actually use, compared without case, spaces or punctuation.
const ALIASES = {
  name: ["name", "product", "productname", "item", "itemname"],
  sku: ["sku", "code", "productcode", "itemcode"],
  barcode: ["barcode", "upc", "ean"],
  category: ["category", "productcategory"],
  supplier: ["supplier", "vendor"],
  unit: ["unit", "uom", "unitofmeasure"],
  cost_price: ["costprice", "cost", "purchaseprice", "buyingprice"],
  selling_price: ["sellingprice", "price", "saleprice", "retailprice"],
  opening_stock: [
    "openingstock",
    "stock",
    "quantity",
    "qty",
    "stockonhand",
    "quantityonhand",
  ],
  min_stock_level: [
    "minstocklevel",
    "minstock",
    "minimumstock",
    "reorderlevel",
    "lowstocklevel",
  ],
  description: ["description", "details", "notes"],
};
const LOOKUP = new Map(
  Object.entries(ALIASES).flatMap(([field, names]) =>
    names.map((n) => [n, field]),
  ),
);
const normalize = (h) =>
  String(h ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

// text -> { rows: [{ name, sku, ... }] (raw cell text), ignored: [column names we skip], error }
export function parseProductFile(text) {
  const parsed = parseCsv(text);
  if (parsed.error) return { error: parsed.error };
  if (parsed.rows.length < 2) {
    return {
      error: "The file needs a header row and at least one product row.",
    };
  }

  const [header, ...body] = parsed.rows;
  const fieldAt = [];
  const seen = new Set();
  const ignored = [];
  header.forEach((h, i) => {
    const field = LOOKUP.get(normalize(h));
    if (field && !seen.has(field)) {
      seen.add(field);
      fieldAt[i] = field;
    } else if (String(h).trim() !== "") {
      ignored.push(String(h).trim());
    }
  });

  if (!seen.has("name")) {
    return {
      error:
        'Your file needs a "name" column. Download the template to see the columns.',
    };
  }
  if (body.length > MAX_IMPORT_ROWS) {
    return {
      error: `This file has ${body.length.toLocaleString("en")} products. An import can have at most ${MAX_IMPORT_ROWS.toLocaleString("en")}. Split the file and import it in parts.`,
    };
  }

  const rows = body.map((cells) => {
    const row = {};
    fieldAt.forEach((field, i) => {
      row[field] = cells[i] ?? "";
    });
    return row;
  });
  return { rows, ignored, columns: [...seen] };
}

const SAMPLE_ROWS = [
  {
    name: "Cotton T-shirt",
    sku: "TS-001",
    barcode: "",
    category: "Clothing",
    supplier: "ABC Textiles",
    unit: "pcs",
    cost_price: "2500",
    selling_price: "4500",
    opening_stock: "40",
    min_stock_level: "10",
    description: "Plain white cotton tee",
  },
  {
    name: "Canvas Tote",
    sku: "BG-014",
    barcode: "",
    category: "Bags",
    supplier: "",
    unit: "pcs",
    cost_price: "1800",
    selling_price: "3200",
    opening_stock: "25",
    min_stock_level: "5",
    description: "",
  },
];

export function templateCsv() {
  return toCsv(
    IMPORT_FIELDS.map((f) => ({ header: f, value: (r) => r[f] })),
    SAMPLE_ROWS,
  );
}

// Columns for "Download current products". opening_stock is left blank: stock of an existing product cannot be changed by an import (use a stock adjustment). Cost is only filled for people who can see finance.
export function productExportColumns(canSeeCost) {
  return [
    { header: "name", value: (r) => r.name },
    { header: "sku", value: (r) => r.sku },
    { header: "barcode", value: (r) => r.barcode },
    { header: "category", value: (r) => r.category },
    { header: "supplier", value: (r) => r.supplier },
    { header: "unit", value: (r) => r.unit },
    {
      header: "cost_price",
      value: (r) => (canSeeCost ? csvMoney(r.cost_price) : ""),
    },
    { header: "selling_price", value: (r) => csvMoney(r.selling_price) },
    { header: "opening_stock", value: () => "" },
    { header: "min_stock_level", value: (r) => csvNumber(r.min_stock_level) },
    { header: "description", value: (r) => r.description },
  ];
}
