import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { listCategories } from "../data/categories";

export function useCategories() {
  const { business } = useAuth();
  const businessId = business.id;
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let cancelled = false;
    listCategories(businessId).then(({ data }) => {
      if (cancelled) return;
      setCategories(data ?? []);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [businessId, version]);

  const reload = useCallback(() => setVersion((v) => v + 1), []);
  return { categories, loading, reload };
}
