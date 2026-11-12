// Which tutorial belongs to which page. First match wins, so fixed paths (sales/new) come before dynamic ones (sales/:saleId).
export const TOUR_ROUTES = [
  { pattern: "/", key: "overview" },

  { pattern: "/products", key: "products" },
  { pattern: "/products/new", key: "product-form" },
  { pattern: "/products/import", key: "import-products" },
  { pattern: "/products/:productId/edit", key: "product-form" },

  { pattern: "/inventory", key: "inventory" },
  { pattern: "/inventory/suppliers", key: "suppliers" },
  { pattern: "/inventory/purchase-orders", key: "purchase-orders" },
  { pattern: "/inventory/purchase-orders/new", key: "new-purchase-order" },
  { pattern: "/inventory/purchase-orders/:poId", key: "purchase-order-detail" },
  {
    pattern: "/inventory/purchase-orders/:poId/edit",
    key: "new-purchase-order",
  },

  { pattern: "/sales", key: "sales" },
  { pattern: "/sales/new", key: "new-sale" },
  { pattern: "/sales/discounts", key: "discounts" },
  { pattern: "/sales/:saleId", key: "sale-detail" },

  { pattern: "/customers", key: "customers" },
  { pattern: "/customers/:customerId", key: "customer-profile" },

  { pattern: "/expenses", key: "expenses" },
  { pattern: "/expenses/categories", key: "expense-categories" },

  { pattern: "/analytics", key: "analytics" },
  { pattern: "/analytics/reports", key: "reports" },

  { pattern: "/settings", key: "settings" },
  { pattern: "/settings/staff", key: "staff" },
  { pattern: "/settings/audit-log", key: "audit-log" },
  { pattern: "/settings/backups", key: "backups" },
];
