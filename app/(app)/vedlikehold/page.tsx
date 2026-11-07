'use client';
import { useState } from 'react';
import { sb } from '@/lib/supabase';
import { intervalOf, lookupCode, unitLabel, useStore } from '@/lib/store';
import { Empty, Head, Pill, useToast } from '@/components/ui';
import { Scanner } from '@/components/Scanner';
import { FaultSheet, UnitSheet } from '@/components/sheets';
import { Consumables } from '@/components/Consumables';
import { addDays, fd, today } from '@/lib/util';

export default function Vedlikehold() {
  const store = useStore(); const toast = useToast(); const T = today();
  const [scan, setScan] = useState(false); const [fault, setFault] = useState<any>(null); const [unit, setUnit] = useState<any>(null); const [showAll, setShowAll] = useState(false);
  const withIv = store.db.units.filter(u => u.status !== 'utrangert' && intervalOf(store, u));
  const never = withIv.filter(u => !u.last_inspection);
  const due = withIv.filter(u => u.last_inspection).map(u => ({ u, n: addDays(u.last_inspection, intervalOf(store, u)) })).filter(x => x.n <= addDays(T, 30)).sort((a, b) => a.n.localeCompare(b.n));
  const tickets = [...store.db.tickets].sort((a, b) => (+(a.status === 'Ferdig') - +(b.status === 'Ferdig')) || b.created_at.localeCompare(a.created_at)).filter(t => showAll || t.status !== 'Ferdig');

  return <>
    <Head title="Vedlikehold" back={['/mer', 'Mer']} sub="Service, reparasjoner, inspeksjoner og varetelling" actions={<button className="btn accent" onClick={() => setScan(true)}>Meld feil</button>} />
    <div className="group"><div className="group-h"><h3>Service og reparasjon</h3><button className="btn sm ghost" onClick={() => setShowAll(!showAll)}>{showAll ? 'Skjul ferdige' : 'Vis ferdige'}</button></div>
      <div className="list">{tickets.map(t => { const u = store.U(t.unit_id); if (!u) return null; const by = store.db.profiles.find(p => p.id === t.created_by);
        return <div key={t.id} className="item"><div className="main" onClick={() => setUnit(u)} style={{ cursor: 'pointer' }}><div className="t">{unitLabel(store, u)}</div><div className="s">{t.issue} · {by?.name || 'ukjent'}, <span className="tnum">{fd(t.created_at.slice(0, 10))}</span></div></div>
          <select className="input" value={t.status} style={{ width: 'auto', minHeight: 36, padding: '4px 8px' }} aria-label="Status" onChange={async e => {
            const status = e.target.value; await sb().from('tickets').update({ status }).eq('id', t.id);
            if (status === 'Ferdig') await sb().from('units').update({ status: 'ok', last_inspection: T }).eq('id', t.unit_id);
            await store.refresh('tickets', 'units'); toast('Status oppdatert');
          }}>{['Åpen', 'Sendt til reparasjon', 'Ferdig'].map(s => <option key={s}>{s}</option>)}</select></div>; })}
        {!tickets.length && <Empty>Ingen åpne saker.</Empty>}</div></div>
    <div className="group"><div className="group-h"><h3>Inspeksjon neste 30 dager</h3><span className="small muted">{due.length} enheter</span></div>
      <div className="list">{due.slice(0, 20).map(({ u, n }) => <button key={u.id} className="item" onClick={() => setUnit(u)}><div className="main"><div className="t">{unitLabel(store, u)}</div><div className="s">Hver {intervalOf(store, u)}. dag · sist <span className="tnum">{fd(u.last_inspection)}</span></div></div>
        {n < T ? <Pill c="bad">Forfalt {fd(n)}</Pill> : <Pill c="warn">{fd(n)}</Pill>}</button>)}
        {due.length > 20 && <div className="item small muted">+ {due.length - 20} til</div>}
        {!due.length && <Empty>Ingenting forfaller de neste 30 dagene.</Empty>}</div></div>
    {never.length > 0 && <div className="group"><div className="group-h"><h3>Mangler første inspeksjon</h3><span className="small muted">{never.length} enheter</span></div>
      <div className="notice">Registrer første kontroll når utstyret er sjekket, så regner systemet ut neste dato. Intervallet settes per artikkel eller enhet under Lager.</div>
      <div className="list">{never.slice(0, 10).map(u => <button key={u.id} className="item" onClick={() => setUnit(u)}><div className="main"><div className="t">{unitLabel(store, u)}</div><div className="s">{store.M(u.model_id)?.loc || store.M(u.model_id)?.sub}</div></div><Pill c="warn">Ikke inspisert</Pill></button>)}
        {never.length > 10 && <div className="item small muted">+ {never.length - 10} til</div>}</div></div>}
    <div className="group"><div className="group-h"><h3>Salg og forbruk</h3></div><Consumables /></div>
    {scan && <Scanner title="Hvilket utstyr har feil?" hint="Skann QR-koden på utstyret" onClose={() => setScan(false)} onCode={code => { const r = lookupCode(store, code); if (r.type !== 'unit' && r.type !== 'kit') return { kind: 'bad', msg: 'Fant ikke enheten' }; setScan(false); setFault(r.unit); }} />}
    {fault && <FaultSheet unit={fault} onClose={() => setFault(null)} />}
    {unit && <UnitSheet unit={store.U(unit.id) || unit} onClose={() => setUnit(null)} />}
  </>;
}
