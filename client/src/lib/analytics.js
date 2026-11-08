import { useEffect, useRef, useState } from "react";

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];
const MONTHS_LONG = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// "2026-11-08" -> { y, m, d }. Parsed by hand so no timezone can shift the day.
function parts(iso) {
  const [y, m, d] = String(iso).slice(0, 10).split("-").map(Number);
  return { y, m, d };
}

export function addDays(iso, n) {
  const { y, m, d } = parts(iso);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

// Businesses are in Nigeria (WAT, no daylight saving): "today" is the Lagos date.
export function todayInLagos() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Lagos" }).format(
    new Date(),
  );
}

// [from, to) for today, same convention as PeriodContext (to is exclusive).
export function todayRange() {
  const from = todayInLagos();
  return { from, to: addDays(from, 1) };
}

export function shortDate(iso) {
  const { m, d } = parts(iso);
  return `${d} ${MONTHS[m - 1]}`;
}

export function monthLong(iso) {
  const { y, m } = parts(iso);
  return `${MONTHS_LONG[m - 1]} ${y}`;
}

export function longDate(iso) {
  const { y, m, d } = parts(iso);
  const weekday = WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  return `${weekday} ${d} ${MONTHS[m - 1]} ${y}`;
}

// Label under the chart axis.
export function bucketAxisLabel(start, granularity) {
  if (granularity === "month") {
    const { y, m } = parts(start);
    return `${MONTHS[m - 1]} ’${String(y).slice(2)}`;
  }
  return shortDate(start);
}

// Title inside the tooltip. A bucket's end date is exclusive.
export function bucketTitle(point, granularity) {
  if (granularity === "month") return monthLong(point.start);
  if (granularity === "week") {
    const last = addDays(point.end, -1);
    return point.start === last
      ? longDate(point.start)
      : `${shortDate(point.start)} – ${shortDate(last)}`;
  }
  return longDate(point.start);
}

// ₦300k, ₦4.2m, ₦1.5b for chart axes.
export function formatCompactMoney(value, symbol = "₦") {
  const n = Number(value) || 0;
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  const trim = (x) => String(Math.round(x * 10) / 10);
  if (abs >= 1e9) return `${sign}${symbol}${trim(abs / 1e9)}b`;
  if (abs >= 1e6) return `${sign}${symbol}${trim(abs / 1e6)}m`;
  if (abs >= 1e3) return `${sign}${symbol}${trim(abs / 1e3)}k`;
  return `${sign}${symbol}${Math.round(abs)}`;
}

export const plural = (n, one, many) => `${n} ${Number(n) === 1 ? one : many}`;

// What the % change is compared against (matches the database's comparison window).
export function compareLabel({ mode = "month", isPartial = false } = {}) {
  if (mode === "day") return "vs yesterday";
  return isPartial ? "vs same days last month" : "vs last month";
}

export function refreshedText(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const time = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  if (d.toDateString() === new Date().toDateString()) return `today at ${time}`;
  return `${d.toLocaleDateString([], { day: "numeric", month: "short" })} at ${time}`;
}

// Nice round chart scale: about 4 steps, room for negative days (a refund day can dip below 0).
const STEPS = [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10];
function niceStep(raw) {
  if (raw <= 0) return 1;
  const exp = Math.pow(10, Math.floor(Math.log10(raw)));
  const f = raw / exp;
  return (STEPS.find((s) => f <= s) ?? 10) * exp;
}

export function axisScale(values) {
  const max = Math.max(0, ...values);
  const min = Math.min(0, ...values);
  const step = niceStep((max - min) / 4);
  const hi = Math.max(step, step * Math.ceil(max / step));
  const lo = step * Math.floor(min / step);
  const ticks = [];
  for (let t = lo; t <= hi + step / 1000; t += step)
    ticks.push(Math.round(t * 100) / 100);
  return { lo, hi, ticks };
}

