import {
  LayoutDashboard,
  Package,
  Archive,
  Receipt,
  Users,
  Wallet,
  TrendingUp,
  Settings,
} from "lucide-react";

export const MAIN_NAV = [
  { to: "/", label: "Overview", icon: LayoutDashboard },
  { to: "/products", label: "Products", icon: Package },
  {
    to: "/inventory",
    label: "Inventory",
    icon: Archive,
    children: [
      { to: "/inventory/suppliers", label: "Suppliers" },
      {
        to: "/inventory/purchase-orders",
        label: "Purchase orders",
        permission: "purchases.manage",
      },
    ],
  },
  { to: "/sales", label: "Sales", icon: Receipt },
  { to: "/customers", label: "Customers", icon: Users },
  {
    to: "/expenses",
    label: "Expenses",
    icon: Wallet,
    permission: "finance.view",
  },
  {
    to: "/analytics",
    label: "Analytics",
    icon: TrendingUp,
    children: [
      {
        to: "/analytics/reports",
        label: "Reports",
        permission: "reports.view",
      },
    ],
  },
];

export const SETTINGS_NAV = {
  to: "/settings",
  label: "Settings",
  icon: Settings,
  children: [
    { to: "/settings/staff", label: "Staff", permission: "staff.manage" },
    { to: "/settings/audit-log", label: "Audit log", permission: "audit.view" },
  ],
};
