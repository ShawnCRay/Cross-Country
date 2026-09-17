import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useStore } from '../store';
import type { Team } from '../types';
import { raceBadge, runnerPracticeHistory, runnerPracticePBs, runnerRaceHistory, runnerRacePBs, runnerRaceSBs, seasonMileage } from '../lib/stats';
import { distanceLabel, fmtMiles, formatDate, formatMs, formatPace } from '../lib/time';
import { LineChart } from '../components/LineChart';
import { ConfirmButton } from '../components/ConfirmButton';
import { practiceTypeLabel, teamLabel } from '../lib/labels';
import { describeEntry } from '../lib/describe';

export function RunnerDetail() {
  const { id = '' } = useParams();
  const store = useStore();
  const navigate = useNavigate();
  const runner = store.runnerById(id);
  const [editing, setEditing] = useState(false);

  const raceHistory = useMemo(() => (runner ? runnerRaceHistory(store.data, runner.id) : []), [store.data, runner]);
  const racePBs = useMemo(() => (runner ? runnerRacePBs(store.data, runner.id) : new Map()), [store.data, runner]);
  const raceSBs = useMemo(
    () => (runner ? runnerRaceSBs(store.data, runner.id, store.season.id) : new Map()),
    [store.data, runner, store.season.id],
  );
  const practiceHistory = useMemo(() => (runner ? runnerPracticeHistory(store.data, runner.id) : []), [store.data, runner]);
  const practicePBs = useMemo(() => (runner ? runnerPracticePBs(store.data, runner.id) : []), [store.data, runner]);

  const distances = useMemo(() => {
    const counts = new Map<string, number>();
    for (const m of raceHistory) {
      const l = distanceLabel(m.race.distanceMiles);
      counts.set(l, (counts.get(l) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).map((x) => x[0]);
  }, [raceHistory]);
  const [chartDist, setChartDist] = useState<string | null>(null);
  const activeDist = chartDist ?? distances[0] ?? null;

  const timedMileHistory = practiceHistory.filter(
    (m) => m.practice.type === 'timed_distance' && m.entry.timeMs != null && distanceLabel(m.practice.distanceMiles) === '1 mi',
  );

  if (!runner) {
    return (
      <div className="page">
        <p>Runner not found.</p>
        <Link to="/runners">Back to runners</Link>
      </div>
    );
  }

  const onRoster = runner.seasonIds.includes(store.season.id);
  const mileage = seasonMileage(store.data, runner.id, store.season.id);
  const seasonRaceCount = raceHistory.filter((m) => m.race.seasonId === store.season.id).length;
  const seasonPracticeCount = practiceHistory.filter((m) => m.practice.seasonId === store.season.id).length;

  return (
    <div className="page">
      <Link to="/runners" className="back">← Runners</Link>
      <div className="row between">
        <div>
          <h1>
            {runner.firstName} {runner.lastName}
          </h1>
          <p className="muted">
            {teamLabel(runner.team)}
            {runner.grade ? ` · Grade ${runner.grade}` : ''}
            {onRoster ? '' : ` · not on ${store.season.name} roster`}
          </p>
        </div>
        <button className="btn" onClick={() => setEditing((e) => !e)}>{editing ? 'Done' : 'Edit'}</button>
      </div>

      {editing && (
        <section className="card">
          <div className="grid-2">
            <label className="field">
              <span>First name</span>
              <input value={runner.firstName} onChange={(e) => store.updateRunner(runner.id, { firstName: e.target.value })} />
            </label>
            <label className="field">
              <span>Last name</span>
              <input value={runner.lastName} onChange={(e) => store.updateRunner(runner.id, { lastName: e.target.value })} />
            </label>
            <label className="field">
              <span>Team</span>
              <select value={runner.team} onChange={(e) => store.updateRunner(runner.id, { team: e.target.value as Team })}>
                <option value="boys">Boys</option>
                <option value="girls">Girls</option>
                <option value="other">Other</option>
              </select>
            </label>
            <label className="field">
              <span>Grade</span>
              <input
                type="number"
                min="1"
                max="13"
                value={runner.grade ?? ''}
                onChange={(e) => store.updateRunner(runner.id, { grade: e.target.value ? parseInt(e.target.value, 10) : undefined })}
              />
            </label>
          </div>
          <label className="field">
            <span>Notes</span>
            <textarea value={runner.notes ?? ''} onChange={(e) => store.updateRunner(runner.id, { notes: e.target.value })} rows={3} />
          </label>
          <div className="row wrap gap">
            {onRoster ? (
              <button
                className="btn"
                onClick={() => store.updateRunner(runner.id, { seasonIds: runner.seasonIds.filter((s) => s !== store.season.id) })}
              >
                Remove from {store.season.name} roster
              </button>
            ) : (
              <button className="btn" onClick={() => store.updateRunner(runner.id, { seasonIds: [...runner.seasonIds, store.season.id] })}>
                Add to {store.season.name} roster
              </button>
            )}
            <ConfirmButton
              confirmLabel="Delete runner and all their results?"
              onConfirm={() => {
                store.deleteRunner(runner.id);
                navigate('/runners');
              }}
            >
              Delete runner
            </ConfirmButton>
          </div>
        </section>
      )}

      {runner.notes && !editing && <p className="notes">{runner.notes}</p>}

      <section className="stat-row">
        {[...racePBs.entries()].map(([label, m]) => {
          const sb = raceSBs.get(label);
          return (
            <div className="stat" key={label}>
              <div className="stat-label">{label} PB</div>
              <div className="stat-value mono">{formatMs(m.result.timeMs)}</div>
              <div className="stat-sub">{m.race.name} · {formatDate(m.race.date, { month: 'short', day: 'numeric' })}</div>
              <div className="stat-divider" />
              <div className="stat-label">{label} SB · {store.season.name}</div>
              <div className="stat-value mono small-value">{sb ? formatMs(sb.result.timeMs) : '--'}</div>
              {sb && <div className="stat-sub">{sb.race.name} · {formatDate(sb.race.date, { month: 'short', day: 'numeric' })}</div>}
            </div>
          );
        })}
        {practicePBs.map((pb) => (
          <div className="stat" key={pb.key}>
            <div className="stat-label">{pb.label}</div>
            <div className="stat-value mono">{pb.valueMs != null ? formatMs(pb.valueMs) : fmtMiles(pb.valueMiles)}</div>
            <div className="stat-sub">{formatDate(pb.practice.date, { month: 'short', day: 'numeric' })}</div>
          </div>
        ))}
        <div className="stat">
          <div className="stat-label">{store.season.name}</div>
          <div className="stat-value text">{seasonRaceCount} races · {seasonPracticeCount} practices</div>
          <div className="stat-sub">{fmtMiles(mileage)} logged</div>
        </div>
      </section>

      {raceHistory.length > 1 && (
        <section className="card">
          <div className="row between">
            <h2>Race progress</h2>
            {distances.length > 1 && (
              <select value={activeDist ?? ''} onChange={(e) => setChartDist(e.target.value)}>
                {distances.map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            )}
          </div>
          <LineChart
            points={raceHistory
              .filter((m) => distanceLabel(m.race.distanceMiles) === activeDist)
              .map((m) => ({ date: m.race.date, value: m.result.timeMs, label: m.race.name }))}
            formatValue={(v) => formatMs(v)}
          />
        </section>
      )}

      {timedMileHistory.length > 1 && (
        <section className="card">
          <h2>Timed mile progress</h2>
          <LineChart
            points={timedMileHistory.map((m) => ({ date: m.practice.date, value: m.entry.timeMs as number, label: m.practice.title }))}
            formatValue={(v) => formatMs(v)}
          />
        </section>
      )}

      <section className="card">
        <h2>Race history</h2>
        {raceHistory.length === 0 ? (
          <p className="muted">No races yet.</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Race</th>
                <th>Dist</th>
                <th>Time</th>
                <th>Pace</th>
                <th>Place</th>
              </tr>
            </thead>
            <tbody>
              {[...raceHistory].reverse().map((m) => {
                const badge = raceBadge(store.data, runner.id, m.race, m.result.timeMs);
                return (
                  <tr key={m.race.id}>
                    <td className="nowrap">{formatDate(m.race.date, { month: 'short', day: 'numeric' })}</td>
                    <td><Link to={`/races/${m.race.id}`}>{m.race.name}</Link></td>
                    <td>{distanceLabel(m.race.distanceMiles)}</td>
                    <td className="mono">
                      {formatMs(m.result.timeMs)} {badge && <span className={`badge ${badge === 'PB' ? 'pb' : 'sb'}`}>{badge}</span>}
                    </td>
                    <td className="mono">{formatPace(m.result.timeMs, m.race.distanceMiles)}</td>
                    <td className="nowrap" title="Place on the team, then overall place if entered">
                      {m.teamPlace}{m.result.place ? ` (${m.result.place} overall)` : ''}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>

      <section className="card">
        <h2>Practice history</h2>
        {practiceHistory.length === 0 ? (
          <p className="muted">No practice results yet.</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Practice</th>
                <th>Type</th>
                <th>Result</th>
              </tr>
            </thead>
            <tbody>
              {[...practiceHistory].reverse().map(({ practice, entry }) => (
                <tr key={practice.id}>
                  <td className="nowrap">{formatDate(practice.date, { month: 'short', day: 'numeric' })}</td>
                  <td><Link to={`/practices/${practice.id}`}>{practice.title}</Link></td>
                  <td>{practiceTypeLabel(practice.type)}</td>
                  <td className="mono">{describeEntry(practice, entry)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}

