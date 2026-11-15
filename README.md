# Ledgerly

**Ledgerly** is a business-management web app for small businesses. It brings products, inventory, sales, customers, expenses, purchase orders, analytics and reports into one place, with a clean card-based interface in light and dark mode.

**Live app:** https://ledgerly-gules-one.vercel.app

---

## Table of contents

1. [Features](#features)
2. [Tech stack](#tech-stack)
3. [Project structure](#project-structure)
4. [Architecture and design rules](#architecture-and-design-rules)
5. [Security model](#security-model)
6. [Roles and permissions](#roles-and-permissions)
7. [Database overview](#database-overview)
8. [Getting started](#getting-started)
9. [Environment variables](#environment-variables)
10. [Scripts](#scripts)
11. [Database migrations](#database-migrations)
12. [Testing](#testing)
13. [Deployment](#deployment)
14. [Known limitations](#known-limitations)
15. [Roadmap](#roadmap)

---

## Features

**Products and categories**
- Products with SKU, barcode, unit, cost and selling price, minimum stock level and an image (private Storage bucket)
- Categories, bulk product import and CSV/Excel-friendly export
- Only the business owner can delete a product. An unused product is erased permanently. A product with history is removed from the catalogue going forward while its past records are kept

**Inventory and suppliers**
- Every stock change is recorded as a stock movement: opening stock, purchase, sale, sale return, damage, removal or adjustment
- Stock quantities cannot be edited directly by the client, only through database functions
- Suppliers are deactivate-only, never deleted

**Sales**
- Point-of-sale till with server-side pricing (`quote_sale` / `create_sale`)
- Discounts do not stack: the larger of the customer's discount and a valid promo wins. Manual discounts need the `discounts.manage` permission
- Split payments. An unpaid remainder becomes a credit sale (customer required)
- Void sales, returns and printable receipts (via the browser, with the business logo)

**Customers (CRM)**
- Customer profiles with a full transaction ledger and stats
- Credit and debt tracking, with "Record payment" and manual balance adjustments
- Customers are deactivate-only. Phone and email are unique per business

**Expenses and finances**
- Expense categories, vendors, payment methods and receipt uploads
- Monthly summaries with a month picker

**Purchase orders**
- Create, receive, pay and cancel purchase orders, with supplier payments and adjustments

**Analytics and reports**
- Overview dashboard and an `/analytics` page: today's performance, financial overview, performance over time, product analytics (including stock health) and customer analytics
- Analytics are powered by SQL views and functions
- Date ranges, search, filter, sort and export on report pages

**Team and business management**
- Staff invitations (shareable invite link), custom role permissions and ownership transfer
- Audit log, settings and JSON/CSV backups
- Multi-business support: one user can belong to several businesses, with a sidebar switcher and strict data isolation. Each browser tab has its own active business

**Experience**
- Light, dark and system themes, applied before first paint (no flash)
- Responsive layout built with `rem`/`em`
- Guided tours on first visit to each page, plus a Guide page under Settings
- Landing page and favicon

---

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | React 19, Vite 8, react-router-dom 7 (JavaScript) |
| Backend | Supabase (PostgreSQL, Auth, Storage, Row Level Security) |
| Complex logic | PostgreSQL functions (RPCs) and SQL views |
| Hosting | Vercel (free tier) |
| Source control | GitHub |

There is no custom Express/Node server. The frontend talks directly to Supabase, and security is enforced in the database.

---

## Project structure

```
Ledgerly/
├── client/          # React + Vite frontend (Vercel root directory)
│   ├── public/      # Favicon package and static assets
│   ├── src/         # Pages, components, contexts, data layer, config (tours.js)
│   └── vercel.json  # SPA rewrite
├── supabase/        # Supabase CLI project
│   └── migrations/  # All schema, RLS, functions and views
└── tests/           # SQL test files (owner, staff/manager, outsider, anon)
```

---

## Architecture and design rules

- **Multi-tenant by design.** Every business table has a `business_id`. Access is checked through `business_members`.
- **Money:** `numeric(14,2)`. Each business has its own currency (default NGN, ₦). Prices are copied onto sale items so past sales never change.
- **Multi-table operations** (sales, returns, voids, payments, imports) run inside PostgreSQL functions so they succeed or fail as one unit.
- **Analytics** are SQL views created with `security_invoker = true`, so they respect the caller's RLS.
- **Lists are paginated.**
- **Theming:** all colours are CSS variables defined once for light and once for dark, with no hard-coded colours in components. Run `npm run check:colors` to enforce this.
- **Grid layouts** use `grid-template-columns: minmax(0, 1fr)` so content never forces horizontal overflow on phones.

---

## Security model

- Only the Supabase **publishable (anon) key** is used in the frontend. No service-role key is ever shipped.
- **RLS is enabled on every table.** Explicit grants go to `authenticated` only, never `anon`, and are created in the same migration as each table.
- Permission helper functions: `is_member`, `has_role`, `has_permission`, `my_business_ids`.
- **Cost fields are protected:** `products.cost_price`, `sales.cost_total`, `sale_items.unit_cost` and `stock_movements.unit_cost` are not readable from tables. Views return them only to users with `finance.view`, and RPCs feed the CSV exports.
- Private Storage buckets (`product-images`, `expense-receipts`) with policies scoped to the business.
- Supabase advisors report 0 errors.

---

## Roles and permissions

Roles are configurable per business through role permissions (for example `discounts.manage`, `finance.view`, `backups.manage`). The owner can invite staff, adjust what each role can do, and transfer ownership. Owner-only actions (such as deleting a product) cannot be removed from the owner.

---

## Database overview

About 28 core tables, covering:

- **Tenancy and access:** profiles, businesses, business_members, role_permissions, business_invitations
- **Catalogue and stock:** categories, products, suppliers, stock_movements
- **Sales:** sales, sale_items, sale_payments, discounts, returns
- **Customers:** customers, customer_transactions (ledger)
- **Money out:** expense_categories, expenses, purchase orders and payments
- **Operations:** audit_log, backups, tour_progress

Stock levels, balances and customer stats are maintained by triggers and RPCs, not by direct client writes.

---

## Getting started

### Prerequisites
- Node.js (current LTS)
- A free [Supabase](https://supabase.com) project
- Supabase CLI (used via `npx supabase`)

### Setup

```bash
# 1. Clone
git clone https://github.com/Esimisan/Ledgerly.git
cd Ledgerly

# 2. Link your Supabase project and apply the schema
npx supabase login
npx supabase link --project-ref <your-project-ref>
npx supabase db push --linked

# 3. Run the frontend
cd client
npm install
cp .env.example .env   # or create .env manually (see below)
npm run dev
```

During development, turn **Confirm email OFF** in Supabase Auth to avoid email rate limits.

---

## Environment variables

Create `client/.env`:

```
VITE_SUPABASE_URL=https://<your-project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<your-publishable-key>
```

Only the publishable key belongs here. Never put a service-role key in the frontend.

---

## Scripts

Run from `client/`:

| Command | What it does |
|---|---|
| `npm run dev` | Start the Vite dev server |
| `npm run build` | Production build |
| `npm run lint` | ESLint (currently reports no errors) |
| `npm run check:colors` | Fails if hard-coded colours are found in components |

---

## Database migrations

- Create: `npx supabase migration new <name>`
- Apply: `npx supabase db push --linked`
- Run all commands from the repository root (`Ledgerly/`).
- Each table's migration enables RLS and sets its grants in the same file.

---

## Testing

SQL test files in `tests/` cover owner, staff/manager, outsider and anonymous access for the later steps (inventory through security audit, multi-business isolation). Each test file reports its failures, and the expected result is **0 failures**. Some Node checks (such as the business-filter check) cover frontend isolation.

---

## Deployment

Ledgerly is deployed on the Vercel free tier from the `main` branch.

1. Import the GitHub repo into Vercel
2. Set **Root Directory** to `client`
3. Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` as environment variables
4. `client/vercel.json` contains the SPA rewrite so client-side routes work on refresh
5. In Supabase Auth, add the Vercel URL to the allowed redirect/site URLs

Every push to `main` triggers a new deployment. Previous deployments can be promoted back in Vercel if you need to roll back.

---

## Known limitations

- **No forgot-password flow.** Users should save their passwords.
- **Email confirmation is OFF** and no custom SMTP is configured, so no emails are sent. Invitations work through a copied invite link.
- **Backups are a safety copy for a developer.** There is no in-app restore. CSV downloads (products, customers, sales, expenses) are available for Excel.
- **Free. No paid subscriptions or payment provider.**
- Runs on free tiers (Vercel and Supabase), so it is intended for a small number of users for now.

---

## Roadmap

If Ledgerly grows: custom domain, custom SMTP with confirm-email back on, forgot-password, and Vercel/Supabase plan upgrades. The mobile version and an AI advisor are out of scope for now.
