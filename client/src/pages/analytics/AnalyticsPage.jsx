import PageHeader from "../../components/layout/PageHeader";
import CustomerInsights from "../../components/analytics/CustomerInsights";
import FinancialOverview from "../../components/analytics/FinancialOverview";
import ProductInsights from "../../components/analytics/ProductInsights";
import TodayCard from "../../components/analytics/TodayCard";
import TrendCard from "../../components/analytics/TrendCard";
import { useAuth } from "../../context/AuthContext";
import { usePeriod } from "../../context/PeriodContext";
import { getKpis } from "../../data/analytics";
import { refreshedText, useAnalyticsQuery } from "../../lib/analytics";
import "../../styles/analytics.css";

export default function AnalyticsPage() {
  const { business, can } = useAuth();
  const { from, to } = usePeriod();

  const businessId = business.id;
  const symbol = business.currency_symbol ?? "₦";

  // One request for the month, shared by the Financial overview and the Insights.
  const kpis = useAnalyticsQuery(
    () => getKpis({ businessId, from, to }),
    [businessId, from, to],
  );

  return (
    <>
      <PageHeader
        period
        title="Analytics"
        subtitle="Understand your business performance and financial trends."
      />

      <TodayCard businessId={businessId} symbol={symbol} />
      <FinancialOverview kpis={kpis} symbol={symbol} from={from} />
      <TrendCard
        businessId={businessId}
        from={from}
        to={to}
        symbol={symbol}
        kpis={kpis}
      />
      <ProductInsights
        businessId={businessId}
        from={from}
        to={to}
        symbol={symbol}
        canFinance={can("finance.view")}
      />
      <CustomerInsights
        businessId={businessId}
        from={from}
        to={to}
        symbol={symbol}
      />

      <p className="an-foot">
        Ledgerly analytics ·{" "}
        {kpis.data
          ? `Last updated ${refreshedText(kpis.data.refreshed_at)}`
          : "Loading the latest data…"}
      </p>
    </>
  );
}
