// DONUT CHART drawn with plain SVG (no chart library needed).
// Props: rows = [{ key, color, total }], centerTop / centerBottom = text in the middle.
export default function Donut({ rows, centerTop, centerBottom, size = 120 }) {
  const R = 40;                  // circle radius
  const C = 2 * Math.PI * R;     // full circle length (circumference)
  const total = rows.reduce((s, r) => s + r.total, 0);
  let offset = 0;                // where the next colored arc starts

  return (
    <svg viewBox="0 0 100 100" width={size} height={size} role="img" aria-label="Spending by category">
      {/* grey ring behind the colored arcs */}
      <circle cx="50" cy="50" r={R} fill="none" stroke="var(--line)" strokeWidth="14" />
      {total > 0 &&
        rows.map((r) => {
          const len = (r.total / total) * C; // length of this category's arc
          const arc = (
            <circle
              key={r.key}
              cx="50"
              cy="50"
              r={R}
              fill="none"
              stroke={r.color}
              strokeWidth="14"
              strokeDasharray={`${len} ${C - len}`} // draw "len", then leave a gap
              strokeDashoffset={-offset}            // shift to where the previous arc ended
              transform="rotate(-90 50 50)"         // start from the top
            />
          );
          offset += len;
          return arc;
        })}
      <text x="50" y="49" textAnchor="middle" fontSize="9" fontWeight="700" fill="var(--tx)">{centerTop}</text>
      <text x="50" y="61" textAnchor="middle" fontSize="6" fill="var(--mut)">{centerBottom}</text>
    </svg>
  );
}
