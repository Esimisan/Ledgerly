import Field from "../ui/Field";
import { PRESETS, rangeDaysText, rangeLabel } from "../../lib/reportRange";
import "../../styles/reports.css";

// range comes from useReportRange(). Custom dates apply as you type; there is no Apply button.
export default function RangePicker({ range, onPreset, onCustom }) {
  const custom = range.preset === "custom";
  return (
    <div className="rp-range rp-noprint">
      <div className="rp-range__grid">
        <Field
          as="select"
          label="Date range"
          value={range.preset}
          onChange={(e) => onPreset(e.target.value)}
        >
          {PRESETS.map((p) => (
            <option key={p.key} value={p.key}>
              {p.label}
            </option>
          ))}
        </Field>
        {custom && (
          <>
            <Field
              label="From"
              type="date"
              value={range.from}
              max={range.to || undefined}
              onChange={(e) => onCustom({ from: e.target.value, to: range.to })}
            />
            <Field
              label="To"
              type="date"
              value={range.to}
              min={range.from || undefined}
              error={range.error || undefined}
              onChange={(e) =>
                onCustom({ from: range.from, to: e.target.value })
              }
            />
          </>
        )}
      </div>
      <p className="rp-range__text" role="status">
        {range.valid
          ? `${rangeLabel(range.from, range.to)} · ${rangeDaysText(range.from, range.to)}, both end dates included`
          : ""}
      </p>
    </div>
  );
}
