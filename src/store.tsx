import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { AppData, Id, Practice, Race, Runner, Season } from './types';
import { newId } from './lib/id';
import { todayIso } from './lib/time';
import {
  AuthError,
  applyRows,
  checkHealth,
  collectionsOf,
  emptyCollections,
  fetchChanges,
  getCursor,
  getKey,
  loadSynced,
  pushChanges,
  saveSynced,
  setCursor,
  setKey,
  verifyKey,
  type Collections,
} from './lib/sync';

const STORAGE_KEY = 'xc-tracker-v1';

function defaultSeason(): Season {
  const year = new Date().getFullYear();
  return { id: newId(), name: `${year} Season`, startDate: todayIso() };
}

function emptyData(): AppData {
  const season = defaultSeason();
  return { version: 1, currentSeasonId: season.id, seasons: [season], runners: [], practices: [], races: [] };
}

export function normalizeData(raw: unknown): AppData {
  const d = (raw && typeof raw === 'object' ? raw : {}) as Partial<AppData>;
  const data: AppData = {
    version: 1,
    currentSeasonId: d.currentSeasonId ?? null,
    seasons: Array.isArray(d.seasons) ? d.seasons : [],
    runners: Array.isArray(d.runners) ? d.runners.map((r) => ({ ...r, seasonIds: r.seasonIds ?? [] })) : [],
    practices: Array.isArray(d.practices) ? d.practices.map((p) => ({ ...p, entries: p.entries ?? [] })) : [],
    races: Array.isArray(d.races) ? d.races.map((r) => ({ ...r, results: r.results ?? [] })) : [],
  };
  if (data.seasons.length === 0) data.seasons.push(defaultSeason());
  if (!data.currentSeasonId || !data.seasons.some((s) => s.id === data.currentSeasonId)) {
    data.currentSeasonId = data.seasons[data.seasons.length - 1].id;
  }
  return data;
}

function load(): AppData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyData();
    return normalizeData(JSON.parse(raw));
  } catch {
    return emptyData();
  }
}

interface Store {
  data: AppData;
  season: Season;
  seasonRunners: Runner[];
  seasonPractices: Practice[];
  seasonRaces: Race[];
  runnerById: (id: Id | null | undefined) => Runner | undefined;
  runnerName: (id: Id | null | undefined) => string;

  setCurrentSeason: (id: Id) => void;
  addSeason: (s: Omit<Season, 'id'>) => Season;
  updateSeason: (id: Id, patch: Partial<Season>) => void;
  deleteSeason: (id: Id) => void;

  addRunner: (r: Omit<Runner, 'id'>) => Runner;
  updateRunner: (id: Id, patch: Partial<Runner>) => void;
  deleteRunner: (id: Id) => void;

  addPractice: (p: Omit<Practice, 'id'>) => Practice;
  updatePractice: (id: Id, patch: Partial<Practice> | ((p: Practice) => Practice)) => void;
  deletePractice: (id: Id) => void;

  addRace: (r: Omit<Race, 'id'>) => Race;
  updateRace: (id: Id, patch: Partial<Race> | ((r: Race) => Race)) => void;
  deleteRace: (id: Id) => void;

  importData: (raw: unknown) => void;
  resetData: () => void;

  /** Sync state. mode 'off' means the API isn't available and data is local-only (always editable). */
  sync: {
    mode: 'checking' | 'on' | 'off';
    canEdit: boolean;
    isCoach: boolean;
    status: 'idle' | 'syncing' | 'offline' | 'error';
    lastError: string | null;
    /** Verify a coach passcode and remember it on this device. Resolves false if rejected. */
    signIn: (key: string) => Promise<boolean>;
    signOut: () => void;
    refresh: () => Promise<void>;
    /** The coach passcode on this device, for coach-only API calls. */
    coachKey: string | null;
  };
}

const StoreContext = createContext<Store | null>(null);

export function runnerFullName(r: Runner | undefined): string {
  if (!r) return 'Unknown';
  return `${r.firstName} ${r.lastName}`.trim();
}

