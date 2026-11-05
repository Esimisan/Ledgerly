import { formatMoney } from "../../lib/format";
import { toCents } from "../../lib/saleInput";

// state = { loading, rows, grand, count, error } from expenseTotals().
// action = a control shown at the top right of the card (the month picker).
export default function ExpenseSummary({ state, label, hint, symbol, action }) {
  const grandCents = toCents(state.grand);

  return (
    <section className="card" aria-busy={state.loading}>
      <div className="expense-summary__head">
        <div>
          <h2 className="card__title">Spending summary: {label}</h2>
          <p className="card__sub">{hint} Voided expenses are not counted.</p>
        </div>
        {action}
      </div>

      {state.error ? (
        <div
          className="alert alert--danger"
          role="alert"
          style={{ marginTop: "var(--space-4)" }}
        >
          Could not load the summary: {state.error}
        </div>
      ) : state.loading && state.rows.length === 0 ? (
        <div className="empty">
          <div className="spinner" style={{ margin: "0 auto" }} />
        </div>
      ) : state.rows.length === 0 ? (
        <p className="card__sub" style={{ marginTop: "var(--space-4)" }}>
          No expenses recorded for this period.
        </p>
      ) : (
        <div className={`expense-summary ${state.loading ? "is-stale" : ""}`}>
          <div className="expense-summary__totals">
            <div>
              <div className="expense-stat__label">Total spent</div>
              <div className="kpi__value">
                {formatMoney(state.grand, symbol)}
              </div>
            </div>
            <div>
              <div className="expense-stat__label">Expenses</div>
              <div className="kpi__value">{state.count}</div>
            </div>
          </div>

          <ul className="expense-bars">
            {state.rows.map((r) => {
              const pct =
                grandCents > 0
                  ? Math.round((toCents(r.total) / grandCents) * 100)
                  : 0;
              return (
                <li key={r.categoryId} className="expense-bars__row">
                  <div className="expense-bars__head">
                    <span className="expense-bars__name">{r.name}</span>
                    <span className="expense-bars__amount">
                      {formatMoney(r.total, symbol)}
                    </span>
                  </div>
                  <div className="progress">
                    <div className="progress__track">
                      <div
                        className="progress__bar"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="progress__value">{pct}%</span>
                  </div>
                  <div className="expense-bars__sub">
                    {r.count} {r.count === 1 ? "expense" : "expenses"}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </section>
  );
}
