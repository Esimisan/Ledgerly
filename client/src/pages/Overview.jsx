import { Receipt, TrendingUp, Users, Wallet } from "lucide-react";
import PageHeader from "../components/layout/PageHeader";
import { useAuth } from "../context/AuthContext";
import { capitalize, displayName } from "../lib/user";

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

const KPIS = [
  { label: "Revenue", icon: Wallet },
  { label: "Operating expenses", icon: Receipt },
  { label: "Net profit", icon: TrendingUp },
  { label: "Orders", icon: Users },
];

export default function Overview() {
  const { user, business, role, isOwner, permissions } = useAuth();
  const first = displayName(user).split(" ")[0];

  return (
    <>
      <PageHeader
        period
        title={`${greeting()}, ${first}`}
        subtitle="Here is what is happening with your business"
      />

      <div className="grid-kpi">
        {KPIS.map(({ label, icon: Icon }) => (
          <section key={label} className="card">
            <div className="kpi__top">
              <span>{label}</span>
              <span className="kpi__icon">
                <Icon size={16} aria-hidden="true" />
              </span>
            </div>
            <p className="kpi__value">{business?.currency_symbol ?? "₦"}0</p>
            <p className="kpi__trend">Live numbers arrive in Step 11</p>
          </section>
        ))}
      </div>

      <section className="card">
        <h2 className="card__title">Foundation check</h2>
        <p className="card__sub">
          Temporary: confirms sign-in, tenancy and permissions are wired up.
        </p>
        <div className="table-wrap" style={{ marginTop: "var(--space-4)" }}>
          <table className="table">
            <tbody>
              <tr>
                <th scope="row">Signed in as</th>
                <td>{user.email}</td>
              </tr>
              <tr>
                <th scope="row">Business</th>
                <td>{business?.name}</td>
              </tr>
              <tr>
                <th scope="row">Your role</th>
                <td>
                  <span className="badge">{capitalize(role)}</span>
                </td>
              </tr>
              <tr>
                <th scope="row">Permissions</th>
                <td>
                  {isOwner
                    ? "Everything (owner)"
                    : permissions.join(", ") || "None"}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
