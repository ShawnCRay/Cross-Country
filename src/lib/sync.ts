import type { AppData } from '../types';

/**
 * Client side of the sync API served by worker/index.ts.
 * If the API isn't there (for example when the static build is hosted elsewhere), the app runs local-only.
 */

export type Collections = Pick<AppData, 'seasons' | 'runners' | 'practices' | 'races'>;
export const COLLECTIONS: (keyof Collections)[] = ['seasons', 'runners', 'practices', 'races'];
export const emptyCollections: Collections = { seasons: [], runners: [], practices: [], races: [] };

export function collectionsOf(d: AppData): Collections {
  return { seasons: d.seasons, runners: d.runners, practices: d.practices, races: d.races };
}

export interface RemoteRow {
  collection: keyof Collections;
  id: string;
  data: string | null;
  deleted: number;
  updated_at: number;
}

const KEY_STORAGE = 'xc-coach-key';
const CURSOR_STORAGE = 'xc-sync-cursor';
const SYNCED_STORAGE = 'xc-synced-v1';

export function getKey(): string | null {
  try {
    return localStorage.getItem(KEY_STORAGE);
  } catch {
    return null;
  }
}
export function setKey(k: string | null): void {
  try {
    if (k) localStorage.setItem(KEY_STORAGE, k);
    else localStorage.removeItem(KEY_STORAGE);
  } catch {
    /* ignore */
  }
}
export function getCursor(): number {
  try {
    return Number(localStorage.getItem(CURSOR_STORAGE) ?? 0) || 0;
  } catch {
    return 0;
  }
}
export function setCursor(n: number): void {
  try {
    localStorage.setItem(CURSOR_STORAGE, String(n));
  } catch {
    /* ignore */
  }
}
export function loadSynced(): Collections | null {
  try {
    const raw = localStorage.getItem(SYNCED_STORAGE);
    return raw ? (JSON.parse(raw) as Collections) : null;
  } catch {
    return null;
  }
}
export function saveSynced(c: Collections | null): void {
  try {
    if (c) localStorage.setItem(SYNCED_STORAGE, JSON.stringify(c));
    else localStorage.removeItem(SYNCED_STORAGE);
  } catch {
    /* ignore */
  }
}

/** Resolve API paths relative to the page so a sub-path deployment still works. */
function api(path: string): string {
  return new URL(path, document.baseURI).toString();
}

/** Retry a few times so a brief blip on cellular doesn't drop the device into local-only mode. */
export async function checkHealth(attempts = 3): Promise<boolean> {
  for (let i = 0; i < attempts; i++) {
    if (await checkHealthOnce()) return true;
    await new Promise((r) => setTimeout(r, 1500));
  }
  return false;
}

async function checkHealthOnce(timeoutMs = 10000): Promise<boolean> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(api('api/health'), { cache: 'no-store', signal: ctrl.signal });
    if (!res.ok) return false;
    const body = (await res.json()) as { ok?: boolean };
    return body.ok === true;
  } catch {
    return false;
  } finally {
    clearTimeout(t);
  }
}

export async function verifyKey(key: string): Promise<boolean> {
  const res = await fetch(api('api/auth'), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ key }),
  });
  return res.ok;
}

export async function fetchChanges(since: number): Promise<{ now: number; rows: RemoteRow[] }> {
  const res = await fetch(api(`api/changes?since=${since}`), { cache: 'no-store' });
  if (!res.ok) throw new Error(`Pull failed (${res.status})`);
  return (await res.json()) as { now: number; rows: RemoteRow[] };
}

export class AuthError extends Error {}

/** Send only what changed between prev and next. Throws on failure so the caller can retry later. */
export async function pushChanges(key: string, prev: Collections, next: Collections): Promise<boolean> {
  const upserts: { collection: string; id: string; data: unknown }[] = [];
  const deletes: { collection: string; id: string }[] = [];
  for (const name of COLLECTIONS) {
    const before = new Map((prev[name] as { id: string }[]).map((x) => [x.id, JSON.stringify(x)]));
    const after = new Map((next[name] as { id: string }[]).map((x) => [x.id, x]));
    for (const [id, item] of after) {
      if (before.get(id) !== JSON.stringify(item)) upserts.push({ collection: name, id, data: item });
    }
    for (const id of before.keys()) if (!after.has(id)) deletes.push({ collection: name, id });
  }
  if (upserts.length === 0 && deletes.length === 0) return false;
  const res = await fetch(api('api/changes'), {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-coach-key': key },
    body: JSON.stringify({ upserts, deletes }),
  });
  if (res.status === 401) throw new AuthError('Coach passcode rejected');
  if (!res.ok) throw new Error(`Push failed (${res.status})`);
  return true;
}

/**
 * Apply remote rows on top of local collections. Rows identical to what we already know the
 * server holds (`known`) are skipped, so our own echoed writes never clobber newer local edits.
 * Returns the new local collections and the new server-known snapshot.
 */
export function applyRows(local: Collections, known: Collections, rows: RemoteRow[]): { local: Collections; known: Collections } {
  const nextLocal: Collections = { ...local };
  const nextKnown: Collections = { ...known };
  for (const row of rows) {
    if (!COLLECTIONS.includes(row.collection)) continue;
    const name = row.collection;
    const knownList = nextKnown[name] as { id: string }[];
    const knownItem = knownList.find((x) => x.id === row.id);
    if (row.deleted) {
      if (!knownItem) continue; // never knew it, nothing to remove
      nextKnown[name] = knownList.filter((x) => x.id !== row.id) as never;
      nextLocal[name] = (nextLocal[name] as { id: string }[]).filter((x) => x.id !== row.id) as never;
      continue;
    }
    if (row.data == null) continue;
    let item: { id: string };
    try {
      item = JSON.parse(row.data);
    } catch {
      continue;
    }
    if (knownItem && JSON.stringify(knownItem) === JSON.stringify(item)) continue;
    nextKnown[name] = upsertInto(knownList, item) as never;
    nextLocal[name] = upsertInto(nextLocal[name] as { id: string }[], item) as never;
  }
  return { local: nextLocal, known: nextKnown };
}

function upsertInto<T extends { id: string }>(list: T[], item: T): T[] {
  const idx = list.findIndex((x) => x.id === item.id);
  if (idx === -1) return [...list, item];
  const copy = list.slice();
  copy[idx] = item;
  return copy;
}
