import { useState } from "react";
import PageHeader from "../components/layout/PageHeader";
import AttentionCard from "../components/analytics/AttentionCard";
import CustomerStrip from "../components/analytics/CustomerStrip";
import KpiGrid from "../components/analytics/KpiGrid";
import { SalesOverviewCard } from "../components/analytics/SalesChart";
import TopProductsCard from "../components/analytics/TopProductsCard";
import { useAuth } from "../context/AuthContext";
import { usePeriod } from "../context/PeriodContext";
import { refreshedText } from "../lib/analytics";
import { displayName } from "../lib/user";
import "../styles/analytics.css";

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

export default function Overview() {
  const { user, business } = useAuth();
  const { from, to } = usePeriod();
  const [meta, setMeta] = useState(null);

  const businessId = business.id;
  const symbol = business.currency_symbol ?? "₦";
  const first = displayName(user).split(" ")[0];

  return (
    <>
      <PageHeader
        period
        title={`${greeting()}, ${first}`}
        subtitle="Here is what is happening with your business"
      />

      <KpiGrid
        businessId={businessId}
        symbol={symbol}
        from={from}
        to={to}
        variant="overview"
        onLoaded={setMeta}
      />

      <SalesOverviewCard
        businessId={businessId}
        from={from}
        to={to}
        symbol={symbol}
      />

      <div className="an-split">
        <AttentionCard
          businessId={businessId}
          from={from}
          to={to}
          symbol={symbol}
        />
        <TopProductsCard
          businessId={businessId}
          from={from}
          to={to}
          symbol={symbol}
        />
      </div>

      <CustomerStrip
        businessId={businessId}
        from={from}
        to={to}
        symbol={symbol}
      />

      <p className="an-foot">
        Ledgerly overview ·{" "}
        {meta
          ? `Data refreshed ${refreshedText(meta.refreshed_at)}`
          : "Loading the latest data…"}
      </p>
    </>
  );
}
