export const ROLE_LABELS = {
  owner: "Owner",
  admin: "Admin",
  manager: "Manager",
  staff: "Staff",
};

// Admins can never lose these two (the server enforces it too).
export const LOCKED_ADMIN_PERMISSIONS = ["staff.manage", "settings.manage"];

export const INVITE_EXPIRY = [
  { days: 1, label: "1 day" },
  { days: 7, label: "7 days" },
  { days: 30, label: "30 days" },
];

// The owner can use every role; an admin can only manage managers and staff.
export const assignableRoles = (isOwner) =>
  isOwner ? ["admin", "manager", "staff"] : ["manager", "staff"];

export const PERMISSION_GROUPS = [
  {
    title: "Products and stock",
    items: [
      {
        key: "products.write",
        label: "Manage products",
        description: "Add and edit products, prices and categories.",
      },
      {
        key: "inventory.adjust",
        label: "Adjust stock",
        description: "Count stock, record damage and correct quantities.",
      },
      {
        key: "suppliers.manage",
        label: "Manage suppliers",
        description: "Add and edit suppliers.",
      },
      {
        key: "purchases.manage",
        label: "Purchase orders",
        description: "Create purchase orders and receive stock.",
      },
      {
        key: "import.run",
        label: "Import products",
        description: "Upload a CSV file to add or update products.",
      },
    ],
  },
  {
    title: "Sales and customers",
    items: [
      {
        key: "sales.create",
        label: "Record sales",
        description: "Create new sales and take payments.",
      },
      {
        key: "sales.return",
        label: "Take returns",
        description: "Take goods back from a sale and refund them.",
      },
      {
        key: "sales.void",
        label: "Void sales",
        description: "Cancel a sale that was made by mistake.",
      },
      {
        key: "discounts.manage",
        label: "Discounts",
        description: "Create promo codes and give manual discounts.",
      },
      {
        key: "customers.write",
        label: "Manage customers",
        description: "Add and edit customers and record their payments.",
      },
      {
        key: "customers.adjust",
        label: "Adjust balances",
        description: "Correct what a customer owes, with a reason.",
      },
    ],
  },
  {
    title: "Money and reports",
    items: [
      {
        key: "expenses.manage",
        label: "Manage expenses",
        description: "Record, edit and void expenses and categories.",
      },
      {
        key: "finance.view",
        label: "See profit and costs",
        description: "View costs, profit and the expenses pages.",
      },
      {
        key: "reports.view",
        label: "Reports and exports",
        description: "Open Reports and export data to CSV.",
      },
    ],
  },
  {
    title: "Team and business",
    items: [
      {
        key: "staff.manage",
        label: "Manage staff",
        description: "Invite people, change roles and suspend access.",
      },
      {
        key: "settings.manage",
        label: "Manage settings",
        description: "Change the business profile and settings.",
      },
      {
        key: "audit.view",
        label: "View activity log",
        description: "See who did what in the business.",
      },
      {
        key: "backups.manage",
        label: "Manage backups",
        description: "Create and restore backups.",
      },
    ],
  },
];
