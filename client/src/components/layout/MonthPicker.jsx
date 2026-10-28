import { Calendar, ChevronDown } from "lucide-react";
import { monthOptions, usePeriod } from "../../context/PeriodContext";

export default function MonthPicker() {
  const { month, setMonth } = usePeriod();
  return (
    <label className="month-picker">
      <Calendar size={16} aria-hidden="true" />
      <span className="sr-only">Month</span>
      <select value={month} onChange={(e) => setMonth(e.target.value)}>
        {monthOptions().map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDown
        size={14}
        className="month-picker__chevron"
        aria-hidden="true"
      />
    </label>
  );
}
