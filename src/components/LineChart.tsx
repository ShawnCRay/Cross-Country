import { formatDate } from '../lib/time';

export interface ChartPoint {
  date: string;
  value: number;
  label?: string;
}

interface Props {
  points: ChartPoint[];
  formatValue: (v: number) => string;
  /** Lower is better (times) flips nothing visually but is used for the trend caption. */
  lowerIsBetter?: boolean;
  height?: number;
}

/** Minimal dependency-free SVG line chart. */
export function LineChart({ points, formatValue, lowerIsBetter = true, height = 220 }: Props) {
  if (points.length === 0) return <p className="muted">No data yet.</p>;
  const sorted = [...points].sort((a, b) => a.date.localeCompare(b.date));
  const width = 640;
  const pad = { l: 56, r: 16, t: 16, b: 36 };
  const values = sorted.map((p) => p.value);
  let min = Math.min(...values);
  let max = Math.max(...values);
  if (min === max) {
    min -= 1;
    max += 1;
  }
  const range = max - min;
  min -= range * 0.1;
  max += range * 0.1;
  const x = (i: number) => (sorted.length === 1 ? width / 2 : pad.l + (i * (width - pad.l - pad.r)) / (sorted.length - 1));
  const y = (v: number) => pad.t + ((max - v) * (height - pad.t - pad.b)) / (max - min);
  const path = sorted.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ');
  const ticks = 4;
  const tickVals = Array.from({ length: ticks + 1 }, (_, i) => min + ((max - min) * i) / ticks);
  const first = sorted[0].value;
  const last = sorted[sorted.length - 1].value;
  const improved = lowerIsBetter ? last < first : last > first;

  return (
    <div className="chart">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Progress chart">
        {tickVals.map((v, i) => (
          <g key={i}>
            <line x1={pad.l} x2={width - pad.r} y1={y(v)} y2={y(v)} className="chart-grid" />
            <text x={pad.l - 6} y={y(v) + 4} textAnchor="end" className="chart-tick">
              {formatValue(v)}
            </text>
          </g>
        ))}
        <path d={path} className="chart-line" />
        {sorted.map((p, i) => (
          <g key={i}>
            <circle cx={x(i)} cy={y(p.value)} r={5} className="chart-dot">
              <title>{`${formatDate(p.date)}: ${formatValue(p.value)}${p.label ? ` (${p.label})` : ''}`}</title>
            </circle>
            {(i === 0 || i === sorted.length - 1 || sorted.length <= 6) && (
              <text x={x(i)} y={height - pad.b + 18} textAnchor="middle" className="chart-tick">
                {formatDate(p.date, { month: 'numeric', day: 'numeric' })}
              </text>
            )}
          </g>
        ))}
      </svg>
      {sorted.length > 1 && (
        <p className={`chart-caption ${improved ? 'good' : ''}`}>
          {formatValue(first)} → {formatValue(last)} {improved ? '(improving)' : ''}
        </p>
      )}
    </div>
  );
}
