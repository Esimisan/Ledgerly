import { useCallback, useEffect, useRef, useState } from "react";

// run() returns { data, error }. deps must be JSON-serialisable (ids, strings).
export function useRpcQuery(run, deps) {
  const [count, setCount] = useState(0);
  const [state, setState] = useState({ key: null, data: null, error: "" });
  const key = `${JSON.stringify(deps)}#${count}`;
  const runRef = useRef(run);

  useEffect(() => {
    runRef.current = run;
  });

  useEffect(() => {
    let cancelled = false;
    runRef.current().then(({ data, error }) => {
      if (!cancelled) setState({ key, data, error });
    });
    return () => {
      cancelled = true;
    };
  }, [key]);

  const reload = useCallback(() => setCount((c) => c + 1), []);
  return {
    data: state.data,
    error: state.error,
    loading: state.key !== key,
    reload,
  };
}
