import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

const KEY = "ledgerly-theme";
const ThemeContext = createContext(null);
const media = () => window.matchMedia("(prefers-color-scheme: dark)");

function readPreference() {
  try {
    const v = localStorage.getItem(KEY);
    return v === "light" || v === "dark" || v === "system" ? v : "system";
  } catch {
    return "system";
  }
}

const resolve = (pref) =>
  pref === "system" ? (media().matches ? "dark" : "light") : pref;

export function ThemeProvider({ children }) {
  const [preference, setPreference] = useState(readPreference);
  const [resolved, setResolved] = useState(() => resolve(readPreference()));

  useEffect(() => {
    const update = () => setResolved(resolve(preference));
    update();
    if (preference !== "system") return;
    const m = media();
    m.addEventListener("change", update);
    return () => m.removeEventListener("change", update);
  }, [preference]);

  useEffect(() => {
    document.documentElement.dataset.theme = resolved;
    document.documentElement.style.colorScheme = resolved;
  }, [resolved]);

  // Keep multiple open tabs in sync.
  useEffect(() => {
    const onStorage = (e) => {
      if (e.key === KEY) setPreference(readPreference());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const choose = useCallback((next) => {
    try {
      localStorage.setItem(KEY, next);
    } catch {
      /* private mode: still works for this visit */
    }
    setPreference(next);
  }, []);

  const value = useMemo(
    () => ({ preference, resolved, setPreference: choose }),
    [preference, resolved, choose],
  );
  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

export const useTheme = () => useContext(ThemeContext);
