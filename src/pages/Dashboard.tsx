import { Link } from 'react-router-dom';
import { useStore } from '../store';
import { raceBadge, sortedResults } from '../lib/stats';
import { distanceLabel, formatDate, formatMs, relativeDay, todayIso } from '../lib/time';
import { practiceSummary, practiceTypeLabel } from '../lib/labels';
import { isStopwatchActive } from '../lib/stopwatchStorage';
import { TEAM } from '../lib/team';
import { LakeMark } from '../components/LakeMark';

export function Dashboard() {
  const store = useStore();
  const swActive = isStopwatchActive();
  const today = todayIso();
  const upcomingRaces = store.seasonRaces.filter((r) => r.date >= today).sort((a, b) => a.date.localeCompare(b.date));
  const recentRaces = store.seasonRaces.filter((r) => r.date < today).slice(0, 5);
  const recentPractices = store.seasonPractices.slice(0, 5);

  // Recent PBs: any race result in the last 3 races of the season that was a PB.
  const recentPBs = store.seasonRaces
    .slice(0, 3)
    .flatMap((race) =>
      sortedResults(race)
        .map((x) => ({ race, x, badge: x.runnerId ? raceBadge(store.data, x.runnerId, race, x.timeMs) : null }))
        .filter((m) => m.badge),
    );

  return (
    <div className="page">
      <div className="hero">
        <LakeMark className="hero-mark" />
        <div>
          <h1>{store.season.name}</h1>
          <p className="muted">{TEAM.fullName}</p>
        </div>
      </div>

      {swActive && (
        <Link to="/stopwatch" className="banner">
          ⏱ A race clock is running. Tap to return to the stopwatch.
        </Link>
      )}

      <section className="stat-row">
        <Link to="/runners" className="stat">
          <div className="stat-label">Runners</div>
          <div className="stat-value">{store.seasonRunners.length}</div>
        </Link>
        <Link to="/races" className="stat">
          <div className="stat-label">Races</div>
          <div className="stat-value">{store.seasonRaces.length}</div>
        </Link>
        <Link to="/practices" className="stat">
          <div className="stat-label">Practices</div>
          <div className="stat-value">{store.seasonPractices.length}</div>
        </Link>
      </section>

      <div className="quick-actions">
        <Link to="/stopwatch" className="btn primary xl">⏱ Race Stopwatch</Link>
        <Link to="/practices" className="btn xl">+ Log a practice</Link>
      </div>

      {store.seasonRunners.length === 0 && (
        <section className="card">
          <h2>Get started</h2>
          <ol className="steps">
            <li><Link to="/runners">Add your runners</Link> to the roster.</li>
            <li><Link to="/practices">Log practices</Link>: timed runs, timed miles, intervals, distance runs.</li>
            <li>On race day, open the <Link to="/stopwatch">stopwatch</Link> and tap names as they finish.</li>
            <li>Back up your data any time from <Link to="/settings">Settings</Link>.</li>
          </ol>
        </section>
      )}

      {recentPBs.length > 0 && (
        <section className="card">
          <h2>Recent bests</h2>
          <ul className="list">
            {recentPBs.map(({ race, x, badge }, i) => (
              <li key={i} className="row between">
                <span>
                  <Link to={`/runners/${x.runnerId}`}>{store.runnerName(x.runnerId)}</Link>
                  <span className="muted"> · {race.name}</span>
                </span>
                <span className="mono">
                  {formatMs(x.timeMs)} <span className={`badge ${badge === 'PB' ? 'pb' : 'sb'}`}>{badge}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {upcomingRaces.length > 0 && (
        <section className="card">
          <h2>Upcoming races</h2>
          <ul className="list">
            {upcomingRaces.map((r) => (
              <li key={r.id} className="row between">
                <span>
                  <Link to={`/races/${r.id}`}>{r.name}</Link>
                  <span className="muted small"> · {distanceLabel(r.distanceMiles)}{r.location ? ` · ${r.location}` : ''}</span>
                </span>
                <span className="small nowrap">
                  <span className="muted">{formatDate(r.date, { weekday: 'short', month: 'short', day: 'numeric' })}</span>
                  <span className="badge">{relativeDay(r.date)}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="grid-2">
        <section className="card">
          <h2>Recent races</h2>
          {recentRaces.length === 0 ? (
            <p className="muted">None yet.</p>
          ) : (
            <ul className="list">
              {recentRaces.map((r) => (
                <li key={r.id} className="row between">
                  <span>
                    <Link to={`/races/${r.id}`}>{r.name}</Link>
                    <span className="muted small"> · {distanceLabel(r.distanceMiles)}</span>
                  </span>
                  <span className="muted small">{formatDate(r.date, { month: 'short', day: 'numeric' })}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="card">
          <h2>Recent practices</h2>
          {recentPractices.length === 0 ? (
            <p className="muted">None yet.</p>
          ) : (
            <ul className="list">
              {recentPractices.map((p) => (
                <li key={p.id} className="row between">
                  <span>
                    <Link to={`/practices/${p.id}`}>{p.title}</Link>
                    <span className="muted small"> · {practiceTypeLabel(p.type)} {practiceSummary(p)}</span>
                  </span>
                  <span className="muted small">{formatDate(p.date, { month: 'short', day: 'numeric' })}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
