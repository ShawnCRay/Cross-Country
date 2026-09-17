import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useStore } from '../store';
import type { PracticeType } from '../types';
import { PRACTICE_TYPES, practiceSummary, practiceTypeLabel } from '../lib/labels';
import { DISTANCE_PRESETS, distanceLabel, formatDate, todayIso } from '../lib/time';

export function Practices() {
  const store = useStore();
  const navigate = useNavigate();
  const [showForm, setShowForm] = useState(false);
  const [type, setType] = useState<PracticeType>('timed_run');
  const [date, setDate] = useState(todayIso());
  const [title, setTitle] = useState('');
  const [duration, setDuration] = useState('12');
  const [distance, setDistance] = useState('1');
  const [customDistance, setCustomDistance] = useState('');
  const [reps, setReps] = useState('6');
  const [repDistance, setRepDistance] = useState('0.2485');

  const resolvedDistance = () => (distance === 'custom' ? parseFloat(customDistance) : parseFloat(distance));

  const defaultTitle = () => {
    switch (type) {
      case 'timed_run':
        return `${duration} minute run`;
      case 'timed_distance':
        return `Timed ${distanceLabel(resolvedDistance())}`;
      case 'intervals':
        return `${reps} × ${distanceLabel(parseFloat(repDistance))} repeats`;
      case 'distance_run':
        return distance === 'none' ? 'Distance run' : `${distanceLabel(resolvedDistance())} run`;
    }
  };

  const create = (e: FormEvent) => {
    e.preventDefault();
    const base = { seasonId: store.season.id, date, type, title: title.trim() || defaultTitle(), entries: [] };
    let practice;
    switch (type) {
      case 'timed_run':
        practice = store.addPractice({ ...base, durationMin: parseFloat(duration) || 0 });
        break;
      case 'timed_distance':
        practice = store.addPractice({ ...base, distanceMiles: resolvedDistance() || 1 });
        break;
      case 'intervals':
        practice = store.addPractice({ ...base, intervalDistanceMiles: parseFloat(repDistance) || 0.25, intervalReps: parseInt(reps, 10) || 1 });
        break;
      case 'distance_run':
        practice = store.addPractice({ ...base, distanceMiles: distance === 'none' ? undefined : resolvedDistance() || undefined });
        break;
    }
    navigate(`/practices/${practice.id}`);
  };

  return (
    <div className="page">
      <div className="row between">
        <h1>Practices</h1>
        <button className="btn" onClick={() => setShowForm((s) => !s)}>{showForm ? 'Close' : '+ New practice'}</button>
      </div>

      {showForm && (
        <form className="card" onSubmit={create}>
          <div className="type-picker">
            {PRACTICE_TYPES.map((t) => (
              <button
                type="button"
                key={t.value}
                className={`type-option ${type === t.value ? 'active' : ''}`}
                onClick={() => setType(t.value)}
              >
                <strong>{t.label}</strong>
                <span>{t.help}</span>
              </button>
            ))}
          </div>
          <div className="grid-2">
            <label className="field">
              <span>Date</span>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </label>
            <label className="field">
              <span>Title</span>
              <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={defaultTitle()} />
            </label>
            {type === 'timed_run' && (
              <label className="field">
                <span>Minutes</span>
                <input type="number" min="1" step="1" value={duration} onChange={(e) => setDuration(e.target.value)} />
              </label>
            )}
            {(type === 'timed_distance' || type === 'distance_run') && (
              <>
                <label className="field">
                  <span>Distance</span>
                  <select value={distance} onChange={(e) => setDistance(e.target.value)}>
                    {type === 'distance_run' && <option value="none">Not set (each runner logs their own)</option>}
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
              </>
            )}
            {type === 'intervals' && (
              <>
                <label className="field">
                  <span>Reps</span>
                  <input type="number" min="1" step="1" value={reps} onChange={(e) => setReps(e.target.value)} />
                </label>
                <label className="field">
                  <span>Rep distance</span>
                  <select value={repDistance} onChange={(e) => setRepDistance(e.target.value)}>
                    {[...DISTANCE_PRESETS].reverse().map((p) => (
                      <option key={p.label} value={String(p.miles)}>{p.label}</option>
                    ))}
                  </select>
                </label>
              </>
            )}
          </div>
          <button className="btn primary" type="submit">Create practice</button>
        </form>
      )}

      {store.seasonPractices.length === 0 ? (
        <p className="muted">No practices logged for {store.season.name} yet.</p>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Practice</th>
              <th>Type</th>
              <th>Workout</th>
              <th>Present</th>
              <th>Results</th>
            </tr>
          </thead>
          <tbody>
            {store.seasonPractices.map((p) => (
              <tr key={p.id}>
                <td>{formatDate(p.date)}</td>
                <td><Link to={`/practices/${p.id}`}>{p.title}</Link></td>
                <td>{practiceTypeLabel(p.type)}</td>
                <td>{practiceSummary(p)}</td>
                <td>{new Set([...(p.attendeeIds ?? []), ...p.entries.map((e) => e.runnerId)]).size}</td>
                <td>{p.entries.length}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
