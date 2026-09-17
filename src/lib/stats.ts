import type { AppData, Id, Practice, PracticeEntry, Race, RaceResult } from '../types';
import { distanceLabel } from './time';

export interface RaceMark {
  race: Race;
  result: RaceResult;
  /** Place among this team's finishers in that race. */
  teamPlace: number;
}

export function sortedResults(race: Race): RaceResult[] {
  return [...race.results].sort((a, b) => a.timeMs - b.timeMs);
}

export function runnerRaceHistory(data: AppData, runnerId: Id): RaceMark[] {
  const marks: RaceMark[] = [];
  for (const race of data.races) {
    const sorted = sortedResults(race);
    const idx = sorted.findIndex((r) => r.runnerId === runnerId);
    if (idx >= 0) marks.push({ race, result: sorted[idx], teamPlace: idx + 1 });
  }
  return marks.sort((a, b) => a.race.date.localeCompare(b.race.date));
}

/** Best race time per distance label, across all seasons. */
export function runnerRacePBs(data: AppData, runnerId: Id): Map<string, RaceMark> {
  const pbs = new Map<string, RaceMark>();
  for (const m of runnerRaceHistory(data, runnerId)) {
    const label = distanceLabel(m.race.distanceMiles);
    const cur = pbs.get(label);
    if (!cur || m.result.timeMs < cur.result.timeMs) pbs.set(label, m);
  }
  return pbs;
}

/** Best race time per distance label within one season. */
export function runnerRaceSBs(data: AppData, runnerId: Id, seasonId: Id): Map<string, RaceMark> {
  const sbs = new Map<string, RaceMark>();
  for (const m of runnerRaceHistory(data, runnerId)) {
    if (m.race.seasonId !== seasonId) continue;
    const label = distanceLabel(m.race.distanceMiles);
    const cur = sbs.get(label);
    if (!cur || m.result.timeMs < cur.result.timeMs) sbs.set(label, m);
  }
  return sbs;
}

/** Was this result a PB for the runner at the time it was run? Compares against earlier-dated races at the same distance. */
export function isRacePB(data: AppData, runnerId: Id, race: Race, timeMs: number): boolean {
  return beatsEarlier(data, runnerId, race, timeMs, false);
}

/** Was this result a season best at the time it was run (best so far that season at the distance)? */
export function isRaceSB(data: AppData, runnerId: Id, race: Race, timeMs: number): boolean {
  return beatsEarlier(data, runnerId, race, timeMs, true);
}

function beatsEarlier(data: AppData, runnerId: Id, race: Race, timeMs: number, sameSeasonOnly: boolean): boolean {
  const label = distanceLabel(race.distanceMiles);
  for (const m of runnerRaceHistory(data, runnerId)) {
    if (m.race.id === race.id) continue;
    if (m.race.date > race.date) continue;
    if (sameSeasonOnly && m.race.seasonId !== race.seasonId) continue;
    if (distanceLabel(m.race.distanceMiles) !== label) continue;
    if (m.result.timeMs <= timeMs) return false;
  }
  return true;
}

/** "PB", "SB", or null for a race result. PB implies SB, so only one badge is shown. */
export function raceBadge(data: AppData, runnerId: Id, race: Race, timeMs: number): 'PB' | 'SB' | null {
  if (isRacePB(data, runnerId, race, timeMs)) return 'PB';
  if (isRaceSB(data, runnerId, race, timeMs)) return 'SB';
  return null;
}

export interface PracticeMark {
  practice: Practice;
  entry: PracticeEntry;
}

export function runnerPracticeHistory(data: AppData, runnerId: Id): PracticeMark[] {
  const marks: PracticeMark[] = [];
  for (const practice of data.practices) {
    const entry = practice.entries.find((e) => e.runnerId === runnerId);
    if (entry) marks.push({ practice, entry });
  }
  return marks.sort((a, b) => a.practice.date.localeCompare(b.practice.date));
}

export function averageSplit(splits: number[] | undefined): number | null {
  if (!splits || splits.length === 0) return null;
  return splits.reduce((a, b) => a + b, 0) / splits.length;
}

export interface PracticePB {
  key: string;
  label: string;
  /** Human-readable value, e.g. "6:02" or "2.15 mi". */
  valueMs?: number;
  valueMiles?: number;
  practice: Practice;
}