// Runs an analytics call when `deps` change (the old data is cleared, so a card never shows
// figures from another month); reload() refetches but keeps what is on screen meanwhile.
export function useAnalyticsQuery(run, deps) {
  const [state, setState] = useState({ loading: true, data: null, error: "" });
  const [tick, setTick] = useState(0);
  const depsKey = JSON.stringify(deps);
  const lastKey = useRef(depsKey);

  useEffect(() => {
    let cancelled = false;
    const changed = lastKey.current !== depsKey;
    lastKey.current = depsKey;
    setState((s) => ({
      loading: true,
      data: changed ? null : s.data,
      error: "",
    }));
    run().then((res) => {
      if (!cancelled)
        setState({
          loading: false,
          data: res.data ?? null,
          error: res.error || "",
        });
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [depsKey, tick]);

  return { ...state, reload: () => setTick((n) => n + 1) };
}

// "1 Oct – 8 Oct" for the window a comparison covers (the end date is exclusive).
export function compareRangeText(compare) {
  if (!compare?.from || !compare?.to) return "";
  const last = addDays(compare.to, -1);
  return compare.from === last
    ? shortDate(compare.from)
    : `${shortDate(compare.from)} – ${shortDate(last)}`;
}

// Plain-language observations from the KPI payload. Only real changes of 5% or more are
// reported, and finance-only observations are skipped when the caller cannot see finance.
const BIG = 5;
const abs1 = (n) => Math.round(Math.abs(Number(n)) * 10) / 10;

export function buildInsights(data) {
  if (!data) return [];
  const k = data.kpis;
  const finance = data.can_view_finance;
  const when = compareLabel({ isPartial: data.is_partial });
  const pct = (m) => (m && m.change_pct != null ? Number(m.change_pct) : null);

  if (Number(k.orders.current) === 0 && Number(k.orders.previous) === 0) {
    return [
      {
        key: "none",
        kind: "info",
        direction: "none",
        title: "No activity yet",
        text: "Insights appear once sales are recorded for this month.",
      },
    ];
  }

  const out = [];

  if (finance) {
    const np = pct(k.net_profit);
    if (np !== null && np >= BIG) {
      out.push({
        key: "np",
        kind: "good",
        direction: "up",
        title: "Net profit improved",
        text: `Net profit is up ${abs1(np)}% ${when}.`,
      });
    } else if (np !== null && np <= -BIG) {
      out.push({
        key: "np",
        kind: "bad",
        direction: "down",
        title: "Net profit is lower",
        text: `Net profit is down ${abs1(np)}% ${when}.`,
      });
    }
  }

  const rv = pct(k.revenue);
  if (rv !== null && rv >= BIG) {
    out.push({
      key: "rev",
      kind: "good",
      direction: "up",
      title: "Revenue is growing",
      text: `Revenue is up ${abs1(rv)}% ${when}.`,
    });
  } else if (rv !== null && rv <= -BIG) {
    out.push({
      key: "rev",
      kind: "bad",
      direction: "down",
      title: "Revenue is lower",
      text: `Revenue is down ${abs1(rv)}% ${when}.`,
    });
  }

  if (finance) {
    const ex = pct(k.operating_expenses);
    if (ex !== null && ex >= BIG) {
      out.push({
        key: "ex",
        kind: "bad",
        direction: "up",
        title: "Operating costs are higher",
        text: `Expenses increased ${abs1(ex)}% ${when}.`,
      });
    } else if (ex !== null && ex <= -BIG) {
      out.push({
        key: "ex",
        kind: "good",
        direction: "down",
        title: "Operating costs are lower",
        text: `Expenses decreased ${abs1(ex)}% ${when}.`,
      });
    }
  }

  const od = pct(k.orders);
  if (od !== null && od >= BIG) {
    out.push({
      key: "ord",
      kind: "good",
      direction: "up",
      title: "More orders",
      text: `Orders are up ${abs1(od)}% ${when}.`,
    });
  } else if (od !== null && od <= -BIG) {
    out.push({
      key: "ord",
      kind: "bad",
      direction: "down",
      title: "Fewer orders",
      text: `Orders are down ${abs1(od)}% ${when}.`,
    });
  }

  if (finance) {
    const pts = k.gross_margin_pct?.change_points;
    if (pts != null && Math.abs(Number(pts)) >= 2) {
      out.push(
        Number(pts) > 0
          ? {
              key: "mg",
              kind: "good",
              direction: "up",
              title: "Margin improved",
              text: `Gross margin is up ${abs1(pts)} points ${when}.`,
            }
          : {
              key: "mg",
              kind: "bad",
              direction: "down",
              title: "Margin slipped",
              text: `Gross margin is down ${abs1(pts)} points ${when}.`,
            },
      );
    }
  }

  if (k.revenue.change_pct == null && Number(k.revenue.current) > 0) {
    out.push({
      key: "early",
      kind: "info",
      direction: "none",
      title: "Early-period data",
      text: "Revenue has no comparison with the previous period yet.",
    });
  }

  if (out.length === 0) {
    out.push({
      key: "steady",
      kind: "info",
      direction: "none",
      title: "A steady period",
      text: `Nothing has moved much ${when}.`,
    });
  }
  return out.slice(0, 4);
}
