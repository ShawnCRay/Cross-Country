import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { runnerFullName, sortRunners, useStore } from '../store';
import type { Team } from '../types';
import { TEAMS, teamLabel } from '../lib/labels';
import { runnerRacePBs, runnerRaceSBs, seasonRaceDistanceLabel } from '../lib/stats';
import { formatMs } from '../lib/time';

export function Runners() {
  const store = useStore();
  const [filter, setFilter] = useState<Team | 'all'>('all');
  const [first, setFirst] = useState('');
  const [last, setLast] = useState('');
  const [team, setTeam] = useState<Team>('boys');
  const [grade, setGrade] = useState('');
  const [showForm, setShowForm] = useState(store.seasonRunners.length === 0);

  const add = (e: FormEvent) => {
    e.preventDefault();
    if (!first.trim() && !last.trim()) return;
    store.addRunner({
      firstName: first.trim(),
      lastName: last.trim(),
      team,
      grade: grade ? parseInt(grade, 10) : undefined,
      seasonIds: [store.season.id],
    });
    setFirst('');
    setLast('');
    setGrade('');
  };

  const roster = store.seasonRunners.filter((r) => filter === 'all' || r.team === filter);
  const pbLabel = seasonRaceDistanceLabel(store.seasonRaces);
  const notOnRoster = sortRunners(store.data.runners.filter((r) => !r.seasonIds.includes(store.season.id)));

  return (
    <div className="page">
      <div className="row between">
        <h1>Runners</h1>
        <button className="btn" onClick={() => setShowForm((s) => !s)}>{showForm ? 'Close' : '+ Add runner'}</button>
      </div>

      {showForm && (
        <form className="card" onSubmit={add}>
          <h2>Add runner to {store.season.name}</h2>
          <div className="grid-2">
            <label className="field">
              <span>First name</span>
              <input value={first} onChange={(e) => setFirst(e.target.value)} autoFocus />
            </label>
            <label className="field">
              <span>Last name</span>
              <input value={last} onChange={(e) => setLast(e.target.value)} />
            </label>
            <label className="field">
              <span>Team</span>
              <select value={team} onChange={(e) => setTeam(e.target.value as Team)}>
                {TEAMS.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Grade</span>
              <input type="number" min="1" max="13" value={grade} onChange={(e) => setGrade(e.target.value)} placeholder="optional" />
            </label>
          </div>
          <button className="btn primary" type="submit">Add runner</button>
        </form>
      )}

      <div className="tabs">
        {(['all', 'boys', 'girls', 'other'] as const).map((t) => (
          <button key={t} className={`tab ${filter === t ? 'active' : ''}`} onClick={() => setFilter(t)}>
            {t === 'all' ? `All (${store.seasonRunners.length})` : `${teamLabel(t)} (${store.seasonRunners.filter((r) => r.team === t).length})`}
          </button>
        ))}
      </div>

      {roster.length === 0 ? (
        <p className="muted">No runners yet. Add your roster above.</p>
      ) : (
        <table className="table roster">
          <thead>
            <tr>
              <th>Runner</th>
              <th>{pbLabel} SB</th>
              <th>{pbLabel} PB</th>
              <th>Races</th>
            </tr>
          </thead>
          <tbody>
            {roster.map((r) => {
              const pbs = runnerRacePBs(store.data, r.id);
              const pb = pbs.get(pbLabel);
              const sb = runnerRaceSBs(store.data, r.id, store.season.id).get(pbLabel);
              const races = store.seasonRaces.filter((x) => x.results.some((res) => res.runnerId === r.id)).length;
              return (
                <tr key={r.id}>
                  <td>
                    <Link to={`/runners/${r.id}`} className="roster-name">{runnerFullName(r)}</Link>
                    <div className="muted small">
                      {teamLabel(r.team)}
                      {r.grade ? ` · Grade ${r.grade}` : ''}
                    </div>
                  </td>
                  <td className="mono">{sb ? formatMs(sb.result.timeMs) : '--'}</td>
                  <td className="mono">{pb ? formatMs(pb.result.timeMs) : '--'}</td>
                  <td>{races}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {notOnRoster.length > 0 && (
        <section className="card">
          <h2>Not on this season's roster</h2>
          <p className="muted">Runners from other seasons. Add them to carry their history into {store.season.name}.</p>
          <ul className="list">
            {notOnRoster.map((r) => (
              <li key={r.id} className="row between">
                <Link to={`/runners/${r.id}`}>{runnerFullName(r)}</Link>
                <button className="btn small" onClick={() => store.updateRunner(r.id, { seasonIds: [...r.seasonIds, store.season.id] })}>
                  Add to roster
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
