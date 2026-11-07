'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useAvailability, useStore } from '@/lib/store';
import { Head } from '@/components/ui';
import { DAG, addDays, daysBetween, fd, mondayOf, parse, today } from '@/lib/util';

export default function Kalender() {
  const store = useStore(); const T = today();
  const [start, setStart] = useState(mondayOf(T)); const [n, setN] = useState(21);
  useEffect(() => { const f = () => setN(innerWidth >= 900 ? 28 : 21); f(); addEventListener('resize', f); return () => removeEventListener('resize', f); }, []);
  const days = Array.from({ length: n }, (_, i) => addDays(start, i)); const end = days[n - 1];
  const bar = (s: string, e: string, cls: string, label: string, href: string) => {
    const a = s < start ? start : s, b = e > end ? end : e; if (a > b) return null;
    const span = daysBetween(a, b) + 1;
    return { col: daysBetween(start, a), el: <Link className={'cbar ' + cls} href={href} title={label} style={{ width: `calc(${span * 100}% + ${span - 1}px - 4px)` }}>{label}</Link> };
  };
  const Row = ({ h, sub, bars }: { h: string; sub?: string; bars: any[] }) => <tr><th className="rowh">{h}{sub && <span className="s">{sub}</span>}</th>
    {days.map((d, i) => { const b = bars.find(x => x && x.col === i); const we = [0, 6].includes(parse(d).getDay()); return <td key={d} className={d === T ? 'today' : we ? 'we' : ''}>{b?.el}</td>; })}</tr>;
  const projs = store.db.projects.filter(p => p.status !== 'Avlyst' && p.start_date <= end && p.end_date >= start).sort((a, b) => a.start_date.localeCompare(b.start_date));
  const reqs = store.db.requests.filter(r => ['Ny', 'Reservert', 'Tilbud sendt'].includes(r.status) && r.start_date <= end && r.end_date >= start);
  const [m, setM] = useState(''); const [d, setD] = useState(T); const av = useAvailability(d, d);
  const models = [...store.db.models].sort((a, b) => a.name.localeCompare(b.name, 'nb'));
  const sel = m || models[0]?.id; const a = av.get(sel);

  return <>
    <Head title="Kalender" sub={<span className="tnum">{fd(start)} – {fd(end)}</span>} actions={<><button className="btn sm" onClick={() => setStart(addDays(start, -7))} aria-label="Forrige uke">‹</button><button className="btn sm" onClick={() => setStart(mondayOf(T))}>I dag</button><button className="btn sm" onClick={() => setStart(addDays(start, 7))} aria-label="Neste uke">›</button></>} />
    <div className="legend"><span><i style={{ background: 'var(--navy)' }} />Prosjekt</span><span><i style={{ background: 'var(--violet)' }} />Ressurs i bruk</span><span><i style={{ background: 'repeating-linear-gradient(135deg,var(--orange) 0 4px,#e2440b 4px 8px)' }} />Forespørsel</span></div>
    <div className="cal"><table><thead><tr><th className="rowh" style={{ background: 'var(--surface)' }} />{days.map(x => { const dt = parse(x); return <th key={x} className={x === T ? 'today' : ''}>{DAG[dt.getDay()]}<span className="d tnum">{dt.getDate()}</span></th>; })}</tr></thead><tbody>
      <tr className="sec"><th className="rowh">Oppdrag</th><td colSpan={n} /></tr>
      {projs.map(p => <Row key={p.id} h={p.name} sub={p.customer} bars={[bar(p.start_date, p.end_date, 'p', p.name, '/prosjekter/' + p.id)]} />)}
      {reqs.map(r => <Row key={r.id} h={r.title} sub={r.status} bars={[bar(r.start_date, r.end_date, 'q', r.title, '/foresporsler/' + r.id)]} />)}
      {!projs.length && !reqs.length && <Row h="Ingen oppdrag" bars={[]} />}
      <tr className="sec"><th className="rowh">Ressurser</th><td colSpan={n} /></tr>
      {store.db.resources.filter(r => r.active).map(r => <Row key={r.id} h={r.name} sub={r.sub || r.type} bars={[
        ...store.db.project_resources.filter(x => x.resource_id === r.id).map(x => store.P(x.project_id)).filter(p => p && p.status !== 'Avlyst').map(p => bar(p.start_date, p.end_date, 'r', p.name, '/prosjekter/' + p.id)),
        ...store.db.request_resources.filter(x => x.resource_id === r.id).map(x => store.db.requests.find(q => q.id === x.request_id)).filter(q => q && ['Reservert', 'Tilbud sendt'].includes(q.status)).map(q => bar(q.start_date, q.end_date, 'q', q.title, '/foresporsler/' + q.id))
      ]} />)}
    </tbody></table></div>
    <div className="group"><div className="group-h"><h3>Ledighet for utstyr</h3></div><div className="card">
      <div className="frow stack"><div className="field"><label htmlFor="av-m">Utstyr</label><select className="input" id="av-m" value={sel} onChange={e => setM(e.target.value)}>{models.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}</select></div>
        <div className="field"><label htmlFor="av-d">Dato</label><input className="input" type="date" id="av-d" value={d} onChange={e => setD(e.target.value)} /></div></div>
      {a && <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}><b className="tnum" style={{ fontFamily: 'var(--f-display)', fontSize: '1.6rem' }}>{a.available}</b><span className="muted">av {a.usable} ledig {fd(d)}</span></div>}
    </div></div>
  </>;
}