/** Best practice efforts: fastest timed distance per distance, farthest timed run per duration, best avg interval per rep distance. */
export function runnerPracticePBs(data: AppData, runnerId: Id): PracticePB[] {
  const best = new Map<string, PracticePB>();
  for (const { practice, entry } of runnerPracticeHistory(data, runnerId)) {
    if (practice.type === 'timed_distance' && entry.timeMs != null && practice.distanceMiles) {
      const key = `td:${distanceLabel(practice.distanceMiles)}`;
      const cur = best.get(key);
      if (!cur || entry.timeMs < (cur.valueMs ?? Infinity)) {
        best.set(key, { key, label: `Timed ${distanceLabel(practice.distanceMiles)}`, valueMs: entry.timeMs, practice });
      }
    } else if (practice.type === 'timed_run' && entry.distanceMiles != null && practice.durationMin) {
      const key = `tr:${practice.durationMin}`;
      const cur = best.get(key);
      if (!cur || entry.distanceMiles > (cur.valueMiles ?? -1)) {
        best.set(key, { key, label: `${practice.durationMin} min run`, valueMiles: entry.distanceMiles, practice });
      }
    } else if (practice.type === 'intervals' && entry.splitsMs?.length && practice.intervalDistanceMiles) {
      const avg = averageSplit(entry.splitsMs);
      if (avg == null) continue;
      const key = `iv:${distanceLabel(practice.intervalDistanceMiles)}`;
      const cur = best.get(key);
      if (!cur || avg < (cur.valueMs ?? Infinity)) {
        best.set(key, { key, label: `${distanceLabel(practice.intervalDistanceMiles)} repeat avg`, valueMs: avg, practice });
      }
    }
  }
  return [...best.values()].sort((a, b) => a.label.localeCompare(b.label));
}

/** True if this timed-distance practice entry beats every earlier effort at the same distance. */
export function isPracticePB(data: AppData, runnerId: Id, practice: Practice, timeMs: number): boolean {
  if (practice.type !== 'timed_distance' || !practice.distanceMiles) return false;
  const label = distanceLabel(practice.distanceMiles);
  for (const m of runnerPracticeHistory(data, runnerId)) {
    if (m.practice.id === practice.id || m.practice.type !== 'timed_distance') continue;
    if (m.practice.date > practice.date) continue;
    if (distanceLabel(m.practice.distanceMiles) !== label) continue;
    if (m.entry.timeMs != null && m.entry.timeMs <= timeMs) return false;
  }
  return true;
}

export function seasonMileage(data: AppData, runnerId: Id, seasonId: Id): number {
  let miles = 0;
  for (const p of data.practices) {
    if (p.seasonId !== seasonId) continue;
    const e = p.entries.find((x) => x.runnerId === runnerId);
    if (!e) continue;
    if (e.distanceMiles) miles += e.distanceMiles;
    else if (p.type === 'timed_distance' && e.timeMs != null && p.distanceMiles) miles += p.distanceMiles;
    else if (p.type === 'intervals' && e.splitsMs?.length && p.intervalDistanceMiles) miles += e.splitsMs.length * p.intervalDistanceMiles;
  }
  for (const r of data.races) {
    if (r.seasonId !== seasonId) continue;
    if (r.results.some((x) => x.runnerId === runnerId)) miles += r.distanceMiles;
  }
  return miles;
}

/** The distance this season races most often, as a label like "1 mi". Falls back to 1 mi. */
export function seasonRaceDistanceLabel(races: Race[]): string {
  const counts = new Map<string, number>();
  for (const r of races) {
    const l = distanceLabel(r.distanceMiles);
    counts.set(l, (counts.get(l) ?? 0) + 1);
  }
  let best = '1 mi';
  let bestN = 0;
  for (const [l, n] of counts) if (n > bestN) { best = l; bestN = n; }
  return best;
}

/** Practices attended vs held in a season. A runner counts as present if marked or if they have a result. */
export function seasonAttendance(data: AppData, runnerId: Id, seasonId: Id): { attended: number; held: number } {
  let attended = 0;
  let held = 0;
  for (const p of data.practices) {
    if (p.seasonId !== seasonId) continue;
    held++;
    if ((p.attendeeIds ?? []).includes(runnerId) || p.entries.some((e) => e.runnerId === runnerId)) attended++;
  }
  return { attended, held };
}
