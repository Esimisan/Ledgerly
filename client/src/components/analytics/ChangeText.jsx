import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";

export default function ChangeText({
  metric,
  label = "",
  inverse = false,
  field = "change_pct",
  unit = "%",
  words = false,
}) {
  if (!metric) return null;
  const pct = metric[field];

  if (pct == null) {
    // The previous period had nothing to compare with.
    const text =
      Number(metric.current) > 0 ? "New this period" : "Nothing to compare yet";
    return (
      <span className="an-change">
        <Minus size={14} aria-hidden="true" /> {text}
      </span>
    );
  }

  const rounded = Math.round(Number(pct) * 10) / 10;
  if (rounded === 0) {
    return (
      <span className="an-change">
        <Minus size={14} aria-hidden="true" /> No change {label}
      </span>
    );
  }

  const up = rounded > 0;
  const good = inverse ? !up : up;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  const suffix = unit === "pts" ? " pts" : "%";
  const value = words
    ? `${Math.abs(rounded)}${suffix} ${up ? "higher" : "lower"}`
    : `${up ? "+" : ""}${rounded}${suffix}`;

  return (
    <span
      className={`an-change ${good ? "an-change--good" : "an-change--bad"}`}
    >
      <Icon size={14} aria-hidden="true" /> {value} {label}
    </span>
  );
}
