/// <reference types="@cloudflare/workers-types" />

/**
 * XC Tracker API. Serves the built site from ./dist and a tiny sync API backed by D1.
 *
 *  GET  /api/health            -> { ok: true }
 *  POST /api/auth  { key }     -> 200 if the key is a coach passcode, 401 otherwise
 *  GET  /api/changes?since=N   -> { now, rows: [{ collection, id, data, deleted, updated_at }] }
 *  POST /api/changes           -> apply { upserts: [{collection,id,data}], deletes: [{collection,id}] }
 *                                 requires header X-Coach-Key
 *  GET  /api/backups           -> list stored snapshots (coach)
 *  POST /api/backups           -> take a snapshot now (coach)
 *  GET  /api/backups/:id       -> download one snapshot as a backup JSON file (coach)
 *
 * A cron trigger takes a nightly snapshot and keeps the last 30.
 */
interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  /** One or more coach passcodes, comma separated. Set with `wrangler secret put COACH_KEY`. */
  COACH_KEY?: string;
}

const COLLECTIONS = new Set(['seasons', 'runners', 'practices', 'races']);

interface Upsert { collection: string; id: string; data: unknown }
interface Delete { collection: string; id: string }

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
}

async function sha256(s: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)));
}

async function keyIsValid(env: Env, key: string | null): Promise<boolean> {
  if (!key || !env.COACH_KEY) return false;
  const given = await sha256(key.trim());
  for (const k of env.COACH_KEY.split(',')) {
    const want = await sha256(k.trim());
    let diff = 0;
    for (let i = 0; i < want.length; i++) diff |= want[i] ^ given[i];
    if (diff === 0 && k.trim().length > 0) return true;
  }
  return false;
}

async function takeSnapshot(env: Env, kind: string): Promise<{ id: number; count: number }> {
  const { results } = await env.DB.prepare('SELECT collection, data FROM entities WHERE deleted = 0').all();
  const rows = (results ?? []) as { collection: string; data: string }[];
  const out: Record<string, unknown[]> = { seasons: [], runners: [], practices: [], races: [] };
  for (const r of rows) {
    if (!(r.collection in out)) continue;
    try {
      out[r.collection].push(JSON.parse(r.data));
    } catch {
      /* skip corrupt row */
    }
  }
  const snapshot = { version: 1, currentSeasonId: null, ...out };
  const now = Date.now();
  const res = await env.DB.prepare('INSERT INTO backups (created_at, kind, entity_count, data) VALUES (?, ?, ?, ?)')
    .bind(now, kind, rows.length, JSON.stringify(snapshot))
    .run();
  // Keep 30 days of nightlies plus the 10 most recent manual ones.
  await env.DB.prepare("DELETE FROM backups WHERE kind = 'nightly' AND created_at < ?").bind(now - 30 * 86400000).run();
  await env.DB.prepare(
    "DELETE FROM backups WHERE kind = 'manual' AND id NOT IN (SELECT id FROM backups WHERE kind = 'manual' ORDER BY created_at DESC LIMIT 10)",
  ).run();
  return { id: Number(res.meta.last_row_id), count: rows.length };
}

function validId(s: unknown): s is string {
  return typeof s === 'string' && s.length > 0 && s.length <= 128;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request);

    if (url.pathname === '/api/health') return json({ ok: true });

    if (url.pathname === '/api/auth' && request.method === 'POST') {
      const body = (await request.json().catch(() => ({}))) as { key?: string };
      return (await keyIsValid(env, body.key ?? null)) ? json({ ok: true }) : json({ error: 'Invalid passcode' }, 401);
    }

    if (url.pathname === '/api/changes' && request.method === 'GET') {
      const since = Math.max(0, Number(url.searchParams.get('since') ?? 0) || 0);
      const { results } = await env.DB.prepare(
        'SELECT collection, id, data, deleted, updated_at FROM entities WHERE updated_at >= ? ORDER BY updated_at ASC',
      )
        .bind(since)
        .all();
      const rows = (results ?? []).filter((r) => !(since === 0 && (r as { deleted: number }).deleted));
      return json({ now: Date.now(), rows });
    }

    if (url.pathname === '/api/changes' && request.method === 'POST') {
      if (!(await keyIsValid(env, request.headers.get('x-coach-key')))) return json({ error: 'Coach passcode required' }, 401);
      const body = (await request.json().catch(() => null)) as { upserts?: Upsert[]; deletes?: Delete[] } | null;
      if (!body) return json({ error: 'Bad request' }, 400);
      const now = Date.now();
      const stmts: D1PreparedStatement[] = [];
      const upsert = env.DB.prepare(
        'INSERT INTO entities (collection, id, data, deleted, updated_at) VALUES (?, ?, ?, 0, ?) ' +
          'ON CONFLICT(collection, id) DO UPDATE SET data = excluded.data, deleted = 0, updated_at = excluded.updated_at',
      );
      const del = env.DB.prepare(
        'INSERT INTO entities (collection, id, data, deleted, updated_at) VALUES (?, ?, NULL, 1, ?) ' +
          'ON CONFLICT(collection, id) DO UPDATE SET data = NULL, deleted = 1, updated_at = excluded.updated_at',
      );
      for (const u of body.upserts ?? []) {
        if (!COLLECTIONS.has(u.collection) || !validId(u.id)) return json({ error: 'Bad upsert' }, 400);
        const data = JSON.stringify(u.data);
        if (data.length > 200_000) return json({ error: 'Entity too large' }, 400);
        stmts.push(upsert.bind(u.collection, u.id, data, now));
      }
      for (const d of body.deletes ?? []) {
        if (!COLLECTIONS.has(d.collection) || !validId(d.id)) return json({ error: 'Bad delete' }, 400);
        stmts.push(del.bind(d.collection, d.id, now));
      }
      for (let i = 0; i < stmts.length; i += 100) await env.DB.batch(stmts.slice(i, i + 100));
      return json({ now, applied: stmts.length });
    }

    if (url.pathname === '/api/backups' || url.pathname.startsWith('/api/backups/')) {
      if (!(await keyIsValid(env, request.headers.get('x-coach-key') ?? url.searchParams.get('key')))) {
        return json({ error: 'Coach passcode required' }, 401);
      }
      if (url.pathname === '/api/backups' && request.method === 'GET') {
        const { results } = await env.DB.prepare(
          'SELECT id, created_at, kind, entity_count FROM backups ORDER BY created_at DESC LIMIT 60',
        ).all();
        return json({ backups: results ?? [] });
      }
      if (url.pathname === '/api/backups' && request.method === 'POST') {
        return json(await takeSnapshot(env, 'manual'));
      }
      const id = Number(url.pathname.slice('/api/backups/'.length));
      if (request.method === 'GET' && Number.isInteger(id)) {
        const row = (await env.DB.prepare('SELECT created_at, data FROM backups WHERE id = ?').bind(id).first()) as
          | { created_at: number; data: string }
          | null;
        if (!row) return json({ error: 'Not found' }, 404);
        const day = new Date(row.created_at).toISOString().slice(0, 10);
        return new Response(row.data, {
          headers: {
            'content-type': 'application/json',
            'content-disposition': `attachment; filename="xc-backup-${day}.json"`,
            'cache-control': 'no-store',
          },
        });
      }
    }

    return json({ error: 'Not found' }, 404);
  },

  async scheduled(_controller: ScheduledController, env: Env): Promise<void> {
    await takeSnapshot(env, 'nightly');
  },
} satisfies ExportedHandler<Env>;
