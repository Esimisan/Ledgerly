import { useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { todayInLagos } from "../lib/analytics";
import { PRESET_KEYS, resolveRange } from "../lib/reportRange";

// The date range lives in the URL: ?range=last_30 or ?range=custom&from=...&to=... (inclusive).
// Other parameters in the URL (report, search, sort) are left alone.
export function useReportRange() {
  const [params, setParams] = useSearchParams();
  const today = todayInLagos();
  const preset = params.get("range");
  const from = params.get("from");
  const to = params.get("to");

  const range = useMemo(
    () => resolveRange({ preset, from, to }, today),
    [preset, from, to, today],
  );

  const setPreset = useCallback(
    (key) => {
      if (!PRESET_KEYS.includes(key)) return;
      const next = new URLSearchParams(params);
      next.delete("page");
      if (key === "custom") {
        // start the custom range from what is on screen
        next.set("range", "custom");
        next.set("from", range.from);
        next.set("to", range.to);
      } else {
        if (key === "this_month") next.delete("range");
        else next.set("range", key);
        next.delete("from");
        next.delete("to");
      }
      setParams(next, { replace: true });
    },
    [params, setParams, range.from, range.to],
  );

  const setCustom = useCallback(
    ({ from: f, to: t }) => {
      const next = new URLSearchParams(params);
      next.delete("page");
      next.set("range", "custom");
      if (f) next.set("from", f);
      else next.delete("from");
      if (t) next.set("to", t);
      else next.delete("to");
      setParams(next, { replace: true });
    },
    [params, setParams],
  );

  return { ...range, setPreset, setCustom };
}
