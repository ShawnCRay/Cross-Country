import { initializeApp, type FirebaseApp } from 'firebase/app';
import {
  GoogleAuthProvider,
  getAuth,
  onAuthStateChanged,
  signInWithPopup,
  signInWithRedirect,
  signOut as fbSignOut,
  type User,
} from 'firebase/auth';
import {
  collection,
  doc,
  initializeFirestore,
  onSnapshot,
  persistentLocalCache,
  persistentMultipleTabManager,
  writeBatch,
  type Firestore,
} from 'firebase/firestore';
import { editorEmails, firebaseConfig, teamId } from '../firebase-config';
import type { AppData, Practice, Race, Runner, Season } from '../types';

export const syncEnabled = firebaseConfig != null;

let app: FirebaseApp | null = null;
let db: Firestore | null = null;

function ensure(): { app: FirebaseApp; db: Firestore } {
  if (!firebaseConfig) throw new Error('Sync is not configured');
  if (!app) {
    app = initializeApp(firebaseConfig);
    db = initializeFirestore(app, {
      localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
    });
  }
  return { app, db: db as Firestore };
}

export function isEditor(user: User | null): boolean {
  const email = user?.email?.toLowerCase();
  return !!email && editorEmails.some((e) => e.toLowerCase() === email);
}

export function onAuth(cb: (user: User | null) => void): () => void {
  const { app } = ensure();
  return onAuthStateChanged(getAuth(app), cb);
}

export async function signIn(): Promise<void> {
  const { app } = ensure();
  const auth = getAuth(app);
  const provider = new GoogleAuthProvider();
  try {
    await signInWithPopup(auth, provider);
  } catch (err) {
    const code = (err as { code?: string }).code ?? '';
    if (code === 'auth/popup-blocked' || code === 'auth/operation-not-supported-in-this-environment') {
      await signInWithRedirect(auth, provider);
    } else if (code !== 'auth/popup-closed-by-user' && code !== 'auth/cancelled-popup-request') {
      throw err;
    }
  }
}

export async function signOut(): Promise<void> {
  const { app } = ensure();
  await fbSignOut(getAuth(app));
}

export type Collections = Pick<AppData, 'seasons' | 'runners' | 'practices' | 'races'>;
const COLLECTIONS: (keyof Collections)[] = ['seasons', 'runners', 'practices', 'races'];

function colRef(name: keyof Collections) {
  return collection(ensure().db, 'teams', teamId, name);
}

/**
 * Subscribe to all four collections. Fires once every collection has delivered its first
 * snapshot, then again on every remote change.
 */
export function subscribeAll(cb: (remote: Collections) => void): () => void {
  const current: Partial<Collections> = {};
  const unsubs = COLLECTIONS.map((name) =>
    onSnapshot(
      colRef(name),
      (snap) => {
        const items = snap.docs.map((d) => d.data());
        (current as Record<string, unknown[]>)[name] = items;
        if (COLLECTIONS.every((c) => current[c] != null)) {
          cb({
            seasons: current.seasons as Season[],
            runners: current.runners as Runner[],
            practices: current.practices as Practice[],
            races: current.races as Race[],
          });
        }
      },
      (err) => console.error(`Sync error on ${name}`, err),
    ),
  );
  return () => unsubs.forEach((u) => u());
}

/** Firestore rejects undefined fields, so round-trip through JSON to drop them. */
function clean<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

/** Write only the entities that changed between prev and next, and delete the ones removed. */
export async function pushDiff(prev: Collections, next: Collections): Promise<void> {
  const { db } = ensure();
  let batch = writeBatch(db);
  let ops = 0;
  const commitIfFull = async () => {
    if (ops >= 400) {
      await batch.commit();
      batch = writeBatch(db);
      ops = 0;
    }
  };
  for (const name of COLLECTIONS) {
    const before = new Map((prev[name] as { id: string }[]).map((x) => [x.id, JSON.stringify(x)]));
    const after = new Map((next[name] as { id: string }[]).map((x) => [x.id, x]));
    for (const [id, item] of after) {
      if (before.get(id) !== JSON.stringify(item)) {
        batch.set(doc(colRef(name), id), clean(item));
        ops++;
        await commitIfFull();
      }
    }
    for (const id of before.keys()) {
      if (!after.has(id)) {
        batch.delete(doc(colRef(name), id));
        ops++;
        await commitIfFull();
      }
    }
  }
  if (ops > 0) await batch.commit();
}

export const emptyCollections: Collections = { seasons: [], runners: [], practices: [], races: [] };

export function collectionsOf(d: AppData): Collections {
  return { seasons: d.seasons, runners: d.runners, practices: d.practices, races: d.races };
}

export function isEmptyCollections(c: Collections): boolean {
  return c.runners.length === 0 && c.practices.length === 0 && c.races.length === 0;
}
