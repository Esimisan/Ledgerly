import { useCallback, useEffect, useState } from "react";

// fetcher: a STABLE module-level function (never an inline arrow) returning a promise of a result object.
// params: JSON-safe values only (strings, numbers, booleans, null).
// initial: the result shape before the first response, e.g. { rows: [], total: 0, error: "" }.
// While loading, the previous result stays available and `error` is "".
export function useListQuery(
  fetcher,
  params,
  initial,
  { enabled = true } = {},
) {
  const key = JSON.stringify(params);
  const [version, setVersion] = useState(0);
  const [done, setDone] = useState({ key: null, version: 0, result: initial });

  useEffect(() => {
    if (!enabled) return undefined;
    let cancelled = false;
    fetcher(JSON.parse(key)).then((result) => {
      if (!cancelled) setDone({ key, version, result });
    });
    return () => {
      cancelled = true;
    };
  }, [fetcher, key, version, enabled]);

  const reload = useCallback(() => setVersion((v) => v + 1), []);
  // Switched off: forget the old result so it cannot come back as stale rows when the query is switched on again (the old pickers reset the same way).
  if (!enabled && done.key !== null)
    setDone({ key: null, version: 0, result: initial });
  const loading = enabled && (done.key !== key || done.version !== version);
  const result = enabled ? done.result : initial;
  return {
    ...result,
    error: loading ? "" : (result.error ?? ""),
    loading,
    reload,
  };
}
