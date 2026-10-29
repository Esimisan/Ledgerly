import ProductsPage from "./pages/products/ProductsPage";
import ProductFormPage from "./pages/products/ProductFormPage";
import { lazy, Suspense } from "react";
import { Route, Routes } from "react-router-dom";
import AppShell from "./components/layout/AppShell";
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
import Overview from "./pages/Overview";
import Placeholder from "./pages/Placeholder";
import { NotFound } from "./pages/Status";
import SuppliersPage from "./pages/suppliers/SuppliersPage";

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
          <Route
            path="inventory"
            element={
              <Placeholder
                title="Inventory"
                subtitle="Stock on hand and movements"
                step={6}
              />
            }
          />
          <Route path="inventory/suppliers" element={<SuppliersPage />} />
          <Route element={<RequirePermission permission="purchases.manage" />}>
            <Route
              path="inventory/purchase-orders"
              element={<Placeholder title="Purchase orders" step={10} />}
            />
          </Route>
          <Route
            path="sales"
            element={
              <Placeholder
                title="Sales"
                subtitle="Orders, returns and receipts"
                step={8}
              />
            }
          />
          <Route
            path="customers"
            element={<Placeholder title="Customers" step={7} />}
          />
          <Route element={<RequirePermission permission="finance.view" />}>
            <Route
              path="expenses"
              element={<Placeholder title="Expenses" step={9} />}
            />
          </Route>
          <Route
            path="analytics"
            element={<Placeholder title="Analytics" step={11} />}
          />
          <Route element={<RequirePermission permission="reports.view" />}>
            <Route
              path="analytics/reports"
              element={<Placeholder title="Reports" step={12} />}
            />
          </Route>
          <Route
            path="settings"
            element={<Placeholder title="Settings" step={13} />}
          />
          <Route element={<RequirePermission permission="staff.manage" />}>
            <Route
              path="settings/staff"
              element={<Placeholder title="Staff" step={13} />}
            />
          </Route>
          <Route element={<RequirePermission permission="audit.view" />}>
            <Route
              path="settings/audit-log"
              element={<Placeholder title="Audit log" step={13} />}
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
    </Routes>
  );
}
