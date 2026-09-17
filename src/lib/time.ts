/** Format milliseconds as m:ss, h:mm:ss, optionally with hundredths. */
export function formatMs(ms: number | null | undefined, opts: { hundredths?: boolean; tenths?: boolean } = {}): string {
  if (ms == null || !Number.isFinite(ms) || ms < 0) return '--';
  const totalSec = Math.floor(ms / 1000);
  const s = totalSec % 60;
  const m = Math.floor(totalSec / 60) % 60;
  const h = Math.floor(totalSec / 3600);
  const mm = h > 0 ? String(m).padStart(2, '0') : String(m);
  const ss = String(s).padStart(2, '0');
  let out = h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
  if (opts.hundredths) out += '.' + String(Math.floor(ms / 10) % 100).padStart(2, '0');
  else if (opts.tenths) out += '.' + String(Math.floor(ms / 100) % 10);
  return out;
}

/**
 * Parse a time into ms. Accepts "18:32", "18:32.4", "1:02:15", and stopwatch-style
 * digits with no colon where the last two digits are seconds: "712" -> 7:12,
 * "1852" -> 18:52, "10215" -> 1:02:15, "45" -> 0:45. Returns null if invalid.
 */
export function parseTime(input: string): number | null {
  const t = input.trim();
  if (!t) return null;
  if (!t.includes(':')) {
    const m = /^(\d+)(\.\d+)?$/.exec(t);
    if (!m) return null;
    const digits = m[1];
    const frac = m[2] ?? '';
    if (digits.length <= 2) return Math.round(parseFloat(digits + frac) * 1000);
    const sec = parseFloat(digits.slice(-2) + frac);
    const rest = digits.slice(0, -2);
    const min = parseInt(rest.slice(-2), 10);
    const hr = rest.length > 2 ? parseInt(rest.slice(0, -2), 10) : 0;
    if (sec >= 60 || min >= 60) return null;
    return Math.round((hr * 3600 + min * 60 + sec) * 1000);
  }
  const parts = t.split(':');
  if (parts.length > 3) return null;
  const secPart = parts.pop() as string;
  if (!/^\d+(\.\d+)?$/.test(secPart)) return null;
  let total = parseFloat(secPart);
  let mult = 60;
  while (parts.length) {
    const p = parts.pop() as string;
    if (!/^\d+$/.test(p)) return null;
    total += parseInt(p, 10) * mult;
    mult *= 60;
  }
  return Math.round(total * 1000);
}

export function paceMsPerMile(timeMs: number, miles: number): number | null {
  if (!miles || miles <= 0 || !Number.isFinite(timeMs)) return null;
  return timeMs / miles;
}

export function formatPace(timeMs: number | undefined, miles: number | undefined): string {
  if (timeMs == null || miles == null) return '--';
  const p = paceMsPerMile(timeMs, miles);
  return p == null ? '--' : `${formatMs(p)} /mi`;
}

export function todayIso(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

/** Parse a YYYY-MM-DD string as a local date (not UTC). */
export function localDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

export function formatDate(iso: string, opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric' }): string {
  if (!iso) return '';
  return localDate(iso).toLocaleDateString(undefined, opts);
}

export const DISTANCE_PRESETS: { label: string; miles: number }[] = [
  { label: '1 mi', miles: 1 },
  { label: '1.5 mi', miles: 1.5 },
  { label: '2K', miles: 1.243 },
  { label: '3K', miles: 1.864 },
  { label: '2 mi', miles: 2 },
  { label: '4K', miles: 2.485 },
  { label: '5K', miles: 3.107 },
  { label: '3 mi', miles: 3 },
  { label: '800m', miles: 0.497 },
  { label: '400m', miles: 0.2485 },
];

export function distanceLabel(miles: number | undefined): string {
  if (miles == null) return '--';
  const hit = DISTANCE_PRESETS.find((p) => Math.abs(p.miles - miles) < 0.011);
  if (hit) return hit.label;
  return `${Number(miles.toFixed(2))} mi`;
}

export function fmtMiles(miles: number | undefined): string {
  if (miles == null) return '--';
  return `${Number(miles.toFixed(2))} mi`;
}

/** Whole days from today to the given date (negative if past). */
export function daysFromToday(iso: string): number {
  const a = localDate(todayIso()).getTime();
  const b = localDate(iso).getTime();
  return Math.round((b - a) / 86400000);
}

export function relativeDay(iso: string): string {
  const d = daysFromToday(iso);
  if (d === 0) return 'Today';
  if (d === 1) return 'Tomorrow';
  if (d === -1) return 'Yesterday';
  if (d > 1) return `In ${d} days`;
  return `${-d} days ago`;
}
