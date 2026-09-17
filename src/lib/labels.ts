import type { PracticeType, Team } from '../types';
import { distanceLabel } from './time';

export const TEAMS: { value: Team; label: string }[] = [
  { value: 'boys', label: 'Boys' },
  { value: 'girls', label: 'Girls' },
  { value: 'other', label: 'Other' },
];

export function teamLabel(t: Team): string {
  return TEAMS.find((x) => x.value === t)?.label ?? t;
}

export const PRACTICE_TYPES: { value: PracticeType; label: string; help: string }[] = [
  { value: 'timed_run', label: 'Timed run', help: 'Run for a set number of minutes; record distance covered.' },
  { value: 'timed_distance', label: 'Timed distance', help: 'Time trial over a set distance, e.g. timed mile.' },
  { value: 'intervals', label: 'Intervals / repeats', help: 'Repeats of a set distance; record each split.' },
  { value: 'distance_run', label: 'Distance run', help: 'Easy or long run; record miles and optional time.' },
];

export function practiceTypeLabel(t: PracticeType): string {
  return PRACTICE_TYPES.find((x) => x.value === t)?.label ?? t;
}

export function practiceSummary(p: {
  type: PracticeType;
  durationMin?: number;
  distanceMiles?: number;
  intervalDistanceMiles?: number;
  intervalReps?: number;
}): string {
  switch (p.type) {
    case 'timed_run':
      return `${p.durationMin ?? '?'} min`;
    case 'timed_distance':
      return distanceLabel(p.distanceMiles);
    case 'intervals':
      return `${p.intervalReps ?? '?'} × ${distanceLabel(p.intervalDistanceMiles)}`;
    case 'distance_run':
      return p.distanceMiles ? distanceLabel(p.distanceMiles) : 'open';
  }
}
