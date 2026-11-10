import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";
import "../../styles/reports.css";

export default function SortHeader({
  label,
  keys,
  current,
  onSort,
  className = "",
}) {
  const index = keys.findIndex((k) => k.key === current);
  const active = index >= 0 ? keys[index] : null;
  const ariaSort = active
    ? active.dir === "asc"
      ? "ascending"
      : "descending"
    : "none";
  const Icon = !active
    ? ChevronsUpDown
    : active.dir === "asc"
      ? ArrowUp
      : ArrowDown;

  function click() {
    if (!active) return onSort(keys[0].key);
    if (keys.length > 1) return onSort(keys[(index + 1) % keys.length].key);
    return onSort(null);
  }

  return (
    <th className={className} aria-sort={ariaSort}>
      <button
        type="button"
        className={`sort-btn${active ? " is-active" : ""}`}
        onClick={click}
      >
        {label}
        <Icon size={14} className="sort-btn__icon" aria-hidden="true" />
      </button>
    </th>
  );
}
