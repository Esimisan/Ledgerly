import {
  Receipt,
  Package,
  Wallet,
  Users,
  TrendingUp,
  Settings,
} from "lucide-react";

export const NAV_LINKS = [
  { id: "features", label: "Features" },
  { id: "benefits", label: "Why Ledgerly" },
  { id: "how-it-works", label: "How it works" },
  { id: "faq", label: "FAQ" },
];

export const PROBLEMS = [
  {
    title: "Sales and expenses live in different places",
    text: "A notebook for sales, a phone note for expenses, and no clear picture of what is left.",
  },
  {
    title: "Nobody is sure what is in stock",
    text: "Stock counts drift from reality, and you find out when a customer asks for something you no longer have.",
  },
  {
    title: "Performance is hard to see",
    text: "Revenue, costs and profit are scattered, so a simple question like “how was this month?” takes an afternoon.",
  },
  {
    title: "Customer and supplier details are scattered",
    text: "Phone numbers, balances and orders sit in chats, books and memory.",
  },
  {
    title: "It is unclear which products really pay off",
    text: "Without costs next to prices, the best sellers and the best earners can be different products.",
  },
  {
    title: "Too much time goes into manual record keeping",
    text: "Copying figures between books and spreadsheets takes time you would rather spend on the business.",
  },
];

export const FEATURE_GROUPS = [
  {
    icon: Receipt,
    title: "Sales",
    items: [
      "Record sales with several items at a time",
      "Split a payment and track what is still owed",
      "Apply discounts and promo codes",
      "Review sales history and print receipts",
      "Void a sale or return items",
    ],
  },
  {
    icon: Package,
    title: "Inventory",
    items: [
      "Products with categories, images, SKU and barcode",
      "Live stock quantities with low-stock levels",
      "Stock movements: purchases, damage, removals and adjustments",
      "Suppliers and purchase orders",
      "Bulk product import from a spreadsheet",
    ],
  },
  {
    icon: Wallet,
    title: "Expenses",
    items: [
      "Record expenses with vendor and payment method",
      "Organize them in your own categories",
      "Attach a receipt to an expense",
      "Review expense history and monthly totals",
    ],
  },
  {
    icon: Users,
    title: "Customers and suppliers",
    items: [
      "Customer records with contact details and history",
      "See what each customer owes and record their payments",
      "Set a discount level per customer",
      "Supplier records linked to your products and orders",
    ],
  },
  {
    icon: TrendingUp,
    title: "Reports and analytics",
    items: [
      "Overview dashboard for the period you choose",
      "Revenue, gross profit, margin and net profit",
      "Product performance and stock health",
      "Sales, profit and loss, expenses, inventory and customer balance reports",
      "Export reports as CSV or print them to PDF",
    ],
  },
  {
    icon: Settings,
    title: "Team and settings",
    items: [
      "Invite staff and choose what each role can do",
      "Keep cost and profit figures for the people you choose",
      "Audit log of changes, backups and CSV downloads",
      "Manage more than one business from one login",
      "Light and dark themes, plus a built-in guide",
    ],
  },
];

export const BENEFITS = [
  {
    title: "One place for your records",
    text: "Sales, stock, expenses, customers and suppliers sit together instead of in separate books.",
  },
  {
    title: "A clearer view of each day",
    text: "See what was sold, what was spent and what is owed without adding anything up by hand.",
  },
  {
    title: "Organized business records",
    text: "Every sale, payment and stock change is recorded, so you can look back at what happened.",
  },
  {
    title: "Sales and expenses side by side",
    text: "Revenue, costs and profit are shown together, so the month’s result is easy to read.",
  },
  {
    title: "Better stock oversight",
    text: "Quantities, low-stock levels and stock movements are visible before an item runs out.",
  },
  {
    title: "Information for better decisions",
    text: "Reports and analytics show which products and customers matter most.",
  },
];

export const STEPS = [
  {
    n: "01",
    title: "Create your account",
    text: "Sign up, then set up your business with its name, currency and time zone.",
  },
  {
    n: "02",
    title: "Organize your operations",
    text: "Add products, categories, customers and suppliers, and invite your team if you have one.",
  },
  {
    n: "03",
    title: "Manage and understand your business",
    text: "Record sales, track stock, log expenses and use reports to see how the business is doing.",
  },
];

export const FAQS = [
  {
    q: "What is Ledgerly?",
    a: "Ledgerly is a web app for managing a small business. It brings sales, inventory, expenses, customers, suppliers and reports together in one place.",
  },
  {
    q: "Who is Ledgerly designed for?",
    a: "Small businesses that sell products and want their sales, stock and expenses in one system instead of several books or spreadsheets.",
  },
  {
    q: "Can I manage inventory and sales together?",
    a: "Yes. Products, stock quantities, stock movements and sales live in the same app, so your stock figures follow what you record.",
  },
  {
    q: "Can multiple employees access a business?",
    a: "Yes. The owner creates an invitation link and shares it. Each person signs in with their own account, and the owner can suspend someone’s access at any time.",
  },
  {
    q: "Can different employees have different permissions?",
    a: "Yes. Each role has its own set of permissions that the owner can adjust, for example who can see costs and profit, create sales or manage staff.",
  },
  {
    q: "Can I manage more than one business?",
    a: "Yes. You can create more than one business and switch between them from the sidebar. Each business keeps its own records.",
  },
  {
    q: "Can I export my business reports?",
    a: "Yes. Reports can be exported as CSV or printed and saved as PDF, and you can download your main records as CSV files from the backups and exports page.",
  },
  {
    q: "How do I get started?",
    a: "Create an account, set up your business, and start adding products. The built-in guide explains each page the first time you open it.",
  },
];
