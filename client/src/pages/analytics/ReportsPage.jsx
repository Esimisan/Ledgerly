import { useEffect } from "react";
import PageHeader from "../../components/layout/PageHeader";
import Field from "../../components/ui/Field";
import RangePicker from "../../components/reports/RangePicker";
import SalesSummaryPanel from "../../components/reports/SalesSummaryPanel";
import SalesByProductPanel from "../../components/reports/SalesByProductPanel";
import SalesByCustomerPanel from "../../components/reports/SalesByCustomerPanel";
import ProfitLossPanel from "../../components/reports/ProfitLossPanel";
import ExpensesByCategoryPanel from "../../components/reports/ExpensesByCategoryPanel";
import InventoryMovementsPanel from "../../components/reports/InventoryMovementsPanel";
import CustomerBalancesPanel from "../../components/reports/CustomerBalancesPanel";
import PeriodSummaryPanel from "../../components/reports/PeriodSummaryPanel";
import { useAuth } from "../../context/AuthContext";
import { useListParams } from "../../hooks/useListParams";
import { useReportRange } from "../../hooks/useReportRange";
import { rangeLabel } from "../../lib/reportRange";
import "../../styles/reports.css";

// range: the report uses the date range picker. finance: needs finance.view.
const REPORTS = [
  { key: "sales_summary", label: "Sales summary", group: "Sales", range: true },
  {
    key: "sales_by_product",
    label: "Sales by product",
    group: "Sales",
    range: true,
  },
  {
    key: "sales_by_customer",
    label: "Sales by customer",
    group: "Sales",
    range: true,
  },
  {
    key: "profit_and_loss",
    label: "Profit and loss",
    group: "Finance",
    range: true,
    finance: true,
  },
  {
    key: "expenses_by_category",
    label: "Expenses by category",
    group: "Finance",
    range: true,
    finance: true,
  },
  {
    key: "period_summary",
    label: "Monthly and yearly summary",
    group: "Finance",
    range: false,
  },
  {
    key: "inventory_movements",
    label: "Inventory movements",
    group: "Stock and customers",
    range: true,
  },
  {
    key: "customer_balances",
    label: "Customer balances",
    group: "Stock and customers",
    range: false,
  },
];

export default function ReportsPage() {
  const { business, can } = useAuth();
  const canFinance = can("finance.view");
  const symbol = business.currency_symbol ?? "₦";

  const { params, update } = useListParams();
  const range = useReportRange();

  // Lets the print stylesheet in reports.css apply only while this page is open.
  useEffect(() => {
    document.body.classList.add("rp-printing");
    return () => document.body.classList.remove("rp-printing");
  }, []);

  const available = REPORTS.filter((r) => !r.finance || canFinance);
  const meta =
    available.find((r) => r.key === params.get("report")) ?? available[0];
  const groups = [...new Set(available.map((r) => r.group))];

  function chooseReport(key) {
    update({
      report: key === available[0].key ? "" : key,
      q: "",
      sort: "",
      gran: "",
      status: "",
      mode: "",
      year: "",
    });
  }

  const common = {
    businessId: business.id,
    businessName: business.name,
    symbol,
    canFinance,
  };
  const withRange = {
    ...common,
    range,
    rangeText: rangeLabel(range.from, range.to),
  };

  let panel;
  if (meta.range && !range.valid) {
    panel = (
      <section className="card">
        <div className="empty">
          <h2 className="card__title">Check your dates</h2>
          <p className="card__sub">{range.error}</p>
        </div>
      </section>
    );
  } else {
    switch (meta.key) {
      case "sales_summary":
        panel = <SalesSummaryPanel key={meta.key} {...withRange} />;
        break;
      case "sales_by_product":
        panel = <SalesByProductPanel key={meta.key} {...withRange} />;
        break;
      case "sales_by_customer":
        panel = <SalesByCustomerPanel key={meta.key} {...withRange} />;
        break;
      case "profit_and_loss":
        panel = <ProfitLossPanel key={meta.key} {...withRange} />;
        break;
      case "expenses_by_category":
        panel = <ExpensesByCategoryPanel key={meta.key} {...withRange} />;
        break;
      case "inventory_movements":
        panel = <InventoryMovementsPanel key={meta.key} {...withRange} />;
        break;
      case "customer_balances":
        panel = <CustomerBalancesPanel key={meta.key} {...common} />;
        break;
      default:
        panel = <PeriodSummaryPanel key={meta.key} {...common} />;
    }
  }

  return (
    <>
      <PageHeader
        title="Reports"
        subtitle="Sales, profit, stock and customer reports for any dates"
      />

      <section className="card rp-toolbar">
        <div className="rp-controls">
          <div className="rp-controls__grid">
            <Field
              as="select"
              label="Report"
              value={meta.key}
              onChange={(e) => chooseReport(e.target.value)}
            >
              {groups.map((g) => (
                <optgroup key={g} label={g}>
                  {available
                    .filter((r) => r.group === g)
                    .map((r) => (
                      <option key={r.key} value={r.key}>
                        {r.label}
                      </option>
                    ))}
                </optgroup>
              ))}
            </Field>
          </div>
        </div>
        {meta.range && (
          <RangePicker
            range={range}
            onPreset={range.setPreset}
            onCustom={range.setCustom}
          />
        )}
      </section>

      {panel}
    </>
  );
}
