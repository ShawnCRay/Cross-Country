import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { runnerFullName, useStore } from '../store';
import type { Checkpoint, Finish, Id, Lap, PracticeType, StopwatchState, Team } from '../types';
import { newId } from '../lib/id';
import { DISTANCE_PRESETS, distanceLabel, formatDate, formatMs, formatResult, todayIso } from '../lib/time';
import { emptySw, loadSw, SW_KEY } from '../lib/stopwatchStorage';
import { practiceSummary, practiceTypeLabel } from '../lib/labels';
import { ConfirmButton } from '../components/ConfirmButton';
import { TimeInput } from '../components/TimeInput';

type Target = 'race' | 'practice';
type TimedPracticeType = Extract<PracticeType, 'timed_distance' | 'intervals' | 'timed_run'>;

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

  // Keep the screen on while timing. Re-request when the tab becomes visible again (locks drop on hide).
  const [awake, setAwake] = useState<'on' | 'off' | 'unsupported'>(() => ('wakeLock' in navigator ? 'off' : 'unsupported'));
  useEffect(() => {
    if (!running) return;
    let lock: { release: () => Promise<void>; addEventListener?: (t: string, f: () => void) => void } | null = null;
    const nav = navigator as Navigator & {
      wakeLock?: { request: (t: 'screen') => Promise<{ release: () => Promise<void>; addEventListener?: (t: string, f: () => void) => void }> };
    };
    if (!nav.wakeLock) return;
    const acquire = () => {
      if (document.visibilityState !== 'visible') return;
      nav.wakeLock
        ?.request('screen')
        .then((l) => {
          lock = l;
          setAwake('on');
          l.addEventListener?.('release', () => setAwake('off'));
        })
        .catch(() => setAwake('off'));
    };
    acquire();
    document.addEventListener('visibilitychange', acquire);
    return () => {
      document.removeEventListener('visibilitychange', acquire);
      lock?.release().catch(() => undefined);
    };
  }, [running]);

  // Undo toast after each tap.
  const [toast, setToast] = useState<{ id: Id; label: string; kind: 'finish' | 'checkpoint' | 'lap' } | null>(null);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 6000);
    return () => clearTimeout(t);
  }, [toast]);

  const elapsed = sw.startedAt == null ? 0 : (sw.stoppedAt ?? now) - sw.startedAt;

  const race = store.data.races.find((r) => r.id === sw.raceId);
  const practice = store.data.practices.find((p) => p.id === sw.practiceId);
  const countdownMs = started && practice?.type === 'timed_run' ? (practice.durationMin ?? 0) * 60000 - elapsed : null;
  const timeUp = countdownMs != null && countdownMs <= 0;
  useTimeUpBuzz(timeUp);
  const target = practice ? practice : race;
  const kind: 'race' | TimedPracticeType | null = practice
    ? (practice.type as TimedPracticeType)
    : race
      ? 'race'
      : null;

  // ---------- Setup state ----------
  const [targetType, setTargetType] = useState<Target>(params.get('practice') ? 'practice' : 'race');
  const [raceChoice, setRaceChoice] = useState<string>(params.get('race') ?? 'new');
  const [practiceChoice, setPracticeChoice] = useState<string>(params.get('practice') ?? 'new');
  const [newName, setNewName] = useState('');
  const [newDate, setNewDate] = useState(todayIso());
  const [newDistance, setNewDistance] = useState(String(DISTANCE_PRESETS[0].miles));
  const [customDistance, setCustomDistance] = useState('');
  const [newPracticeType, setNewPracticeType] = useState<TimedPracticeType>('timed_distance');
  const [newMinutes, setNewMinutes] = useState('12');
  const [newReps, setNewReps] = useState('6');
  const [newRepDistance, setNewRepDistance] = useState('0.2485');
  const [rosterSel, setRosterSel] = useState<Set<Id>>(() => new Set(store.seasonRunners.map((r) => r.id)));

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

  const resolvedMiles = () => (newDistance === 'custom' ? parseFloat(customDistance) : parseFloat(newDistance));

  const start = () => {
    const base = { ...emptySw(), startedAt: Date.now(), rosterIds: [...rosterSel] };
    if (targetType === 'race') {
      let raceId = raceChoice;
      if (raceChoice === 'new') {
        const miles = resolvedMiles();
        if (!Number.isFinite(miles) || miles <= 0) {
          alert('Enter a valid race distance.');
          return;
        }
        raceId = store.addRace({
          seasonId: store.season.id,
          name: newName.trim() || `Race ${formatDate(newDate)}`,
          date: newDate,
          distanceMiles: miles,
          results: [],
        }).id;
      }
      setSw({ ...base, raceId });
      return;
    }
    let practiceId = practiceChoice;
    if (practiceChoice === 'new') {
      const common = { seasonId: store.season.id, date: newDate, entries: [] };
      if (newPracticeType === 'timed_distance') {
        const miles = resolvedMiles();
        if (!Number.isFinite(miles) || miles <= 0) {
          alert('Enter a valid distance.');
          return;
        }
        practiceId = store.addPractice({ ...common, type: 'timed_distance', title: newName.trim() || `Timed ${distanceLabel(miles)}`, distanceMiles: miles }).id;
      } else if (newPracticeType === 'intervals') {
        const reps = parseInt(newReps, 10) || 1;
        const rd = parseFloat(newRepDistance) || 0.25;
        practiceId = store.addPractice({ ...common, type: 'intervals', title: newName.trim() || `${reps} × ${distanceLabel(rd)} repeats`, intervalReps: reps, intervalDistanceMiles: rd }).id;
      } else {
        const min = parseFloat(newMinutes) || 12;
        practiceId = store.addPractice({ ...common, type: 'timed_run', title: newName.trim() || `${min} minute run`, durationMin: min }).id;
      }
    }
    const p = store.data.practices.find((x) => x.id === practiceId);
    const isIntervals = p?.type === 'intervals' || (practiceChoice === 'new' && newPracticeType === 'intervals');
    setSw({ ...base, practiceId, rep: isIntervals ? 1 : 0, repStartedAt: isIntervals ? base.startedAt : null });
  };

  // ---------- Timing actions ----------
  const recordFinish = (runnerId: Id | null) => {
    if (!running || sw.startedAt == null) return;
    const f: Finish = { id: newId(), runnerId, elapsedMs: Date.now() - sw.startedAt };
    setSw((s) => ({ ...s, finishes: [...s.finishes, f] }));
    setToast({ id: f.id, label: `${runnerId ? store.runnerById(runnerId)?.firstName ?? 'Runner' : 'Unassigned'} · ${formatMs(f.elapsedMs, { tenths: true })}`, kind: 'finish' });
    if (navigator.vibrate) navigator.vibrate(30);
  };
  const recordCheckpoint = (runnerId: Id) => {
    if (!running || sw.startedAt == null) return;
    const label = sw.checkpointLabel.trim() || 'Checkpoint';
    const c: Checkpoint = { id: newId(), runnerId, label, elapsedMs: Date.now() - sw.startedAt };
    setSw((s) => ({
      ...s,
      // One split per runner per checkpoint: a second tap replaces the first.
      checkpoints: [...s.checkpoints.filter((x) => !(x.runnerId === runnerId && x.label === label)), c],
    }));
    setToast({ id: c.id, label: `${store.runnerById(runnerId)?.firstName ?? 'Runner'} at ${label} · ${formatMs(c.elapsedMs, { tenths: true })}`, kind: 'checkpoint' });
    if (navigator.vibrate) navigator.vibrate(15);
  };
  const recordLap = (runnerId: Id) => {
    if (!running || sw.repStartedAt == null) return;
    if (sw.laps.some((l) => l.runnerId === runnerId && l.rep === sw.rep)) return;
    const lap: Lap = { id: newId(), runnerId, rep: sw.rep, elapsedMs: Date.now() - sw.repStartedAt };
    setSw((s) => ({ ...s, laps: [...s.laps, lap] }));
    setToast({ id: lap.id, label: `${store.runnerById(runnerId)?.firstName ?? 'Runner'} rep ${sw.rep} · ${formatMs(lap.elapsedMs, { tenths: true })}`, kind: 'lap' });
    if (navigator.vibrate) navigator.vibrate(30);
  };
  const startNextRep = () => setSw((s) => ({ ...s, rep: s.rep + 1, repStartedAt: Date.now() }));
  const removeLap = (id: Id) => setSw((s) => ({ ...s, laps: s.laps.filter((l) => l.id !== id) }));
  const removeCheckpoint = (id: Id) => setSw((s) => ({ ...s, checkpoints: s.checkpoints.filter((c) => c.id !== id) }));
  const undoLast = () => setSw((s) => ({ ...s, finishes: s.finishes.slice(0, -1) }));
  const removeFinish = (id: Id) => setSw((s) => ({ ...s, finishes: s.finishes.filter((f) => f.id !== id) }));
  const assignFinish = (id: Id, runnerId: Id | null) =>
    setSw((s) => ({
      ...s,
      finishes: s.finishes.map((f) => {
        if (f.id === id) return { ...f, runnerId };
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

  const saveRace = () => {
    if (!sw.raceId) return;
    const finishes = [...sw.finishes].sort((a, b) => a.elapsedMs - b.elapsedMs);
    const finishedIds = new Set(finishes.map((f) => f.runnerId).filter(Boolean));
    const splitsFor = (runnerId: Id | null) =>
      runnerId
        ? sw.checkpoints
            .filter((c) => c.runnerId === runnerId)
            .sort((a, b) => a.elapsedMs - b.elapsedMs)
            .map((c) => ({ label: c.label, timeMs: c.elapsedMs }))
        : [];
    store.updateRace(sw.raceId, (r) => ({
      ...r,
      results: [
        ...r.results.filter((x) => x.runnerId && !finishedIds.has(x.runnerId)),
        ...finishes.map((f) => {
          const splits = splitsFor(f.runnerId);
          return { runnerId: f.runnerId, timeMs: f.elapsedMs, ...(splits.length ? { splits } : {}) };
        }),
      ],
    }));
    const raceId = sw.raceId;
    setSw(emptySw());
    navigate(`/races/${raceId}`);
  };

  const savePractice = () => {
    if (!sw.practiceId || !practice) return;
    const id = sw.practiceId;
    if (practice.type === 'timed_distance') {
      const finishes = sw.finishes.filter((f) => f.runnerId);
      store.updatePractice(id, (p) => {
        const entries = p.entries.filter((e) => !finishes.some((f) => f.runnerId === e.runnerId));
        const attendeeIds = new Set(p.attendeeIds ?? []);
        for (const f of finishes) {
          const existing = p.entries.find((e) => e.runnerId === f.runnerId);
          entries.push({ ...(existing ?? { runnerId: f.runnerId as Id }), timeMs: f.elapsedMs });
          attendeeIds.add(f.runnerId as Id);
        }
        return { ...p, entries, attendeeIds: [...attendeeIds] };
      });
    } else if (practice.type === 'intervals') {
      const byRunner = new Map<Id, number[]>();
      for (const l of [...sw.laps].sort((a, b) => a.rep - b.rep)) byRunner.set(l.runnerId, [...(byRunner.get(l.runnerId) ?? []), l.elapsedMs]);
      store.updatePractice(id, (p) => {
        const entries = p.entries.filter((e) => !byRunner.has(e.runnerId));
        const attendeeIds = new Set(p.attendeeIds ?? []);
        for (const [runnerId, splitsMs] of byRunner) {
          const existing = p.entries.find((e) => e.runnerId === runnerId);
          entries.push({ ...(existing ?? { runnerId }), splitsMs });
          attendeeIds.add(runnerId);
        }
        return { ...p, entries, attendeeIds: [...attendeeIds] };
      });
    } else {
      // Timed run: the clock was the countdown; distances get entered on the practice page.
      store.updatePractice(id, (p) => ({ ...p, attendeeIds: [...new Set([...(p.attendeeIds ?? []), ...sw.rosterIds])] }));
    }
    setSw(emptySw());
    navigate(`/practices/${id}`);
  };

  const finishedRunnerIds = useMemo(() => new Set(sw.finishes.map((f) => f.runnerId).filter(Boolean)), [sw.finishes]);
  const roster = useMemo(
    () => sw.rosterIds.map((id) => store.runnerById(id)).filter((r): r is NonNullable<typeof r> => !!r),
    [sw.rosterIds, store],
  );
  const remaining = roster.filter((r) => !finishedRunnerIds.has(r.id));
  const sortedFinishes = [...sw.finishes].sort((a, b) => a.elapsedMs - b.elapsedMs);
  const unassignedCount = sw.finishes.filter((f) => !f.runnerId).length;

  // ---------- Render: setup ----------
  if (!started) {
    const teams: Team[] = ['boys', 'girls', 'other'];
    const timedPractices = store.seasonPractices.filter((p) => p.type !== 'distance_run');
    return (
      <div className="page">
        <h1>Stopwatch</h1>
        <div className="tabs">
          <button className={`tab ${targetType === 'race' ? 'active' : ''}`} onClick={() => setTargetType('race')}>🏁 Race</button>
          <button className={`tab ${targetType === 'practice' ? 'active' : ''}`} onClick={() => setTargetType('practice')}>📋 Practice</button>
        </div>

        {targetType === 'race' ? (
          <section className="card">
            <h2>Race</h2>
            <p className="muted small">Tap a runner's name as they cross the line. Use Checkpoint mode mid-course for coach-only splits.</p>
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
                <DistancePicker value={newDistance} custom={customDistance} onChange={setNewDistance} onCustom={setCustomDistance} />
              </div>
            )}
          </section>
        ) : (
          <section className="card">
            <h2>Practice</h2>
            <p className="muted small">
              Timed distance: tap names as they finish. Intervals: start each rep, tap names as they finish it. Timed run: a countdown, then enter distances.
            </p>
            <label className="field">
              <span>Practice</span>
              <select value={practiceChoice} onChange={(e) => setPracticeChoice(e.target.value)}>
                <option value="new">New practice...</option>
                {timedPractices.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.title} · {formatDate(p.date)} · {practiceTypeLabel(p.type)} {practiceSummary(p)}
                    {p.entries.length ? ` (${p.entries.length} results already)` : ''}
                  </option>
                ))}
              </select>
            </label>
            {practiceChoice === 'new' && (
              <>
                <div className="tabs small">
                  {(['timed_distance', 'intervals', 'timed_run'] as TimedPracticeType[]).map((t) => (
                    <button key={t} className={`tab ${newPracticeType === t ? 'active' : ''}`} onClick={() => setNewPracticeType(t)}>
                      {practiceTypeLabel(t)}
                    </button>
                  ))}
                </div>
                <div className="grid-2">
                  <label className="field">
                    <span>Title</span>
                    <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="optional" />
                  </label>
                  <label className="field">
                    <span>Date</span>
                    <input type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} />
                  </label>
                  {newPracticeType === 'timed_distance' && (
                    <DistancePicker value={newDistance} custom={customDistance} onChange={setNewDistance} onCustom={setCustomDistance} />
                  )}
                  {newPracticeType === 'intervals' && (
                    <>
                      <label className="field">
                        <span>Reps</span>
                        <input type="number" min="1" step="1" value={newReps} onChange={(e) => setNewReps(e.target.value)} />
                      </label>
                      <label className="field">
                        <span>Rep distance</span>
                        <select value={newRepDistance} onChange={(e) => setNewRepDistance(e.target.value)}>
                          {[...DISTANCE_PRESETS].reverse().map((p) => (
                            <option key={p.label} value={String(p.miles)}>{p.label}</option>
                          ))}
                        </select>
                      </label>
                    </>
                  )}
                  {newPracticeType === 'timed_run' && (
                    <label className="field">
                      <span>Minutes</span>
                      <input type="number" min="1" step="1" value={newMinutes} onChange={(e) => setNewMinutes(e.target.value)} />
                    </label>
                  )}
                </div>
              </>
            )}
          </section>
        )}

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
          ▶ Start clock
        </button>
      </div>
    );
  }

  // ---------- Render: timing ----------
  const headerLabel = practice
    ? `${practice.title} · ${practiceTypeLabel(practice.type)} ${practiceSummary(practice)}`
    : race
      ? `${race.name} · ${distanceLabel(race.distanceMiles)}`
      : 'This race or practice was deleted';

  const canSave =
    !!target &&
    (kind === 'race' || kind === 'timed_distance' ? sw.finishes.length > 0 : kind === 'intervals' ? sw.laps.length > 0 : true);

  return (
    <div className="page stopwatch">
      <div className="sw-header">
        <div>
          <div className="muted small">{headerLabel}</div>
          {countdownMs != null ? (
            <div className={`sw-clock ${timeUp ? 'timeup' : running ? 'running' : 'stopped'}`}>
              {timeUp ? 'TIME' : formatMs(countdownMs)}
            </div>
          ) : (
            <div className={`sw-clock ${running ? 'running' : 'stopped'}`}>{formatMs(elapsed, { tenths: true })}</div>
          )}
          {running && (
            <div className="muted small">
              {countdownMs != null && !timeUp ? `${formatMs(elapsed)} elapsed · ` : ''}
              {awake === 'on' ? '☀ Screen held awake' : 'Screen may sleep · clock keeps running'}
            </div>
          )}
        </div>
        <div className="sw-controls">
          {running ? (
            <button className="btn danger" onClick={stop}>■ Stop clock</button>
          ) : (
            <button className="btn" onClick={resume}>▶ Resume</button>
          )}
          {(kind === 'race' || kind === 'timed_distance') && (
            <button className="btn" onClick={undoLast} disabled={sw.finishes.length === 0}>↶ Undo last</button>
          )}
        </div>
      </div>

      {toast && (
        <div className="toast" role="status">
          <span>Recorded {toast.label}</span>
          <button
            className="btn small"
            onClick={() => {
              if (toast.kind === 'checkpoint') removeCheckpoint(toast.id);
              else if (toast.kind === 'lap') removeLap(toast.id);
              else removeFinish(toast.id);
              setToast(null);
            }}
          >
            Undo
          </button>
        </div>
      )}

      {/* ---- Race / timed distance: finish taps ---- */}
      {running && (kind === 'race' || kind === 'timed_distance') && (
        <>
          {kind === 'race' && (
            <div className="mode-row">
              <div className="tabs small">
                <button className={`tab ${sw.mode === 'finish' ? 'active' : ''}`} onClick={() => setSw((s) => ({ ...s, mode: 'finish' }))}>
                  🏁 Finish line
                </button>
                <button className={`tab ${sw.mode === 'checkpoint' ? 'active' : ''}`} onClick={() => setSw((s) => ({ ...s, mode: 'checkpoint' }))}>
                  📍 Checkpoint
                </button>
              </div>
              {sw.mode === 'checkpoint' && (
                <input
                  className="compact checkpoint-label"
                  value={sw.checkpointLabel}
                  onChange={(e) => setSw((s) => ({ ...s, checkpointLabel: e.target.value }))}
                  placeholder="Checkpoint name"
                  aria-label="Checkpoint name"
                />
              )}
            </div>
          )}
          {kind === 'race' && sw.mode === 'checkpoint' && (
            <p className="muted small">
              Tap a runner as they pass <strong>{sw.checkpointLabel.trim() || 'Checkpoint'}</strong>. Splits are for you only and never change results. Switch back to Finish line before the first finisher.
            </p>
          )}
          {(kind !== 'race' || sw.mode === 'finish') && (
            <button className="btn finish-any" onClick={() => recordFinish(null)}>
              FINISH (assign later)
            </button>
          )}
          <div className={`finish-grid ${sw.mode === 'checkpoint' ? 'checkpoint-mode' : ''}`}>
            {remaining.map((r) => {
              const cpMode = kind === 'race' && sw.mode === 'checkpoint';
              const cp = cpMode ? sw.checkpoints.find((c) => c.runnerId === r.id && c.label === (sw.checkpointLabel.trim() || 'Checkpoint')) : undefined;
              return (
                <button
                  key={r.id}
                  className={`btn finish-runner ${cp ? 'checked' : ''}`}
                  onClick={() => (cpMode ? recordCheckpoint(r.id) : recordFinish(r.id))}
                >
                  <span className="finish-name">{r.firstName}</span>
                  <span className="finish-last">{r.lastName}</span>
                  {cp && <span className="finish-cp">📍 {formatMs(cp.elapsedMs)}</span>}
                </button>
              );
            })}
            {remaining.length === 0 && <p className="muted">Everyone on the roster has finished.</p>}
          </div>
        </>
      )}

      {/* ---- Intervals: rep taps ---- */}
      {running && kind === 'intervals' && practice && (
        <>
          <div className="rep-bar">
            <div>
              <div className="stat-label">Rep {sw.rep}{practice.intervalReps ? ` of ${practice.intervalReps}` : ''}</div>
              <div className="rep-clock mono">{sw.repStartedAt ? formatMs(now - sw.repStartedAt, { tenths: true }) : '--'}</div>
            </div>
            <button className="btn primary" onClick={startNextRep}>
              ▶ Start rep {sw.rep + 1}
            </button>
          </div>
          <p className="muted small">Tap each runner as they finish this rep. Rest, then press Start for the next rep.</p>
          <div className="finish-grid">
            {roster.map((r) => {
              const done = sw.laps.find((l) => l.runnerId === r.id && l.rep === sw.rep);
              const count = sw.laps.filter((l) => l.runnerId === r.id).length;
              const last = [...sw.laps].filter((l) => l.runnerId === r.id).sort((a, b) => b.rep - a.rep)[0];
              return (
                <button key={r.id} className={`btn finish-runner ${done ? 'checked' : ''}`} onClick={() => recordLap(r.id)} disabled={!!done}>
                  <span className="finish-name">{r.firstName}</span>
                  <span className="finish-last">{r.lastName}</span>
                  <span className="finish-cp">
                    {done ? `✓ ${formatResult(done.elapsedMs)}` : last ? `last ${formatResult(last.elapsedMs)}` : ''}
                    {count ? ` · ${count} rep${count === 1 ? '' : 's'}` : ''}
                  </span>
                </button>
              );
            })}
          </div>
        </>
      )}

      {/* ---- Timed run: countdown only ---- */}
      {kind === 'timed_run' && (
        <section className="card">
          <p className="muted">
            {timeUp
              ? 'Time is up. Save to mark everyone present, then enter each runner\'s distance on the practice page.'
              : 'Runners go until the countdown hits zero. Nothing to tap here.'}
          </p>
        </section>
      )}

      {/* ---- Finish list (race / timed distance) ---- */}
      {(kind === 'race' || kind === 'timed_distance') && (
        <section className="card">
          <div className="row between">
            <h2>Finishes ({sw.finishes.length}/{roster.length})</h2>
            <span>
              {sw.checkpoints.length > 0 && <span className="badge">{sw.checkpoints.length} checkpoint splits</span>}
              {unassignedCount > 0 && <span className="badge warn">{unassignedCount} unassigned</span>}
            </span>
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
      )}

      {/* ---- Lap list (intervals) ---- */}
      {kind === 'intervals' && sw.laps.length > 0 && (
        <section className="card">
          <h2>Splits so far</h2>
          <table className="table">
            <thead>
              <tr>
                <th>Runner</th>
                <th>Reps</th>
                <th>Avg</th>
              </tr>
            </thead>
            <tbody>
              {roster
                .map((r) => ({ r, laps: sw.laps.filter((l) => l.runnerId === r.id).sort((a, b) => a.rep - b.rep) }))
                .filter((x) => x.laps.length > 0)
                .map(({ r, laps }) => (
                  <tr key={r.id}>
                    <td>{runnerFullName(r)}</td>
                    <td className="mono small">{laps.map((l) => formatResult(l.elapsedMs)).join(', ')}</td>
                    <td className="mono">{formatResult(laps.reduce((a, l) => a + l.elapsedMs, 0) / laps.length)}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </section>
      )}

      <div className="row wrap gap">
        <button className="btn primary" onClick={practice ? savePractice : saveRace} disabled={!canSave}>
          💾 Save to {practice ? 'practice' : 'race'}
        </button>
        <ConfirmButton onConfirm={discard} confirmLabel="Discard everything?">Discard</ConfirmButton>
      </div>
      {!target && <p className="muted">The race or practice this clock was started for no longer exists. Discard to start over.</p>}
    </div>
  );
}

function DistancePicker({ value, custom, onChange, onCustom }: { value: string; custom: string; onChange: (v: string) => void; onCustom: (v: string) => void }) {
  return (
    <>
      <label className="field">
        <span>Distance</span>
        <select value={value} onChange={(e) => onChange(e.target.value)}>
          {DISTANCE_PRESETS.map((p) => (
            <option key={p.label} value={String(p.miles)}>{p.label}</option>
          ))}
          <option value="custom">Custom (miles)</option>
        </select>
      </label>
      {value === 'custom' && (
        <label className="field">
          <span>Miles</span>
          <input type="number" step="0.01" min="0" value={custom} onChange={(e) => onCustom(e.target.value)} />
        </label>
      )}
    </>
  );
}

/** Buzz and beep once when a countdown reaches zero. */
function useTimeUpBuzz(timeUp: boolean) {
  useEffect(() => {
    if (!timeUp) return;
    if (navigator.vibrate) navigator.vibrate([300, 150, 300, 150, 600]);
    try {
      const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) return;
      const ctx = new Ctx();
      [0, 0.35, 0.7].forEach((t) => {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.frequency.value = 880;
        g.gain.value = 0.2;
        o.connect(g).connect(ctx.destination);
        o.start(ctx.currentTime + t);
        o.stop(ctx.currentTime + t + 0.25);
      });
    } catch {
      /* audio not available */
    }
  }, [timeUp]);
}
