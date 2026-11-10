import { useCallback } from "react";
import { useSearchParams } from "react-router-dom";

// Same update() helper the list screens already use: empty values are removed from the URL, and any change returns to page 1 unless the change sets `page` itself.
export function useListParams() {
  const [params, setParams] = useSearchParams();
  const update = useCallback(
    (changes) => {
      const next = new URLSearchParams(params);
      for (const [key, value] of Object.entries(changes)) {
        if (value === "" || value == null) next.delete(key);
        else next.set(key, value);
      }
      if (!("page" in changes)) next.delete("page");
      setParams(next, { replace: true });
    },
    [params, setParams],
  );
  return { params, update };
}
