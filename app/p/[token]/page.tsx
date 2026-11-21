'use client';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { sb } from '@/lib/supabase';
import { fr } from '@/lib/util';

// Delt pakkliste: lesetilgang via lenke, uten innlogging
export default function DeltPakkliste() {
  const { token } = useParams<{ token: string }>();
  const [d, setD] = useState<any>(undefined); const [by, setBy] = useState<'pickup' | 'vehicle'>('pickup');
  const load = () => sb().rpc('shared_packlist', { p_token: token }).then(({ data }) => setD(data || null));
  useEffect(() => { load(); const t = setInterval(load, 30000); return () => clearInterval(t); }, [token]); // eslint-disable-line
  if (d === undefined) return <div className="loading">Laster…</div>;
  if (!d) return <div className="login" style={{ minHeight: '100vh' }}><span className="brand">deadline<i /></span><p>Lenken er ugyldig eller slått av.</p></div>;
  const groups: Record<string, any[]> = {};
  d.lines.forEach((l: any) => { const k = (by === 'pickup' ? l.pickup : l.vehicle) || (by === 'pickup' ? 'Uten hentested' : 'Uten kjøretøy'); (groups[k] = groups[k] || []).push(l); });
  const mark = (a: number, q: number) => a >= q ? '✓' : a > 0 ? `${a}/${q}` : '–';
  return <main style={{ background: 'var(--bg)', minHeight: '100vh', paddingBlock: 20 }}><div className="wrap">
    <span className="brand">deadline<i /></span>
    <div className="pagehead"><div><h1>{d.project.name}<span className="c">:</span></h1><div className="muted">{d.project.customer} · <span className="tnum">{fr(d.project.start_date, d.project.end_date)}</span>{d.project.venue ? ' · ' + d.project.venue : ''}</div></div></div>
    <div className="chips"><button className="chip" aria-pressed={by === 'pickup'} onClick={() => setBy('pickup')}>Etter hentested</button><button className="chip" aria-pressed={by === 'vehicle'} onClick={() => setBy('vehicle')}>Etter kjøretøy</button></div>
    <div className="small muted">Kolonner: satt fram · lastet · returnert. Oppdateres automatisk.</div>
    {Object.entries(groups).sort(([a], [b]) => (a.startsWith('Uten') ? 1 : 0) - (b.startsWith('Uten') ? 1 : 0) || a.localeCompare(b, 'nb')).map(([k, ls]) => <div className="group" key={k}>
      <div className="group-h"><h3>{k}</h3><span className="small muted">{ls.length} linjer</span></div>
      <div className="list">{ls.map((l, i) => <div key={i} className={'pl' + (l.done_load >= l.qty ? ' done' : '')}>
        <div className="qty tnum">{l.qty}×</div>
        <div className="main"><div className="t">{l.starred && <span style={{ color: 'var(--orange)' }}>★ </span>}{l.name}</div>
          <div className="s">{[l.kit, l.loc, by === 'pickup' ? l.vehicle : l.pickup, l.external ? 'Lånes eksternt' : null].filter(Boolean).join(' · ')}</div>
          {l.note && <div className="s" style={{ fontStyle: 'italic' }}>{l.note}</div>}</div>
        <div className="small tnum" style={{ textAlign: 'right', fontWeight: 700, whiteSpace: 'nowrap' }}>{mark(l.done_pick, l.qty)} · {mark(l.done_load, l.qty)} · {mark(l.done_ret, l.qty)}</div>
      </div>)}</div></div>)}
    {!d.lines.length && <div className="empty">Pakklista er tom.</div>}
    <a className="btn" href="/login">Logg inn for å hake av</a>
  </div></main>;
}
