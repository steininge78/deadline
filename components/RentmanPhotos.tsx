'use client';
import { useRef, useState } from 'react';
import { useStore } from '@/lib/store';
import { Icon, useToast } from './ui';

// Kopierer bilder fra Rentman til appens bildelager. Nøkkelen holdes bare i minnet.
export function RentmanPhotos() {
  const store = useStore(); const toast = useToast();
  const [token, setToken] = useState(''); const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(0); const [added, setAdded] = useState(0); const [log, setLog] = useState<string[]>([]);
  const stop = useRef(false);
  const list = store.db.models.filter(m => m.rentman_id);

  const run = async () => {
    if (!token.trim()) return toast('Lim inn API-nøkkelen fra Rentman først', 'bad');
    setBusy(true); stop.current = false; setDone(0); setAdded(0); setLog([]);
    let total = 0;
    try {
      for (let i = 0; i < list.length && !stop.current; i += 5) {
        const ids = list.slice(i, i + 5).map(m => m.id);
        const res = await fetch('/api/admin/rentman-photos', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: token.trim(), modelIds: ids }) });
        const j = await res.json().catch(() => ({}));
        if (!res.ok) { setLog(l => [...l, 'Stoppet: ' + (j.error || res.status)]); toast(j.error || 'Importen stoppet', 'bad'); break; }
        for (const r of j.results || []) {
          total += r.added || 0;
          if (r.added) setLog(l => [...l.slice(-200), `${r.name}: ${r.added} bilde${r.added === 1 ? '' : 'r'}`]);
          if (r.error) setLog(l => [...l.slice(-200), `${r.name}: feil – ${r.error}`]);
        }
        setDone(Math.min(list.length, i + 5)); setAdded(total);
      }
      await store.refresh('models');
      if (!stop.current) toast(`Ferdig: ${total} bilder hentet fra Rentman`);
    } catch (e: any) { toast(e.message || 'Noe gikk galt', 'bad'); }
    finally { setBusy(false); }
  };

  return <div className="card">
    <h3>Hent bilder fra Rentman</h3>
    <p className="small muted" style={{ margin: 0 }}>Kopierer bildene som ligger på utstyret i Rentman, koblet via Rentman-ID. Kan kjøres flere ganger; bilder som allerede er hentet hoppes over.
      Nøkkelen finner du i Rentman under <b>Configuration → Account → Integrations → API → Show token</b>. Den lagres ikke.</p>
    <div className="field"><label htmlFor="rm-token">API-nøkkel fra Rentman</label>
      <input className="input" id="rm-token" type="password" autoComplete="off" value={token} onChange={e => setToken(e.target.value)} placeholder="Lim inn nøkkelen her" disabled={busy} /></div>
    <div className="row-actions">
      <button className="btn primary" onClick={run} disabled={busy || !list.length}><Icon.camera /> {busy ? `Henter… ${done}/${list.length}` : `Hent bilder for ${list.length} artikler`}</button>
      {busy && <button className="btn" onClick={() => { stop.current = true; }}>Stopp</button>}
    </div>
    {!list.length && <div className="small muted">Importer lagerlista først, så artiklene får Rentman-ID.</div>}
    {(busy || done > 0) && <div className="prog"><div className="lbl"><span>{done} av {list.length} artikler · {added} bilder</span><span className="tnum">{list.length ? Math.round(done / list.length * 100) : 0}%</span></div><div className="bar"><i style={{ width: `${list.length ? done / list.length * 100 : 0}%` }} /></div></div>}
    {log.length > 0 && <div className="scanlog">{log.slice(-40).reverse().map((l, i) => <div key={i} className="small">{l}</div>)}</div>}
  </div>;
}
