export default function MetricStrip({ items, roomy = false, label }) {
  return (
    <div className={`an-metrics ${roomy ? "an-metrics--roomy" : ""}`}>
      <div
        className="an-metrics__grid"
        style={{ "--cols": items.length }}
        role="list"
        aria-label={label}
      >
        {items.map((item) => (
          <div key={item.key} className="an-metric" role="listitem">
            <p className="an-metric__label">{item.label}</p>
            <p className="an-metric__value">{item.value}</p>
            {item.change && <p className="an-metric__change">{item.change}</p>}
          </div>
        ))}
      </div>
    </div>
  );
}
