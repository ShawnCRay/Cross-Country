import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { runnerFullName, useStore } from '../store';
import type { RaceResult, Team } from '../types';
import { raceBadge, sortedResults } from '../lib/stats';
import { distanceLabel, formatDate, formatPace, formatResult } from '../lib/time';
import { TimeInput } from '../components/TimeInput';
import { NumberInput } from '../components/NumberInput';
import { ConfirmButton } from '../components/ConfirmButton';
import { teamLabel } from '../lib/labels';

export function RaceDetail() {
  const { id = '' } = useParams();
  const store = useStore();
  const navigate = useNavigate();
  const race = store.data.races.find((r) => r.id === id);
  const [editing, setEditing] = useState(false);
  const [teamFilter, setTeamFilter] = useState<Team | 'all'>('all');

  if (!race) {
    return (
      <div className="page">
        <p>Race not found.</p>
        <Link to="/races">Back to races</Link>
      </div>
    );
  }

  const results = sortedResults(race);
  const setResult = (index: number, patch: Partial<RaceResult>) =>
    store.updateRace(race.id, (r) => {
      const sorted = sortedResults(r);
      const target = sorted[index];
      return { ...r, results: r.results.map((x) => (x === target ? { ...x, ...patch } : x)) };
    });
  const removeResult = (index: number) =>
    store.updateRace(race.id, (r) => {
      const target = sortedResults(r)[index];
      return { ...r, results: r.results.filter((x) => x !== target) };
    });
  const addResult = () =>
    store.updateRace(race.id, (r) => ({
      ...r,
      results: [...r.results, { runnerId: null, timeMs: (sortedResults(r).at(-1)?.timeMs ?? 0) + 1000 }],
    }));

  const assignedIds = new Set(results.map((x) => x.runnerId).filter(Boolean));
  const rosterOptions = [...store.seasonRunners];
  for (const x of results) {
    if (x.runnerId && !rosterOptions.some((r) => r.id === x.runnerId)) {
      const r = store.runnerById(x.runnerId);
      if (r) rosterOptions.push(r);
    }
  }

  const teamOf = (x: RaceResult) => store.runnerById(x.runnerId)?.team;
  const visible = results
    .map((x, i) => ({ x, i }))
    .filter(({ x }) => teamFilter === 'all' || teamOf(x) === teamFilter);

  // Team summary: top 5 average and 1-5 spread per team.
  const teams = (['boys', 'girls', 'other'] as Team[]).filter((t) => results.some((x) => teamOf(x) === t));
  const teamStats = teams.map((t) => {
    const times = results.filter((x) => teamOf(x) === t).map((x) => x.timeMs);
    const top5 = times.slice(0, 5);
    const avg = top5.reduce((a, b) => a + b, 0) / top5.length;
    return { team: t, count: times.length, avg, spread: top5.length >= 2 ? top5[top5.length - 1] - top5[0] : null };
  });

  return (
    <div className="page">
      <Link to="/races" className="back">← Races</Link>
      <div className="row between">
        <div>
          <h1>{race.name}</h1>
          <p className="muted">
            {formatDate(race.date, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })} · {distanceLabel(race.distanceMiles)}
            {race.location ? ` · ${race.location}` : ''}
          </p>
        </div>
        <div className="row gap">
          <Link to={`/stopwatch?race=${race.id}`} className="btn">⏱ Time this race</Link>
          <button className="btn" onClick={() => setEditing((e) => !e)}>{editing ? 'Done' : 'Edit'}</button>
        </div>
      </div>

      {editing && (
        <section className="card">
          <div className="grid-2">
            <label className="field">
              <span>Name</span>
              <input value={race.name} onChange={(e) => store.updateRace(race.id, { name: e.target.value })} />
            </label>
            <label className="field">
              <span>Date</span>
              <input type="date" value={race.date} onChange={(e) => store.updateRace(race.id, { date: e.target.value })} />
            </label>
            <label className="field">
              <span>Location</span>
              <input value={race.location ?? ''} onChange={(e) => store.updateRace(race.id, { location: e.target.value || undefined })} />
            </label>
            <label className="field">
              <span>Distance (miles)</span>
              <NumberInput value={race.distanceMiles} onChange={(v) => v && store.updateRace(race.id, { distanceMiles: v })} />
            </label>
          </div>
          <label className="field">
            <span>Notes</span>
            <textarea rows={3} value={race.notes ?? ''} onChange={(e) => store.updateRace(race.id, { notes: e.target.value })} />
          </label>
          <ConfirmButton
            confirmLabel="Delete this race and its results?"
            onConfirm={() => {
              store.deleteRace(race.id);
              navigate('/races');
            }}
          >
            Delete race
          </ConfirmButton>
        </section>
      )}
      {race.notes && !editing && <p className="notes">{race.notes}</p>}

      {teamStats.length > 0 && (
        <section className="stat-row">
          {teamStats.map((s) => (
            <div className="stat" key={s.team}>
              <div className="stat-label">{teamLabel(s.team)} · {s.count} finishers</div>
              <div className="stat-value mono">{formatResult(s.avg)}</div>
              <div className="stat-sub">
                top {Math.min(5, s.count)} avg{s.spread != null ? ` · 1-${Math.min(5, s.count)} spread ${formatResult(s.spread)}` : ''}
              </div>
            </div>
          ))}
        </section>
      )}

      <section className="card">
        <div className="row between">
          <h2>Results ({results.length})</h2>
          {teams.length > 1 && (
            <div className="tabs small">
              <button className={`tab ${teamFilter === 'all' ? 'active' : ''}`} onClick={() => setTeamFilter('all')}>All</button>
              {teams.map((t) => (
                <button key={t} className={`tab ${teamFilter === t ? 'active' : ''}`} onClick={() => setTeamFilter(t)}>
                  {teamLabel(t)}
                </button>
              ))}
            </div>
          )}
        </div>
        {results.length === 0 ? (
          <p className="muted">No results yet. Use the stopwatch on race day or add results by hand.</p>
        ) : (
          <table className="table results">
            <thead>
              <tr>
                <th>#</th>
                <th>Runner</th>
                <th>Time</th>
                <th>Pace</th>
                <th>Overall</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {visible.map(({ x, i }) => (
                <tr key={i} className={x.runnerId ? '' : 'unassigned'}>
                  <td className="muted">{i + 1}</td>
                  <td>
                    <select value={x.runnerId ?? ''} onChange={(e) => setResult(i, { runnerId: e.target.value || null })}>
                      <option value="">— Unassigned —</option>
                      {rosterOptions.map((r) => (
                        <option key={r.id} value={r.id}>
                          {runnerFullName(r)}
                          {assignedIds.has(r.id) && r.id !== x.runnerId ? ' (already placed)' : ''}
                        </option>
                      ))}
                    </select>
                    {x.runnerId && <Link to={`/runners/${x.runnerId}`} className="small" title="View runner"> ↗</Link>}
                  </td>
                  <td>
                    <TimeInput valueMs={x.timeMs} onChange={(ms) => ms != null && setResult(i, { timeMs: ms })} className="compact" />
                    {x.runnerId && (() => {
                      const b = raceBadge(store.data, x.runnerId, race, x.timeMs);
                      return b ? <span className={`badge ${b === 'PB' ? 'pb' : 'sb'}`}>{b}</span> : null;
                    })()}
                  </td>
                  <td className="mono">{formatPace(x.timeMs, race.distanceMiles)}</td>
                  <td>
                    <NumberInput value={x.place} step={1} min={1} onChange={(v) => setResult(i, { place: v })} placeholder="place" className="compact narrow" />
                  </td>
                  <td>
                    <button className="btn icon" title="Remove" onClick={() => removeResult(i)}>✕</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <button className="btn" onClick={addResult}>+ Add result</button>
      </section>
    </div>
  );
}
