import type { StopwatchState } from '../types';

export const SW_KEY = 'xc-stopwatch-v1';

export function emptySw(): StopwatchState {
  return { raceId: null, startedAt: null, stoppedAt: null, rosterIds: [], finishes: [] };
}

export function loadSw(): StopwatchState {
  try {
    const raw = localStorage.getItem(SW_KEY);
    if (!raw) return emptySw();
    return { ...emptySw(), ...(JSON.parse(raw) as Partial<StopwatchState>) };
  } catch {
    return emptySw();
  }
}

export function isStopwatchActive(): boolean {
  return loadSw().startedAt != null;
}

