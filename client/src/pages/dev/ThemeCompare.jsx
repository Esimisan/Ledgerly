import { useState } from "react";
import PageHeader from "../../components/layout/PageHeader";

const SUGGESTIONS = [
  "/",
  "/products",
  "/products/new",
  "/customers",
  "/sales",
  "/expenses",
  "/settings",
];

function framed(path, theme) {
  const url = new URL(path, window.location.origin);
  url.searchParams.set("theme", theme);
  return url.pathname + url.search;
}

export default function ThemeCompare() {
  const [draft, setDraft] = useState("/products");
  const [path, setPath] = useState("/products");
  const [stacked, setStacked] = useState(false);

  return (
    <>
      <PageHeader
        title="Theme compare"
        subtitle="Dev only. Any screen in light and dark at the same time."
      />
      <section className="card">
        <form
          className="add-row"
          onSubmit={(e) => {
            e.preventDefault();
            setPath(draft.startsWith("/") ? draft : `/${draft}`);
          }}
        >
          <div className="field">
            <label className="field__label" htmlFor="compare-path">
              Route to compare
            </label>
            <input
              id="compare-path"
              className="input"
              list="compare-routes"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
            />
            <datalist id="compare-routes">
              {SUGGESTIONS.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
          </div>
          <button className="btn btn--primary add-row__btn">Show</button>
        </form>
        <label className="check" style={{ marginTop: "var(--space-3)" }}>
          <input
            type="checkbox"
            checked={stacked}
            onChange={(e) => setStacked(e.target.checked)}
          />
          <span>
            Stack vertically (each frame gets the full width, so the desktop
            layout shows)
          </span>
        </label>
      </section>

      <div className={`compare ${stacked ? "compare--stacked" : ""}`}>
        {["light", "dark"].map((t) => (
          <figure key={t}>
            <figcaption>{t} theme</figcaption>
            <iframe
              key={`${t}-${path}`}
              title={`${t} theme preview of ${path}`}
              src={framed(path, t)}
            />
          </figure>
        ))}
      </div>
    </>
  );
}
