import { averageSplit } from './stats';
import { fmtMiles, formatMs, formatPace, formatResult } from './time';

export function describeEntry(
  practice: { type: string; distanceMiles?: number; durationMin?: number; intervalDistanceMiles?: number },
  entry: { distanceMiles?: number; timeMs?: number; splitsMs?: number[] },
): string {
  switch (practice.type) {
    case 'timed_run':
      return entry.distanceMiles != null
        ? `${fmtMiles(entry.distanceMiles)} in ${practice.durationMin} min (${formatPace((practice.durationMin ?? 0) * 60000, entry.distanceMiles)})`
        : '--';
    case 'timed_distance':
      return entry.timeMs != null ? `${formatResult(entry.timeMs)} (${formatPace(entry.timeMs, practice.distanceMiles)})` : '--';
    case 'intervals': {
      const avg = averageSplit(entry.splitsMs);
      return entry.splitsMs?.length ? `${entry.splitsMs.map((s) => formatResult(s)).join(', ')} · avg ${formatResult(avg ?? 0)}` : '--';
    }
    case 'distance_run':
      return entry.distanceMiles != null
        ? `${fmtMiles(entry.distanceMiles)}${entry.timeMs != null ? ` in ${formatMs(entry.timeMs)} (${formatPace(entry.timeMs, entry.distanceMiles)})` : ''}`
        : '--';
    default:
      return '--';
  }
}
