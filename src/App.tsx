import { HashRouter, NavLink, Route, Routes } from 'react-router-dom';
import { StoreProvider, useStore } from './store';
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

function Shell() {
  return (
    <div className="app">
      <header className="topbar">
        <NavLink to="/" className="brand">XC Tracker</NavLink>
        <SeasonPicker />
      </header>
      <main>
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
