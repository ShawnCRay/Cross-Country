import { useRef, useState, type FormEvent } from 'react';
import { useStore } from '../store';
import { formatDate, todayIso } from '../lib/time';
import { ConfirmButton } from '../components/ConfirmButton';

export function Settings() {
  const store = useStore();
  const [name, setName] = useState('');
  const [start, setStart] = useState(todayIso());
  const [message, setMessage] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const addSeason = (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    store.addSeason({ name: name.trim(), startDate: start });
    setName('');
  };

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(store.data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cross-country-backup-${todayIso()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const importJson = async (file: File) => {
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.runners)) throw new Error('Not a backup file');
      if (!confirm('Replace all current data with this backup?')) return;
      store.importData(parsed);
      setMessage('Backup restored.');
    } catch (err) {
      setMessage(`Could not import: ${(err as Error).message}`);
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const seasons = [...store.data.seasons].sort((a, b) => b.startDate.localeCompare(a.startDate));

  return (
    <div className="page">
      <h1>Settings</h1>

      <section className="card">
        <h2>Seasons</h2>
        <ul className="list">
          {seasons.map((s) => {
            const current = s.id === store.season.id;
            const counts = {
              runners: store.data.runners.filter((r) => r.seasonIds.includes(s.id)).length,
              races: store.data.races.filter((r) => r.seasonId === s.id).length,
              practices: store.data.practices.filter((p) => p.seasonId === s.id).length,
            };
            return (
              <li key={s.id} className="season-row">
                <div>
                  <input className="inline-edit" value={s.name} onChange={(e) => store.updateSeason(s.id, { name: e.target.value })} />
                  {current && <span className="badge">current</span>}
                  <div className="muted small">
                    Started {formatDate(s.startDate)} · {counts.runners} runners · {counts.races} races · {counts.practices} practices
                  </div>
                </div>
                <div className="row gap">
                  {!current && <button className="btn small" onClick={() => store.setCurrentSeason(s.id)}>Switch to</button>}
                  {seasons.length > 1 && (
                    <ConfirmButton className="btn small danger" confirmLabel="Delete season + its races/practices?" onConfirm={() => store.deleteSeason(s.id)}>
                      Delete
                    </ConfirmButton>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
        <form className="row wrap gap end" onSubmit={addSeason}>
          <label className="field">
            <span>New season name</span>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder={`${new Date().getFullYear() + 1} Season`} />
          </label>
          <label className="field">
            <span>Start date</span>
            <input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
          </label>
          <button className="btn primary" type="submit">Add season</button>
        </form>
        <p className="muted small">Runners carry across seasons. Add returning runners to the new roster from the Runners page; their PBs and history follow them.</p>
      </section>

      <section className="card">
        <h2>Sync &amp; sharing</h2>
        {store.sync.enabled ? (
          <>
            <p className="muted">
              Sync is on. Data is shared across every device that opens this site. Anyone with the link can view;
              only coach accounts can edit.
            </p>
            <p>
              {store.sync.user
                ? `Signed in as ${store.sync.user.email ?? store.sync.user.displayName} (${store.sync.canEdit ? 'coach, can edit' : 'view only'})`
                : 'Not signed in (view only).'}
            </p>
            <div className="row wrap gap">
              {store.sync.user ? (
                <button className="btn" onClick={() => store.sync.signOut()}>Sign out</button>
              ) : (
                <button className="btn primary" onClick={() => store.sync.signIn().catch((e) => alert(`Sign-in failed: ${(e as Error).message}`))}>
                  Coach sign in
                </button>
              )}
            </div>
          </>
        ) : (
          <p className="muted">
            Sync is not set up, so data stays on this device only. See the README in the repo for how to turn on
            cross-device sync and a read-only view for parents.
          </p>
        )}
      </section>

      <section className="card">
        <h2>Backup &amp; restore</h2>
        <p className="muted">
          Everything is stored in this browser on this device. Export a backup regularly, and to move to another device or browser.
        </p>
        <div className="row wrap gap">
          <button className="btn primary" onClick={exportJson}>⬇ Export backup (JSON)</button>
          <button className="btn" onClick={() => fileRef.current?.click()}>⬆ Import backup</button>
          <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(e) => e.target.files?.[0] && importJson(e.target.files[0])} />
        </div>
        {message && <p className="notes">{message}</p>}
      </section>

      <section className="card">
        <h2>Danger zone</h2>
        <ConfirmButton confirmLabel="Erase everything?" onConfirm={() => store.resetData()}>Erase all data</ConfirmButton>
      </section>
    </div>
  );
}
