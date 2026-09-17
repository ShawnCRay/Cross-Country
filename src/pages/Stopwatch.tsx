import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { runnerFullName, useStore } from '../store';
import type { Finish, Id, StopwatchState, Team } from '../types';
import { newId } from '../lib/id';
import { DISTANCE_PRESETS, distanceLabel, formatDate, formatMs, todayIso } from '../lib/time';
import { emptySw, loadSw, SW_KEY } from '../lib/stopwatchStorage';
import { ConfirmButton } from '../components/ConfirmButton';
import { TimeInput } from '../components/TimeInput';

export function Stopwatch() {
  const store = useStore();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [sw, setSw] = useState<StopwatchState>(loadSw);

  useEffect(() => {
    localStorage.setItem(SW_KEY, JSON.stringify(sw));
  }, [sw]);

  const running = sw.startedAt != null && sw.stoppedAt == null;
  const started = sw.startedAt != null;

  // Clock tick
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setNow(Date.now()), 31);
    return () => clearInterval(t);
  }, [running]);

  // Keep the screen on while timing.
  useEffect(() => {
    if (!running) return;
    let lock: { release: () => Promise<void> } | null = null;
    const nav = navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> } };
    nav.wakeLock?.request('screen').then((l) => (lock = l)).catch(() => undefined);
    return () => {
      lock?.release().catch(() => undefined);
    };
  }, [running]);

  const elapsed = sw.startedAt == null ? 0 : (sw.stoppedAt ?? now) - sw.startedAt;

  // ---------- Setup state ----------
  const [raceChoice, setRaceChoice] = useState<string>(params.get('race') ?? 'new');
  const [newName, setNewName] = useState('');
  const [newDate, setNewDate] = useState(todayIso());
  const [newDistance, setNewDistance] = useState(String(DISTANCE_PRESETS[0].miles));
  const [customDistance, setCustomDistance] = useState('');
  const [rosterSel, setRosterSel] = useState<Set<Id>>(() => new Set(store.seasonRunners.map((r) => r.id)));

  const race = store.data.races.find((r) => r.id === sw.raceId);

  const toggleTeam = (team: Team | 'all', on: boolean) => {
    setRosterSel((prev) => {
      const next = new Set(prev);
      for (const r of store.seasonRunners) {
        if (team === 'all' || r.team === team) {
          if (on) next.add(r.id);
          else next.delete(r.id);
        }
      }
      return next;
    });
  };

  const start = () => {
    let raceId = raceChoice;
    if (raceChoice === 'new') {
      const miles = newDistance === 'custom' ? parseFloat(customDistance) : parseFloat(newDistance);
      if (!Number.isFinite(miles) || miles <= 0) {
        alert('Enter a valid race distance.');
        return;
      }
      const created = store.addRace({
        seasonId: store.season.id,
        name: newName.trim() || `Race ${formatDate(newDate)}`,
        date: newDate,
        distanceMiles: miles,
        results: [],
      });
      raceId = created.id;
    }
    setSw({ raceId, startedAt: Date.now(), stoppedAt: null, rosterIds: [...rosterSel], finishes: [] });
  };

  // ---------- Timing actions ----------
  const recordFinish = (runnerId: Id | null) => {
    if (!running || sw.startedAt == null) return;
    const f: Finish = { id: newId(), runnerId, elapsedMs: Date.now() - sw.startedAt };
    setSw((s) => ({ ...s, finishes: [...s.finishes, f] }));
    if (navigator.vibrate) navigator.vibrate(30);
  };
  const undoLast = () => setSw((s) => ({ ...s, finishes: s.finishes.slice(0, -1) }));
  const removeFinish = (id: Id) => setSw((s) => ({ ...s, finishes: s.finishes.filter((f) => f.id !== id) }));
  const assignFinish = (id: Id, runnerId: Id | null) =>
    setSw((s) => ({
      ...s,
      finishes: s.finishes.map((f) => {
        if (f.id === id) return { ...f, runnerId };
        // If another finish already had this runner, unassign it so a runner can't finish twice.
        if (runnerId && f.runnerId === runnerId) return { ...f, runnerId: null };
        return f;
      }),
    }));
  const editFinishTime = (id: Id, ms: number | undefined) => {
    if (ms == null) return;
    setSw((s) => ({ ...s, finishes: s.finishes.map((f) => (f.id === id ? { ...f, elapsedMs: ms } : f)) }));
  };
  const stop = () => setSw((s) => ({ ...s, stoppedAt: Date.now() }));
  const resume = () => setSw((s) => ({ ...s, stoppedAt: null }));
  const discard = () => setSw(emptySw());

  const save = () => {
    if (!sw.raceId) return;
    const finishes = [...sw.finishes].sort((a, b) => a.elapsedMs - b.elapsedMs);
    const finishedIds = new Set(finishes.map((f) => f.runnerId).filter(Boolean));
    store.updateRace(sw.raceId, (r) => ({
      ...r,
      results: [
        ...r.results.filter((x) => x.runnerId && !finishedIds.has(x.runnerId)),
        ...finishes.map((f) => ({ runnerId: f.runnerId, timeMs: f.elapsedMs })),
      ],
    }));
    const raceId = sw.raceId;
    setSw(emptySw());
    navigate(`/races/${raceId}`);
  };

  const finishedRunnerIds = useMemo(() => new Set(sw.finishes.map((f) => f.runnerId).filter(Boolean)), [sw.finishes]);
  const roster = useMemo(
    () => sw.rosterIds.map((id) => store.runnerById(id)).filter((r): r is NonNullable<typeof r> => !!r),
    [sw.rosterIds, store],
  );
  const remaining = roster.filter((r) => !finishedRunnerIds.has(r.id));
  const sortedFinishes = [...sw.finishes].sort((a, b) => a.elapsedMs - b.elapsedMs);
  const unassignedCount = sw.finishes.filter((f) => !f.runnerId).length;

  const listRef = useRef<HTMLDivElement>(null);

  // ---------- Render: setup ----------
  if (!started) {
    const teams: Team[] = ['boys', 'girls', 'other'];
    return (
      <div className="page">
        <h1>Race Stopwatch</h1>
        <p className="muted">Pick the race and who is running, then hit Start. Tap a runner's name as they cross the line.</p>

        <section className="card">
          <h2>Race</h2>
          <label className="field">
            <span>Race</span>
            <select value={raceChoice} onChange={(e) => setRaceChoice(e.target.value)}>
              <option value="new">New race...</option>
              {store.seasonRaces.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name} · {formatDate(r.date)} · {distanceLabel(r.distanceMiles)}
                  {r.results.length ? ` (${r.results.length} results already)` : ''}
                </option>
              ))}
            </select>
          </label>
          {raceChoice === 'new' && (
            <div className="grid-2">
              <label className="field">
                <span>Name</span>
                <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g. County Invitational" />
              </label>
              <label className="field">
                <span>Date</span>
                <input type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} />
              </label>
              <label className="field">
                <span>Distance</span>
                <select value={newDistance} onChange={(e) => setNewDistance(e.target.value)}>
                  {DISTANCE_PRESETS.map((p) => (
                    <option key={p.label} value={String(p.miles)}>
                      {p.label}
                    </option>
                  ))}
                  <option value="custom">Custom (miles)</option>
                </select>
              </label>
              {newDistance === 'custom' && (
                <label className="field">
                  <span>Miles</span>
                  <input type="number" step="0.01" min="0" value={customDistance} onChange={(e) => setCustomDistance(e.target.value)} />
                </label>
              )}
            </div>
          )}
        </section>

        <section className="card">
          <div className="row between">
            <h2>Runners ({rosterSel.size})</h2>
            <div className="row wrap gap">
              <button className="btn small" onClick={() => toggleTeam('all', true)}>All</button>
              <button className="btn small" onClick={() => toggleTeam('all', false)}>None</button>
              {teams.map((t) =>
                store.seasonRunners.some((r) => r.team === t) ? (
                  <button key={t} className="btn small" onClick={() => { toggleTeam('all', false); toggleTeam(t, true); }}>
                    {t[0].toUpperCase() + t.slice(1)} only
                  </button>
                ) : null,
              )}
            </div>
          </div>
          {store.seasonRunners.length === 0 ? (
            <p className="muted">
              No runners on this season's roster yet. <Link to="/runners">Add runners</Link> first.
            </p>
          ) : (
            <div className="check-grid">
              {store.seasonRunners.map((r) => (
                <label key={r.id} className={`check-item ${rosterSel.has(r.id) ? 'on' : ''}`}>
                  <input
                    type="checkbox"
                    checked={rosterSel.has(r.id)}
                    onChange={(e) =>
                      setRosterSel((prev) => {
                        const next = new Set(prev);
                        if (e.target.checked) next.add(r.id);
                        else next.delete(r.id);
                        return next;
                      })
                    }
                  />
                  {runnerFullName(r)}
                </label>
              ))}
            </div>
          )}
        </section>

        <button className="btn primary xl" onClick={start} disabled={rosterSel.size === 0}>
          ▶ Start Race Clock
        </button>
      </div>
    );
  }

  // ---------- Render: timing ----------
  return (
    <div className="page stopwatch">
      <div className="sw-header">
        <div>
          <div className="muted small">{race ? `${race.name} · ${distanceLabel(race.distanceMiles)}` : 'Race was deleted'}</div>
          <div className={`sw-clock ${running ? 'running' : 'stopped'}`}>{formatMs(elapsed, { tenths: true })}</div>
        </div>
        <div className="sw-controls">
          {running ? (
            <button className="btn danger" onClick={stop}>■ Stop clock</button>
          ) : (
            <button className="btn" onClick={resume}>▶ Resume</button>
          )}
          <button className="btn" onClick={undoLast} disabled={sw.finishes.length === 0}>↶ Undo last</button>
        </div>
      </div>

      {running && (
        <>
          <button className="btn finish-any" onClick={() => recordFinish(null)}>
            FINISH (assign later)
          </button>
          <div className="finish-grid">
            {remaining.map((r) => (
              <button key={r.id} className="btn finish-runner" onClick={() => recordFinish(r.id)}>
                <span className="finish-name">{r.firstName}</span>
                <span className="finish-last">{r.lastName}</span>
              </button>
            ))}
            {remaining.length === 0 && <p className="muted">Everyone on the roster has finished.</p>}
          </div>
        </>
      )}

      <section className="card" ref={listRef}>
        <div className="row between">
          <h2>Finishes ({sw.finishes.length}/{roster.length})</h2>
          {unassignedCount > 0 && <span className="badge warn">{unassignedCount} unassigned</span>}
        </div>
        {sortedFinishes.length === 0 ? (
          <p className="muted">No finishes yet.</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>#</th>
                <th>Time</th>
                <th>Runner</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {sortedFinishes.map((f, i) => (
                <tr key={f.id} className={f.runnerId ? '' : 'unassigned'}>
                  <td>{i + 1}</td>
                  <td>
                    <TimeInput valueMs={f.elapsedMs} onChange={(ms) => editFinishTime(f.id, ms)} hundredths className="compact" />
                  </td>
                  <td>
                    <select value={f.runnerId ?? ''} onChange={(e) => assignFinish(f.id, e.target.value || null)}>
                      <option value="">— Unassigned —</option>
                      {roster.map((r) => (
                        <option key={r.id} value={r.id}>
                          {runnerFullName(r)}
                          {finishedRunnerIds.has(r.id) && r.id !== f.runnerId ? ' (finished)' : ''}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <button className="btn icon" title="Remove" onClick={() => removeFinish(f.id)}>✕</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <div className="row wrap gap">
        <button className="btn primary" onClick={save} disabled={!race || sw.finishes.length === 0}>
          💾 Save results to race
        </button>
        <ConfirmButton onConfirm={discard} confirmLabel="Discard all finishes?">Discard</ConfirmButton>
      </div>
      {!race && <p className="muted">The race this clock was started for no longer exists. Discard to start over.</p>}
    </div>
  );
}
