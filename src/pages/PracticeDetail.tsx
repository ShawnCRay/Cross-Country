import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { runnerFullName, useStore } from '../store';
import type { PracticeEntry, Runner } from '../types';
import { averageSplit, isPracticePB } from '../lib/stats';
import { distanceLabel, fmtMiles, formatMs, formatPace, parseTime } from '../lib/time';
import { TimeInput } from '../components/TimeInput';
import { NumberInput } from '../components/NumberInput';
import { ConfirmButton } from '../components/ConfirmButton';
import { practiceSummary, practiceTypeLabel } from '../lib/labels';

function SplitsInput({ value, onChange }: { value: number[] | undefined; onChange: (v: number[] | undefined) => void }) {
  const display = value?.map((s) => formatMs(s, { tenths: s % 1000 !== 0 })).join(', ') ?? '';
  const [text, setText] = useState(display);
  const [invalid, setInvalid] = useState(false);
  const [lastDisplay, setLastDisplay] = useState(display);
  if (display !== lastDisplay) {
    setLastDisplay(display);
    setText(display);
  }
  const commit = () => {
    const parts = text.split(/[,\s]+/).filter(Boolean);
    if (parts.length === 0) {
      setInvalid(false);
      if (value?.length) onChange(undefined);
      return;
    }
    const ms = parts.map(parseTime);
    if (ms.some((m) => m == null)) {
      setInvalid(true);
      return;
    }
    setInvalid(false);
    onChange(ms as number[]);
  };
  return (
    <input
      className={`time-input ${invalid ? 'invalid' : ''}`}
      value={text}
      placeholder="1:32, 1:35, 1:33"
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
    />
  );
}

