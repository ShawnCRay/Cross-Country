import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { User } from 'firebase/auth';
import type { AppData, Id, Practice, Race, Runner, Season } from './types';
import { newId } from './lib/id';
import { todayIso } from './lib/time';
import {
  collectionsOf,
  emptyCollections,
  isEditor,
  isEmptyCollections,
  onAuth,
  pushDiff,
  signIn,
  signOut,
  subscribeAll,
  syncEnabled,
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

  /** Sync / auth state. When sync is off, canEdit is always true. */
  sync: {
    enabled: boolean;
    user: User | null;
    canEdit: boolean;
    ready: boolean;
    signIn: () => Promise<void>;
    signOut: () => Promise<void>;
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
  const [user, setUser] = useState<User | null>(null);
  const [remoteReady, setRemoteReady] = useState(!syncEnabled);
  const canEdit = !syncEnabled || isEditor(user);
  const canEditRef = useRef(canEdit);
  useEffect(() => {
    canEditRef.current = canEdit;
  }, [canEdit]);
  /** Last state known to match the server; null means local data has never been pushed. */
  const lastSynced = useRef<Collections | null>(null);

  useEffect(() => {
    if (!syncEnabled) return;
    return onAuth(setUser);
  }, []);

  useEffect(() => {
    if (!syncEnabled) return;
    return subscribeAll((remote) => {
      const local = collectionsOf(dataRef.current);
      if (isEmptyCollections(remote) && !isEmptyCollections(local) && lastSynced.current == null) {
        // Server is empty but this device has data (first device to sync): keep local, it will be pushed once signed in.
        setRemoteReady(true);
        return;
      }
      const merged = normalizeData({ ...dataRef.current, ...remote });
      lastSynced.current = collectionsOf(merged);
      setData(merged);
      setRemoteReady(true);
    });
  }, []);

  useEffect(() => {
    if (!syncEnabled || !remoteReady || !canEdit) return;
    const prev = lastSynced.current ?? emptyCollections;
    const next = collectionsOf(data);
    if (prev === next) return;
    lastSynced.current = next;
    pushDiff(prev, next).catch((e) => console.error('Sync push failed', e));
  }, [data, remoteReady, canEdit]);

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

      sync: { enabled: syncEnabled, user, canEdit, ready: remoteReady, signIn, signOut },
    };
  }, [data, update, user, canEdit, remoteReady]);

  return <StoreContext.Provider value={store}>{children}</StoreContext.Provider>;
}

export function useStore(): Store {
  const s = useContext(StoreContext);
  if (!s) throw new Error('useStore must be used inside StoreProvider');
  return s;
}
