export type Id = string;

export interface Season {
  id: Id;
  name: string;
  /** ISO date (YYYY-MM-DD) the season started, used for ordering. */
  startDate: string;
}

export type Team = 'boys' | 'girls' | 'other';

export interface Runner {
  id: Id;
  firstName: string;
  lastName: string;
  team: Team;
  /** Grade at time of entry, e.g. 9-12. Optional. */
  grade?: number;
  /** Seasons this runner is on the roster for. */
  seasonIds: Id[];
  notes?: string;
}

export type PracticeType = 'timed_run' | 'timed_distance' | 'intervals' | 'distance_run';

export interface PracticeEntry {
  runnerId: Id;
  /** timed_run + distance_run: distance covered in miles. */
  distanceMiles?: number;
  /** timed_distance + distance_run: elapsed time in ms. */
  timeMs?: number;
  /** intervals: each rep's time in ms. */
  splitsMs?: number[];
  notes?: string;
}

export interface Practice {
  id: Id;
  seasonId: Id;
  date: string;
  type: PracticeType;
  title: string;
  notes?: string;
  /** timed_run: run for this many minutes. */
  durationMin?: number;
  /** timed_distance: distance of the effort. distance_run: planned distance (optional). */
  distanceMiles?: number;
  /** intervals: distance per rep and number of reps. */
  intervalDistanceMiles?: number;
  intervalReps?: number;
  /** Runners who showed up. Entering a result marks a runner present automatically. */
  attendeeIds?: Id[];
  entries: PracticeEntry[];
}

export interface RaceResult {
  /** null means the finish was recorded but not yet assigned to a runner. */
  runnerId: Id | null;
  timeMs: number;
  /** Overall place in the meet, if known. */
  place?: number;
}

export interface Race {
  id: Id;
  seasonId: Id;
  name: string;
  date: string;
  location?: string;
  distanceMiles: number;
  notes?: string;
  results: RaceResult[];
}

export interface AppData {
  version: 1;
  currentSeasonId: Id | null;
  seasons: Season[];
  runners: Runner[];
  practices: Practice[];
  races: Race[];
}

export interface Finish {
  id: Id;
  runnerId: Id | null;
  elapsedMs: number;
}

export interface StopwatchState {
  raceId: Id | null;
  startedAt: number | null;
  stoppedAt: number | null;
  rosterIds: Id[];
  finishes: Finish[];
}
