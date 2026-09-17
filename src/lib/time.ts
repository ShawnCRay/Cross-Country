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

/** Parse "18:32", "18:32.4", "1:02:15", or "95" (seconds) into ms. Returns null if invalid. */
export function parseTime(input: string): number | null {
  const t = input.trim();
  if (!t) return null;
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
  { label: '5K', miles: 3.107 },
  { label: '3 mi', miles: 3 },
  { label: '4K', miles: 2.485 },
  { label: '2 mi', miles: 2 },
  { label: '3K', miles: 1.864 },
  { label: '1.5 mi', miles: 1.5 },
  { label: '1 mi', miles: 1 },
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
