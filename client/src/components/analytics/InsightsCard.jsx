import { ArrowDown, ArrowUp, Sparkles } from "lucide-react";
import { buildInsights } from "../../lib/analytics";

const ICONS = { up: ArrowUp, down: ArrowDown, none: Sparkles };

export default function InsightsPanel({ data, loading, error }) {
  const items = buildInsights(data);

  return (
    <div aria-busy={loading}>
      <p className="an-eyebrow">Business intelligence</p>
      <h2 className="an-head__title">Insights</h2>
      <p className="an-head__sub">
        What changed compared with the previous period.
      </p>

      {error ? (
        <p className="an-muted an-error-line">
          Insights are unavailable until the numbers load.
        </p>
      ) : !data ? (
        <div className="an-insights" aria-hidden="true">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="an-skeleton an-skeleton--value"
              style={{ width: "100%" }}
            />
          ))}
        </div>
      ) : (
        <div className="an-insights">
          {items.map(({ key, kind, direction, title, text }) => {
            const Icon = ICONS[direction];
            return (
              <div key={key} className="an-insight">
                <span
                  className={`an-insight__icon ${
                    kind === "good"
                      ? "an-insight__icon--good"
                      : kind === "bad"
                        ? "an-insight__icon--bad"
                        : ""
                  }`}
                >
                  <Icon size={16} aria-hidden="true" />
                </span>
                <div>
                  <p className="an-insight__title">{title}</p>
                  <p className="an-insight__text">{text}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
