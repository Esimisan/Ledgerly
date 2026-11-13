import { useState } from "react";
import { Search } from "lucide-react";
import BalanceText from "../customers/BalanceText";
import { useDebounced } from "../../hooks/useDebounced";
import { useListQuery } from "../../hooks/useListQuery";
import { searchCustomers } from "../../data/customers";

const EMPTY_SEARCH = { rows: [], error: "" };
const searchFor = ({ businessId, text }) =>
  searchCustomers({ businessId, q: text });

// customer = null means a wa
// lk-in sale. onChange receives a customer row or null.
export default function CustomerPicker({
  businessId,
  symbol,
  customer,
  onChange,
}) {
  const [term, setTerm] = useState("");
  const debounced = useDebounced(term, 250);

  const text = debounced.trim();
  const state = useListQuery(searchFor, { businessId, text }, EMPTY_SEARCH, {
    enabled: Boolean(text),
  });

  if (customer) {
    const pct = Number(customer.discount_percent);
    return (
      <div className="chosen">
        <div className="chosen__body">
          <strong className="product-cell__name">{customer.name}</strong>
          <span className="product-cell__sub">
            {customer.phone || "No phone number"}
            {pct > 0 ? ` · ${pct}% discount level` : ""}
          </span>
          <span className="product-cell__sub">
            Balance:{" "}
            <BalanceText value={Number(customer.balance)} symbol={symbol} />
          </span>
        </div>
        <button
          type="button"
          className="btn btn--secondary btn--sm"
          onClick={() => onChange(null)}
        >
          Remove
        </button>
      </div>
    );
  }

  const showing = term.trim() !== "";
  return (
    <div className="stack">
      <p className="card__sub">
        Walk-in customer. Add a saved customer to apply their discount or to
        sell on credit.
      </p>
      <div className="toolbar__search">
        <Search size={16} aria-hidden="true" />
        <input
          className="input"
          type="search"
          aria-label="Search customers"
          placeholder="Search a customer by name or phone"
          autoComplete="off"
          value={term}
          onChange={(e) => setTerm(e.target.value)}
        />
      </div>

      {showing && state.error && (
        <div className="alert alert--danger" role="alert">
          Could not search customers: {state.error}
        </div>
      )}

      {showing && !state.error && (
        <>
          {state.rows.length === 0 && !state.loading ? (
            <p className="card__sub">
              No active customers match “{term.trim()}”.
            </p>
          ) : (
            <ul className="pick-list" aria-busy={state.loading}>
              {state.rows.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    className="pick-item"
                    onClick={() => {
                      onChange(c);
                      setTerm("");
                    }}
                  >
                    <span className="pick-item__body">
                      <span className="product-cell__name">{c.name}</span>
                      <span className="product-cell__sub">
                        {c.phone || "No phone number"}
                      </span>
                    </span>
                    {Number(c.discount_percent) > 0 && (
                      <span className="badge">
                        {Number(c.discount_percent)}% off
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
