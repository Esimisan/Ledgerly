import { formatMoney } from "../../lib/format";

// A customer balance in words: positive = they owe us, negative = store credit.
export default function BalanceText({ value, symbol }) {
  const n = Number(value ?? 0);
  if (n === 0) return <span>Settled</span>;
  if (n > 0)
    return <span className="balance--owes">Owes {formatMoney(n, symbol)}</span>;
  return (
    <span className="balance--credit">
      Credit {formatMoney(Math.abs(n), symbol)}
    </span>
  );
}