export function PracticeDetail() {
  const { id = '' } = useParams();
  const store = useStore();
  const navigate = useNavigate();
  const practice = store.data.practices.find((p) => p.id === id);
  const [editing, setEditing] = useState(false);
  const [sortBy, setSortBy] = useState<'name' | 'result'>('name');

  if (!practice) {
    return (
      <div className="page">
        <p>Practice not found.</p>
        <Link to="/practices">Back to practices</Link>
      </div>
    );
  }

  const entryFor = (r: Runner): PracticeEntry | undefined => practice.entries.find((e) => e.runnerId === r.id);
  const setEntry = (runnerId: string, patch: Partial<PracticeEntry>) =>
    store.updatePractice(practice.id, (p) => {
      const existing = p.entries.find((e) => e.runnerId === runnerId);
      const merged: PracticeEntry = { ...(existing ?? { runnerId }), ...patch };
      const hasValue = merged.distanceMiles != null || merged.timeMs != null || (merged.splitsMs?.length ?? 0) > 0 || !!merged.notes;
      const others = p.entries.filter((e) => e.runnerId !== runnerId);
      return { ...p, entries: hasValue ? [...others, merged] : others };
    });

  // Season roster plus anyone with an entry (in case they left the roster).
  const runners = [...store.seasonRunners];
  for (const e of practice.entries) {
    if (!runners.some((r) => r.id === e.runnerId)) {
      const r = store.runnerById(e.runnerId);
      if (r) runners.push(r);
    }
  }

  const score = (e: PracticeEntry | undefined): number | null => {
    if (!e) return null;
    switch (practice.type) {
      case 'timed_run':
        return e.distanceMiles != null ? -e.distanceMiles : null;
      case 'timed_distance':
        return e.timeMs ?? null;
      case 'intervals':
        return averageSplit(e.splitsMs);
      case 'distance_run':
        return e.distanceMiles != null ? -e.distanceMiles : null;
    }
  };
  const ranked = runners
    .map((r) => ({ r, e: entryFor(r), s: score(entryFor(r)) }))
    .sort((a, b) => {
      if (sortBy === 'result') {
        if (a.s == null && b.s == null) return 0;
        if (a.s == null) return 1;
        if (b.s == null) return -1;
        return a.s - b.s;
      }
      return 0;
    });
  const rankOf = new Map<string, number>();
  [...ranked]
    .filter((x) => x.s != null)
    .sort((a, b) => (a.s as number) - (b.s as number))
    .forEach((x, i) => rankOf.set(x.r.id, i + 1));

  const durationMs = (practice.durationMin ?? 0) * 60000;

  return (
    <div className="page">
      <Link to="/practices" className="back">← Practices</Link>
      <div className="row between">
        <div>
          <h1>{practice.title}</h1>
          <p className="muted">
            {new Date(practice.date + 'T00:00').toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })} ·{' '}
            {practiceTypeLabel(practice.type)} · {practiceSummary(practice)}
          </p>
        </div>
        <button className="btn" onClick={() => setEditing((e) => !e)}>{editing ? 'Done' : 'Edit'}</button>
      </div>

      {editing && (
        <section className="card">
          <div className="grid-2">
            <label className="field">
              <span>Title</span>
              <input value={practice.title} onChange={(e) => store.updatePractice(practice.id, { title: e.target.value })} />
            </label>
            <label className="field">
              <span>Date</span>
              <input type="date" value={practice.date} onChange={(e) => store.updatePractice(practice.id, { date: e.target.value })} />
            </label>
            {practice.type === 'timed_run' && (
              <label className="field">
                <span>Minutes</span>
                <NumberInput value={practice.durationMin} step={1} onChange={(v) => store.updatePractice(practice.id, { durationMin: v })} />
              </label>
            )}
            {(practice.type === 'timed_distance' || practice.type === 'distance_run') && (
              <label className="field">
                <span>Distance (miles)</span>
                <NumberInput value={practice.distanceMiles} onChange={(v) => store.updatePractice(practice.id, { distanceMiles: v })} />
              </label>
            )}
            {practice.type === 'intervals' && (
              <>
                <label className="field">
                  <span>Reps</span>
                  <NumberInput value={practice.intervalReps} step={1} onChange={(v) => store.updatePractice(practice.id, { intervalReps: v })} />
                </label>
                <label className="field">
                  <span>Rep distance (miles)</span>
                  <NumberInput value={practice.intervalDistanceMiles} onChange={(v) => store.updatePractice(practice.id, { intervalDistanceMiles: v })} />
                </label>
              </>
            )}
          </div>
          <label className="field">
            <span>Notes</span>
            <textarea rows={3} value={practice.notes ?? ''} onChange={(e) => store.updatePractice(practice.id, { notes: e.target.value })} />
          </label>
          <ConfirmButton
            confirmLabel="Delete this practice?"
            onConfirm={() => {
              store.deletePractice(practice.id);
              navigate('/practices');
            }}
          >
            Delete practice
          </ConfirmButton>
        </section>
      )}
      {practice.notes && !editing && <p className="notes">{practice.notes}</p>}

      <section className="card">
        <div className="row between">
          <h2>Results ({practice.entries.length}/{runners.length})</h2>
          <div className="tabs small">
            <button className={`tab ${sortBy === 'name' ? 'active' : ''}`} onClick={() => setSortBy('name')}>By name</button>
            <button className={`tab ${sortBy === 'result' ? 'active' : ''}`} onClick={() => setSortBy('result')}>By result</button>
          </div>
        </div>
        {runners.length === 0 ? (
          <p className="muted">
            No runners on the roster. <Link to="/runners">Add runners</Link> first.
          </p>
        ) : (
          <table className="table results">
            <thead>
              <tr>
                <th>#</th>
                <th>Runner</th>
                {practice.type === 'timed_run' && (
                  <>
                    <th>Miles</th>
                    <th>Pace</th>
                  </>
                )}
                {practice.type === 'timed_distance' && (
                  <>
                    <th>Time</th>
                    <th>Pace</th>
                  </>
                )}
                {practice.type === 'intervals' && (
                  <>
                    <th>Splits</th>
                    <th>Avg</th>
                  </>
                )}
                {practice.type === 'distance_run' && (
                  <>
                    <th>Miles</th>
                    <th>Time</th>
                    <th>Pace</th>
                  </>
                )}
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              {ranked.map(({ r, e }) => (
                <tr key={r.id}>
                  <td className="muted">{rankOf.get(r.id) ?? ''}</td>
                  <td><Link to={`/runners/${r.id}`}>{runnerFullName(r)}</Link></td>
                  {practice.type === 'timed_run' && (
                    <>
                      <td><NumberInput value={e?.distanceMiles} onChange={(v) => setEntry(r.id, { distanceMiles: v })} placeholder="mi" className="compact" /></td>
                      <td className="mono">{e?.distanceMiles != null ? formatPace(durationMs, e.distanceMiles) : ''}</td>
                    </>
                  )}
                  {practice.type === 'timed_distance' && (
                    <>
                      <td>
                        <TimeInput valueMs={e?.timeMs} onChange={(ms) => setEntry(r.id, { timeMs: ms })} className="compact" />
                        {e?.timeMs != null && isPracticePB(store.data, r.id, practice, e.timeMs) && <span className="badge pb">PB</span>}
                      </td>
                      <td className="mono">{e?.timeMs != null ? formatPace(e.timeMs, practice.distanceMiles) : ''}</td>
                    </>
                  )}
                  {practice.type === 'intervals' && (
                    <>
                      <td><SplitsInput value={e?.splitsMs} onChange={(v) => setEntry(r.id, { splitsMs: v })} /></td>
                      <td className="mono">
                        {e?.splitsMs?.length ? `${formatMs(averageSplit(e.splitsMs) ?? 0)} (${e.splitsMs.length}/${practice.intervalReps ?? '?'})` : ''}
                      </td>
                    </>
                  )}
                  {practice.type === 'distance_run' && (
                    <>
                      <td><NumberInput value={e?.distanceMiles} onChange={(v) => setEntry(r.id, { distanceMiles: v })} placeholder="mi" className="compact" /></td>
                      <td><TimeInput valueMs={e?.timeMs} onChange={(ms) => setEntry(r.id, { timeMs: ms })} className="compact" placeholder="optional" /></td>
                      <td className="mono">{e?.timeMs != null && e.distanceMiles ? formatPace(e.timeMs, e.distanceMiles) : ''}</td>
                    </>
                  )}
                  <td>
                    <input
                      className="compact"
                      value={e?.notes ?? ''}
                      placeholder="notes"
                      onChange={(ev) => setEntry(r.id, { notes: ev.target.value || undefined })}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {practice.type === 'distance_run' && practice.distanceMiles && (
          <p className="muted small">
            Planned distance {distanceLabel(practice.distanceMiles)}.{' '}
            <button
              className="link"
              onClick={() =>
                store.updatePractice(practice.id, (p) => ({
                  ...p,
                  entries: runners.map((r) => ({ ...(p.entries.find((x) => x.runnerId === r.id) ?? { runnerId: r.id }), distanceMiles: p.entries.find((x) => x.runnerId === r.id)?.distanceMiles ?? p.distanceMiles })),
                }))
              }
            >
              Fill {fmtMiles(practice.distanceMiles)} for everyone without a distance
            </button>
          </p>
        )}
      </section>
    </div>
  );
}
