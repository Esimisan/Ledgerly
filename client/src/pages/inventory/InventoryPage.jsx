import { useSearchParams } from "react-router-dom";
import PageHeader from "../../components/layout/PageHeader";
import StockLevelsTab from "./StockLevelsTab";
import MovementsTab from "./MovementsTab";

export default function InventoryPage() {
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") === "movements" ? "movements" : "levels";

  // Switching tabs drops the other tab's filters.
  function switchTab(next) {
    setParams(next === "movements" ? { tab: "movements" } : {}, {
      replace: true,
    });
  }

  return (
    <>
      <PageHeader
        title="Inventory"
        subtitle="What you have in stock, and every change to it"
      />

      <div className="segmented" role="tablist" aria-label="Inventory views">
        {[
          ["levels", "Stock levels"],
          ["movements", "Movements"],
        ].map(([key, label]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            onClick={() => switchTab(key)}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "levels" ? <StockLevelsTab /> : <MovementsTab />}
    </>
  );
}
