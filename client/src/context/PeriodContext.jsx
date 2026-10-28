import { createContext, useContext, useMemo, useState } from "react";

const pad = (n) => String(n).padStart(2, "0");
const keyOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;

export function monthOptions(count = 12) {
  const now = new Date();
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const sameYear = d.getFullYear() === now.getFullYear();
    return {
      value: keyOf(d),
      label: d.toLocaleString(
        "en",
        sameYear ? { month: "long" } : { month: "long", year: "numeric" },
      ),
    };
  });
}

function rangeOf(key) {
  const [y, m] = key.split("-").map(Number);
  return { from: `${key}-01`, to: `${keyOf(new Date(y, m, 1))}-01` };
}

const PeriodContext = createContext(null);

export function PeriodProvider({ children }) {
  const [month, setMonth] = useState(() => keyOf(new Date()));
  const value = useMemo(
    () => ({ month, setMonth, ...rangeOf(month) }),
    [month],
  );
  return (
    <PeriodContext.Provider value={value}>{children}</PeriodContext.Provider>
  );
}

export const usePeriod = () => useContext(PeriodContext);
