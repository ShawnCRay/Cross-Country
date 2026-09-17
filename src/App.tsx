import { HashRouter, NavLink, Route, Routes } from 'react-router-dom';
import { StoreProvider, useStore } from './store';
import { TEAM } from './lib/team';
import { Dashboard } from './pages/Dashboard';
import { Stopwatch } from './pages/Stopwatch';
import { Runners } from './pages/Runners';
import { RunnerDetail } from './pages/RunnerDetail';
import { Practices } from './pages/Practices';
import { PracticeDetail } from './pages/PracticeDetail';
import { Races } from './pages/Races';
import { RaceDetail } from './pages/RaceDetail';
import { Settings } from './pages/Settings';

function SeasonPicker() {
  const store = useStore();
  const seasons = [...store.data.seasons].sort((a, b) => b.startDate.localeCompare(a.startDate));
  if (seasons.length <= 1) return <span className="season-name">{store.season.name}</span>;
  return (
    <select className="season-select" value={store.season.id} onChange={(e) => store.setCurrentSeason(e.target.value)} aria-label="Season">
      {seasons.map((s) => (
        <option key={s.id} value={s.id}>{s.name}</option>
      ))}
    </select>
  );
}

const NAV = [
  { to: '/', label: 'Home', icon: '🏠' },
  { to: '/stopwatch', label: 'Stopwatch', icon: '⏱' },
  { to: '/runners', label: 'Runners', icon: '👟' },
  { to: '/practices', label: 'Practices', icon: '📋' },
  { to: '/races', label: 'Races', icon: '🏁' },
  { to: '/settings', label: 'Settings', icon: '⚙️' },
];

function SyncControls() {
  const store = useStore();
  const { mode, isCoach, status } = store.sync;
  if (mode !== 'on') return null;
  if (!isCoach) {
    return (
      <button className="btn small" onClick={() => coachSignIn(store.sync.signIn)}>
        Coach sign in
      </button>
    );
  }
  const dot = status === 'idle' ? 'ok' : status === 'syncing' ? 'busy' : 'bad';
  return (
    <span className="row gap">
      <span className={`sync-dot ${dot}`} title={status === 'idle' ? 'Synced' : status} />
      <span className="muted small sync-label">Coach</span>
      <button className="btn small" onClick={() => store.sync.signOut()}>Sign out</button>
    </span>
  );
}

export async function coachSignIn(signIn: (key: string) => Promise<boolean>) {
  const key = window.prompt('Enter the coach passcode');
  if (key == null || !key.trim()) return;
  const ok = await signIn(key).catch(() => false);
  if (!ok) window.alert('That passcode was not accepted.');
}

function Shell() {
  const store = useStore();
  const readOnly = !store.sync.canEdit;
  return (
    <div className="app">
      <header className="topbar">
        <NavLink to="/" className="brand"><span className="brand-emoji" aria-hidden>{TEAM.emoji}</span> {TEAM.shortName}</NavLink>
        <span className="row gap">
          <SeasonPicker />
          <SyncControls />
        </span>
      </header>
      {readOnly && store.sync.mode === 'on' && (
        <div className="readonly-banner">View only. Coaches: sign in to make changes.</div>
      )}
      {store.sync.lastError && store.sync.isCoach && (
        <div className="readonly-banner">
          {store.sync.status === 'offline' ? 'Offline. Changes are saved here and will sync when you reconnect.' : store.sync.lastError}
        </div>
      )}
      <main>
        <fieldset disabled={readOnly} className="page-fieldset">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/stopwatch" element={<Stopwatch />} />
          <Route path="/runners" element={<Runners />} />
          <Route path="/runners/:id" element={<RunnerDetail />} />
          <Route path="/practices" element={<Practices />} />
          <Route path="/practices/:id" element={<PracticeDetail />} />
          <Route path="/races" element={<Races />} />
          <Route path="/races/:id" element={<RaceDetail />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
        </fieldset>
      </main>
      <nav className="bottom-nav">
        {NAV.map((n) => (
          <NavLink key={n.to} to={n.to} end={n.to === '/'} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
            <span className="nav-icon" aria-hidden>{n.icon}</span>
            <span>{n.label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}

export default function App() {
  return (
    <StoreProvider>
      <HashRouter>
        <Shell />
      </HashRouter>
    </StoreProvider>
  );
}
