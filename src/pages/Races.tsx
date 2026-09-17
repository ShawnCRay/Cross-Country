import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useStore } from '../store';
import { DISTANCE_PRESETS, distanceLabel, formatDate, formatMs, todayIso } from '../lib/time';
import { sortedResults } from '../lib/stats';

export function Races() {
  const store = useStore();
  const navigate = useNavigate();
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [date, setDate] = useState(todayIso());
  const [location, setLocation] = useState('');
  const [distance, setDistance] = useState(String(DISTANCE_PRESETS[0].miles));
  const [customDistance, setCustomDistance] = useState('');

  const create = (e: FormEvent) => {
    e.preventDefault();
    const miles = distance === 'custom' ? parseFloat(customDistance) : parseFloat(distance);
    if (!Number.isFinite(miles) || miles <= 0) return;
    const race = store.addRace({
      seasonId: store.season.id,
      name: name.trim() || `Race ${formatDate(date)}`,
      date,
      location: location.trim() || undefined,
      distanceMiles: miles,
      results: [],
    });
    navigate(`/races/${race.id}`);
  };

  return (
    <div className="page">
      <div className="row between">
        <h1>Races</h1>
        <div className="row gap">
          <Link to="/stopwatch" className="btn">⏱ Stopwatch</Link>
          <button className="btn" onClick={() => setShowForm((s) => !s)}>{showForm ? 'Close' : '+ New race'}</button>
        </div>
      </div>

      {showForm && (
        <form className="card" onSubmit={create}>
          <div className="grid-2">
            <label className="field">
              <span>Name</span>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. County Invitational" autoFocus />
            </label>
            <label className="field">
              <span>Date</span>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </label>
            <label className="field">
              <span>Location</span>
              <input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="optional" />
            </label>
            <label className="field">
              <span>Distance</span>
              <select value={distance} onChange={(e) => setDistance(e.target.value)}>
                {DISTANCE_PRESETS.map((p) => (
                  <option key={p.label} value={String(p.miles)}>{p.label}</option>
                ))}
                <option value="custom">Custom (miles)</option>
              </select>
            </label>
            {distance === 'custom' && (
              <label className="field">
                <span>Miles</span>
                <input type="number" step="0.01" min="0" value={customDistance} onChange={(e) => setCustomDistance(e.target.value)} />
              </label>
            )}
          </div>
          <button className="btn primary" type="submit">Create race</button>
        </form>
      )}

      {store.seasonRaces.length === 0 ? (
        <p className="muted">No races for {store.season.name} yet. Create one here or start the stopwatch on race day.</p>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Race</th>
              <th>Dist</th>
              <th>Finishers</th>
              <th>Top time</th>
            </tr>
          </thead>
          <tbody>
            {store.seasonRaces.map((r) => {
              const top = sortedResults(r)[0];
              return (
                <tr key={r.id}>
                  <td>{formatDate(r.date)}</td>
                  <td>
                    <Link to={`/races/${r.id}`}>{r.name}</Link>
                    {r.location && <span className="muted small"> · {r.location}</span>}
                  </td>
                  <td>{distanceLabel(r.distanceMiles)}</td>
                  <td>{r.results.length}</td>
                  <td className="mono">{top ? `${formatMs(top.timeMs)} ${store.runnerName(top.runnerId)}` : '--'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