export function sortRunners(rs: Runner[]): Runner[] {
  return [...rs].sort((a, b) => a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName));
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<AppData>(load);
  const dataRef = useRef(data);
  useEffect(() => {
    dataRef.current = data;
  }, [data]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (e) {
      console.error('Failed to save data', e);
    }
  }, [data]);

  // ---- Sync ----
  const [mode, setMode] = useState<'checking' | 'on' | 'off'>('checking');
  const [coachKey, setCoachKey] = useState<string | null>(getKey);
  const [status, setStatus] = useState<'idle' | 'syncing' | 'offline' | 'error'>('idle');
  const [lastError, setLastError] = useState<string | null>(null);
  const isCoach = coachKey != null;
  const canEdit = mode === 'off' || (mode === 'on' && isCoach);
  const canEditRef = useRef(canEdit);
  useEffect(() => {
    canEditRef.current = canEdit;
  }, [canEdit]);
  /** What we know the server holds. null = never synced from this device. */
  const known = useRef<Collections | null>(loadSynced());
  const pulling = useRef(false);
  const pulledOnce = useRef(getCursor() > 0);
  const pushRef = useRef<() => Promise<void>>(async () => undefined);
  const pushing = useRef(false);
  const pushQueued = useRef(false);

  useEffect(() => {
    let cancelled = false;
    checkHealth().then((ok) => {
      if (cancelled) return;
      // A device that has synced before stays in sync mode even without signal, so a coach can keep
      // working at a meet; changes queue and send when the connection returns.
      setMode(ok || getCursor() > 0 ? 'on' : 'off');
      if (!ok && getCursor() > 0) setStatus('offline');
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const pull = useCallback(async () => {
    if (pulling.current) return;
    pulling.current = true;
    try {
      const cursor = getCursor();
      const { now, rows } = await fetchChanges(cursor);
      const local = collectionsOf(dataRef.current);
      const base = known.current ?? emptyCollections;
      const applied = applyRows(local, base, rows);
      let nextLocal = applied.local;
      let currentSeasonId = dataRef.current.currentSeasonId;
      if (base.seasons.length === 0 && applied.known.seasons.length > 0) {
        // First time this device sees the server's seasons: drop the auto-created empty season so every device shares the server's seasons.
        const knownIds = new Set(applied.known.seasons.map((x) => x.id));
        const referenced = new Set<string>([
          ...nextLocal.runners.flatMap((r) => r.seasonIds),
          ...nextLocal.practices.map((p) => p.seasonId),
          ...nextLocal.races.map((r) => r.seasonId),
        ]);
        nextLocal = { ...nextLocal, seasons: nextLocal.seasons.filter((x) => knownIds.has(x.id) || referenced.has(x.id)) };
        const newest = [...applied.known.seasons].sort((a, b) => a.startDate.localeCompare(b.startDate)).at(-1);
        if (newest && !nextLocal.seasons.some((x) => x.id === currentSeasonId)) currentSeasonId = newest.id;
      }
      known.current = applied.known;
      saveSynced(applied.known);
      setCursor(now);
      pulledOnce.current = true;
      if (JSON.stringify(nextLocal) !== JSON.stringify(local) || currentSeasonId !== dataRef.current.currentSeasonId) {
        const merged = normalizeData({ ...dataRef.current, ...nextLocal, currentSeasonId });
        // Update the ref now, not after render, so the push below diffs against the merged state.
        dataRef.current = merged;
        setData(merged);
      }
      setStatus('idle');
      setLastError(null);
      // Anything local that the server doesn't have yet goes up now.
      pushRef.current();
    } catch (e) {
      setStatus(navigator.onLine ? 'error' : 'offline');
      setLastError((e as Error).message);
    } finally {
      pulling.current = false;
    }
  }, []);

  // Pull on start, when the tab regains focus, when back online, and every 20s while visible.
  useEffect(() => {
    if (mode !== 'on') return;
    pull();
    const onVisible = () => document.visibilityState === 'visible' && pull();
    window.addEventListener('focus', pull);
    window.addEventListener('online', pull);
    document.addEventListener('visibilitychange', onVisible);
    const t = setInterval(() => document.visibilityState === 'visible' && pull(), 20000);
    return () => {
      window.removeEventListener('focus', pull);
      window.removeEventListener('online', pull);
      document.removeEventListener('visibilitychange', onVisible);
      clearInterval(t);
    };
  }, [mode, pull]);

  // Push local changes whenever data differs from what the server holds.
  const push = useCallback(async () => {
    if (mode !== 'on' || !coachKey || !pulledOnce.current) return;
    if (pushing.current) {
      pushQueued.current = true;
      return;
    }
    pushing.current = true;
    try {
      const snapshot = collectionsOf(dataRef.current);
      const base = known.current ?? emptyCollections;
      setStatus('syncing');
      await pushChanges(coachKey, base, snapshot);
      known.current = snapshot;
      saveSynced(snapshot);
      setStatus('idle');
      setLastError(null);
    } catch (e) {
      if (e instanceof AuthError) {
        setKey(null);
        setCoachKey(null);
        setLastError('Coach passcode was rejected. Sign in again.');
        setStatus('error');
      } else {
        setStatus(navigator.onLine ? 'error' : 'offline');
        setLastError((e as Error).message);
        setTimeout(() => {
          pushQueued.current = true;
          pushing.current = false;
          pushRef.current();
        }, 10000);
        return;
      }
    } finally {
      pushing.current = false;
    }
    if (pushQueued.current) {
      pushQueued.current = false;
      pushRef.current();
    }
  }, [mode, coachKey]);
  useEffect(() => {
    pushRef.current = push;
  }, [push]);

  useEffect(() => {
    if (mode !== 'on' || !coachKey) return;
    // Defer so the push runs after render has settled.
    const t = setTimeout(push, 0);
    return () => clearTimeout(t);
  }, [data, mode, coachKey, push]);

  useEffect(() => {
    if (mode !== 'on') return;
    window.addEventListener('online', push);
    return () => window.removeEventListener('online', push);
  }, [mode, push]);

  const signIn = useCallback(async (key: string) => {
    const ok = await verifyKey(key.trim());
    if (ok) {
      setKey(key.trim());
      setCoachKey(key.trim());
      setLastError(null);
    }
    return ok;
  }, []);
  const signOut = useCallback(() => {
    setKey(null);
    setCoachKey(null);
  }, []);

  const update = useCallback((fn: (d: AppData) => AppData) => {
    if (!canEditRef.current) return;
    setData((d) => fn(d));
  }, []);

  const store = useMemo<Store>(() => {
    const season = data.seasons.find((s) => s.id === data.currentSeasonId) ?? data.seasons[0];
    const seasonRunners = sortRunners(data.runners.filter((r) => r.seasonIds.includes(season.id)));
    const byDateDesc = <T extends { date: string }>(a: T, b: T) => b.date.localeCompare(a.date);
    const seasonPractices = data.practices.filter((p) => p.seasonId === season.id).sort(byDateDesc);
    const seasonRaces = data.races.filter((r) => r.seasonId === season.id).sort(byDateDesc);
    const runnerMap = new Map(data.runners.map((r) => [r.id, r]));
    const runnerById = (id: Id | null | undefined) => (id ? runnerMap.get(id) : undefined);

    return {
      data,
      season,
      seasonRunners,
      seasonPractices,
      seasonRaces,
      runnerById,
      runnerName: (id) => (id ? runnerFullName(runnerMap.get(id)) : 'Unassigned'),

      setCurrentSeason: (id) => update((d) => ({ ...d, currentSeasonId: id })),
      addSeason: (s) => {
        const season: Season = { ...s, id: newId() };
        update((d) => ({ ...d, seasons: [...d.seasons, season], currentSeasonId: season.id }));
        return season;
      },
      updateSeason: (id, patch) =>
        update((d) => ({ ...d, seasons: d.seasons.map((s) => (s.id === id ? { ...s, ...patch } : s)) })),
      deleteSeason: (id) =>
        update((d) => {
          if (d.seasons.length <= 1) return d;
          const seasons = d.seasons.filter((s) => s.id !== id);
          return {
            ...d,
            seasons,
            currentSeasonId: d.currentSeasonId === id ? seasons[seasons.length - 1].id : d.currentSeasonId,
            runners: d.runners.map((r) => ({ ...r, seasonIds: r.seasonIds.filter((x) => x !== id) })),
            practices: d.practices.filter((p) => p.seasonId !== id),
            races: d.races.filter((r) => r.seasonId !== id),
          };
        }),

      addRunner: (r) => {
        const runner: Runner = { ...r, id: newId() };
        update((d) => ({ ...d, runners: [...d.runners, runner] }));
        return runner;
      },
      updateRunner: (id, patch) =>
        update((d) => ({ ...d, runners: d.runners.map((r) => (r.id === id ? { ...r, ...patch } : r)) })),
      deleteRunner: (id) =>
        update((d) => ({
          ...d,
          runners: d.runners.filter((r) => r.id !== id),
          practices: d.practices.map((p) => ({ ...p, entries: p.entries.filter((e) => e.runnerId !== id) })),
          races: d.races.map((r) => ({ ...r, results: r.results.filter((x) => x.runnerId !== id) })),
        })),

      addPractice: (p) => {
        const practice: Practice = { ...p, id: newId() };
        update((d) => ({ ...d, practices: [...d.practices, practice] }));
        return practice;
      },
      updatePractice: (id, patch) =>
        update((d) => ({
          ...d,
          practices: d.practices.map((p) =>
            p.id === id ? (typeof patch === 'function' ? patch(p) : { ...p, ...patch }) : p,
          ),
        })),
      deletePractice: (id) => update((d) => ({ ...d, practices: d.practices.filter((p) => p.id !== id) })),

      addRace: (r) => {
        const race: Race = { ...r, id: newId() };
        update((d) => ({ ...d, races: [...d.races, race] }));
        return race;
      },
      updateRace: (id, patch) =>
        update((d) => ({
          ...d,
          races: d.races.map((r) => (r.id === id ? (typeof patch === 'function' ? patch(r) : { ...r, ...patch }) : r)),
        })),
      deleteRace: (id) => update((d) => ({ ...d, races: d.races.filter((r) => r.id !== id) })),

      importData: (raw) => update(() => normalizeData(raw)),
      resetData: () => update(() => emptyData()),

      sync: { mode, canEdit, isCoach, status, lastError, signIn, signOut, refresh: pull, coachKey },
    };
  }, [data, update, mode, canEdit, isCoach, status, lastError, signIn, signOut, pull, coachKey]);

  return <StoreContext.Provider value={store}>{children}</StoreContext.Provider>;
}

export function useStore(): Store {
  const s = useContext(StoreContext);
  if (!s) throw new Error('useStore must be used inside StoreProvider');
  return s;
}
