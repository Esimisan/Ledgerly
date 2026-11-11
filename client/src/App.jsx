import ProductsPage from "./pages/products/ProductsPage";
import ProductFormPage from "./pages/products/ProductFormPage";
import ImportProductsPage from "./pages/products/ImportProductsPage";
import { lazy, Suspense } from "react";
import { Route, Routes } from "react-router-dom";
import AppShell from "./components/layout/AppShell";
import AccessGate from "./components/layout/AccessGate";
import { FullPageLoader } from "./components/ui/Loader";
import {
  GuestOnly,
  RequireAuth,
  RequireBusiness,
  RequirePermission,
} from "./routes/guards";
import Login from "./pages/auth/Login";
import Signup from "./pages/auth/Signup";
import Onboarding from "./pages/auth/Onboarding";
import AcceptInvitePage from "./pages/auth/AcceptInvitePage";
import Overview from "./pages/Overview";
import AnalyticsPage from "./pages/analytics/AnalyticsPage";
import ReportsPage from "./pages/analytics/ReportsPage";
import Placeholder from "./pages/Placeholder";
import { NotFound } from "./pages/Status";
import SuppliersPage from "./pages/suppliers/SuppliersPage";
import InventoryPage from "./pages/inventory/InventoryPage";
import CustomersPage from "./pages/customers/CustomersPage";
import CustomerProfilePage from "./pages/customers/CustomerProfilePage";
import DiscountsPage from "./pages/discounts/DiscountsPage";
import SalesPage from "./pages/sales/SalesPage";
import NewSalePage from "./pages/sales/NewSalePage";
import SaleDetailPage from "./pages/sales/SaleDetailPage";
import ExpensesPage from "./pages/expenses/ExpensesPage";
import ExpenseCategoriesPage from "./pages/expenses/ExpenseCategoriesPage";
import PurchaseOrdersPage from "./pages/purchases/PurchaseOrdersPage";
import PurchaseOrderFormPage from "./pages/purchases/PurchaseOrderFormPage";
import PurchaseOrderDetailPage from "./pages/purchases/PurchaseOrderDetailPage";
import StaffPage from "./pages/staff/StaffPage";

// Dev-only: not included in production builds.
const DesignKit = import.meta.env.DEV
  ? lazy(() => import("./pages/dev/DesignKit"))
  : null;

const ThemeCompare = import.meta.env.DEV
  ? lazy(() => import("./pages/dev/ThemeCompare"))
  : null;
export default function App() {
  return (
    <Routes>
      <Route element={<AccessGate />}>
        <Route path="/accept-invite" element={<AcceptInvitePage />} />

        <Route element={<GuestOnly />}>
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />
        </Route>

        <Route element={<RequireAuth />}>
          <Route path="/onboarding" element={<Onboarding />} />
        </Route>

        <Route element={<RequireBusiness />}>
          <Route element={<AppShell />}>
            <Route index element={<Overview />} />

            <Route path="products" element={<ProductsPage />} />
            <Route element={<RequirePermission permission="products.write" />}>
              <Route path="products/new" element={<ProductFormPage />} />
              <Route
                path="products/:productId/edit"
                element={<ProductFormPage />}
              />
            </Route>
            <Route element={<RequirePermission permission="import.run" />}>
              <Route path="products/import" element={<ImportProductsPage />} />
            </Route>
            <Route path="inventory" element={<InventoryPage />} />
            <Route path="inventory/suppliers" element={<SuppliersPage />} />
            <Route
              element={<RequirePermission permission="purchases.manage" />}
            >
              <Route
                path="inventory/purchase-orders"
                element={<PurchaseOrdersPage />}
              />
              <Route
                path="inventory/purchase-orders/new"
                element={<PurchaseOrderFormPage />}
              />
              <Route
                path="inventory/purchase-orders/:poId"
                element={<PurchaseOrderDetailPage />}
              />
              <Route
                path="inventory/purchase-orders/:poId/edit"
                element={<PurchaseOrderFormPage />}
              />
            </Route>
            <Route path="sales" element={<SalesPage />} />
            <Route element={<RequirePermission permission="sales.create" />}>
              <Route path="sales/new" element={<NewSalePage />} />
            </Route>
            <Route path="sales/:saleId" element={<SaleDetailPage />} />
            <Route
              element={<RequirePermission permission="discounts.manage" />}
            >
              <Route path="sales/discounts" element={<DiscountsPage />} />
            </Route>
            <Route path="customers" element={<CustomersPage />} />
            <Route
              path="customers/:customerId"
              element={<CustomerProfilePage />}
            />
            <Route element={<RequirePermission permission="finance.view" />}>
              <Route path="expenses" element={<ExpensesPage />} />
              <Route
                path="expenses/categories"
                element={<ExpenseCategoriesPage />}
              />
            </Route>
            <Route path="analytics" element={<AnalyticsPage />} />
            <Route element={<RequirePermission permission="reports.view" />}>
              <Route path="analytics/reports" element={<ReportsPage />} />
            </Route>
            <Route
              path="settings"
              element={<Placeholder title="Settings" step={14} />}
            />
            <Route element={<RequirePermission permission="staff.manage" />}>
              <Route path="settings/staff" element={<StaffPage />} />
            </Route>
            <Route element={<RequirePermission permission="audit.view" />}>
              <Route
                path="settings/audit-log"
                element={<Placeholder title="Audit log" step={14} />}
              />
            </Route>
            {DesignKit && (
              <Route
                path="design-kit"
                element={
                  <Suspense fallback={<FullPageLoader />}>
                    <DesignKit />
                  </Suspense>
                }
              />
            )}

            {ThemeCompare && (
              <Route
                path="theme-compare"
                element={
                  <Suspense fallback={<FullPageLoader />}>
                    <ThemeCompare />
                  </Suspense>
                }
              />
            )}
          </Route>
        </Route>

        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
