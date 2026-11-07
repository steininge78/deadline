'use client';
import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import { sb } from '@/lib/supabase';
import { resBusy, useAvailability, useStore } from '@/lib/store';
import { Brand, Empty, Head, Icon, Pill, useToast } from '@/components/ui';
import { Picker } from '@/components/sheets';
import { RSTATUS, daysBetween, fd, fr, kr, today } from '@/lib/util';

export default function Foresporsel() {
  const { id } = useParams<{ id: string }>(); const store = useStore(); const toast = useToast(); const router = useRouter();
  const r = store.db.requests.find(x => x.id === id);
  const av = useAvailability(r?.start_date, r?.end_date, null, id);
  const [picking, setPicking] = useState(false);
  if (!r) return store.db.requests.length ? <Head title="Fant ikke forespørselen" back={['/foresporsler', 'Forespørsler']} /> : <div className="loading">Laster…</div>;
  const lines = store.db.request_lines.filter(l => l.request_id === id);
  const resIds = store.db.request_resources.filter(x => x.request_id === id).map(x => x.resource_id);
  const days = daysBetween(r.start_date, r.end_date) + 1;
  const rows = [...lines.map(l => { const m = store.M(l.model_id); return { name: m?.name, q: l.qty, price: m?.price, sum: (m?.price || 0) * l.qty * days }; }),
    ...resIds.map(x => { const rs = store.R(x); return { name: rs?.name, q: 1, price: rs?.price, sum: (rs?.price || 0) * days }; })];
  const sub = rows.reduce((a, x) => a + x.sum, 0), disc = sub * (+r.discount || 0) / 100, net = sub - disc, mva = net * 0.25;
  const set = async (patch: any, msg?: string) => { const { error } = await sb().from('requests').update(patch).eq('id', id); if (error) return toast(error.message, 'bad'); await store.refresh('requests'); msg && toast(msg); };
  const text = `Hei ${r.contact || ''}!\n\nTakk for forespørselen. Her er tilbud på utstyr til ${r.title}, ${fr(r.start_date, r.end_date)} (${days} ${days === 1 ? 'dag' : 'dager'}):\n\n${rows.map(x => `${x.q} × ${x.name}: ${x.price == null ? 'pris avklares' : kr(x.sum)}`).join('\n')}\n${disc ? `Rabatt ${r.discount} %: −${kr(disc)}\n` : ''}\nSum eks. mva: ${kr(net)}\nTotalt inkl. mva: ${kr(net + mva)}\n\nTilbudet gjelder i 14 dager. Transport, rigg og teknikere kommer i tillegg.\n\nMed vennlig hilsen\n${store.me.name || ''}\nDeadline`;
  const expired = r.status === 'Reservert' && r.hold_until && new Date(r.hold_until) < new Date();

  return <>
    <Head title={r.title} back={['/foresporsler', 'Forespørsler']} sub={<>{r.customer}{r.contact ? ' · ' + r.contact : ''} · <span className="tnum">{fr(r.start_date, r.end_date)}</span></>} />
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: 6 }}><Pill c={RSTATUS[r.status]}>{r.status}</Pill>{r.source === 'Nettside' && <Pill c="acc">Fra nettsiden</Pill>}</div>
        <div className="row-actions">
          {(r.status === 'Ny' || expired) && <button className="btn sm" onClick={() => set({ status: 'Reservert', hold_until: null }, 'Utstyret er reservert')}>Reserver utstyret</button>}
          {['Ny', 'Reservert'].includes(r.status) && <button className="btn sm" onClick={() => set({ status: 'Tilbud sendt', hold_until: null }, 'Merket som sendt')}>Tilbud sendt</button>}
          {!['Akseptert', 'Avslått'].includes(r.status) && <>
            <button className="btn sm accent" onClick={async () => {
              const { data: p, error } = await sb().from('projects').insert({ name: r.title, customer: r.customer, start_date: r.start_date, end_date: r.end_date, status: 'Bekreftet', contact: r.contact, created_by: store.me.id }).select().single();
              if (error) return toast(error.message, 'bad');
              if (lines.length) await sb().from('project_lines').insert(lines.map((l, i) => ({ project_id: p.id, model_id: l.model_id, qty: l.qty, sort: i })));
              if (resIds.length) await sb().from('project_resources').insert(resIds.map(x => ({ project_id: p.id, resource_id: x })));
              await sb().from('requests').update({ status: 'Akseptert', project_id: p.id }).eq('id', id);
              await store.refresh('projects', 'project_lines', 'project_resources', 'requests');
              toast('Prosjekt opprettet. Husk å legge inn Asana-nummer.'); router.push('/prosjekter/' + p.id);
            }}>Akseptert → lag prosjekt</button>
            <button className="btn sm ghost" onClick={() => set({ status: 'Avslått' }, 'Markert som avslått')}>Avslått</button></>}
          {r.project_id && <button className="btn sm" onClick={() => router.push('/prosjekter/' + r.project_id)}>Åpne prosjektet</button>}
        </div>
      </div>
      {r.note && <p style={{ margin: 0 }}>{r.note}</p>}
      <div className="small muted">{[r.email, r.phone].filter(Boolean).join(' · ')}</div>
      {r.status === 'Reservert' && r.hold_until && <div className={'small ' + (expired ? 'danger' : 'muted')}>{expired ? 'Holdetiden er ute, så utstyret er ikke lenger reservert. Trykk «Reserver utstyret» for å holde det av igjen.' : `Holdes av til ${new Date(r.hold_until).toLocaleString('nb-NO', { dateStyle: 'short', timeStyle: 'short' })}.`}</div>}
    </div>

    <div className="group"><div className="group-h"><h3>Utstyr og ledighet</h3><button className="btn sm" onClick={() => setPicking(true)}><Icon.plus /> Legg til</button></div>
      <div className="list">
        {lines.map(l => { const m = store.M(l.model_id); const a = av.get(l.model_id)?.available ?? 0; return <div key={l.id} className="item"><div className="qty tnum">{l.qty}×</div><div className="main"><div className="t">{m?.name}</div><div className="s">{m?.price == null ? 'uten pris' : kr(m.price) + '/dag'}</div></div>
          {a >= l.qty ? <Pill c="ok">{a} ledig</Pill> : <Pill c="bad">Bare {Math.max(0, a)} ledig</Pill>}
          <button className="btn ghost sm" aria-label="Fjern" onClick={async () => { await sb().from('request_lines').delete().eq('id', l.id); store.refresh('request_lines'); }}><Icon.x /></button></div>; })}
        {store.db.resources.filter(x => x.active || resIds.includes(x.id)).map(x => { const on = resIds.includes(x.id); const busy = resBusy(store, x.id, r.start_date, r.end_date, { request: id });
          return <label key={x.id} className="item" style={{ cursor: 'pointer' }}><input type="checkbox" checked={on} style={{ width: 20, height: 20, accentColor: 'var(--orange)' }} onChange={async e => {
            e.target.checked ? await sb().from('request_resources').insert({ request_id: id, resource_id: x.id }) : await sb().from('request_resources').delete().match({ request_id: id, resource_id: x.id }); store.refresh('request_resources');
          }} /><div className="main"><div className="t">{x.name}</div><div className="s">{x.type}{x.price != null ? ' · ' + kr(x.price) + '/dag' : ''}</div></div>{busy.length ? <Pill c={on ? 'bad' : 'warn'}>Opptatt</Pill> : <Pill c="ok">Ledig</Pill>}</label>; })}
        {!lines.length && <Empty>Ingen utstyr valgt ennå.</Empty>}
      </div></div>

    <div className="group"><div className="group-h"><h3>Tilbud</h3><div style={{ display: 'flex', gap: 8, alignItems: 'center' }}><label htmlFor="disc" className="small muted">Rabatt %</label>
      <input className="input" id="disc" type="number" min="0" max="100" defaultValue={r.discount || 0} style={{ width: 80, minHeight: 36, padding: '6px 8px' }} onBlur={e => set({ discount: +e.target.value || 0 })} /></div></div>
      <div className="offer">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}><Brand /><div className="small" style={{ textAlign: 'right', color: '#5a6570' }}>Tilbud til {r.customer}<br />{r.contact && <>Att: {r.contact}<br /></>}Dato {fd(today())}</div></div>
        <div><div style={{ fontFamily: 'var(--f-display)', fontWeight: 900, fontSize: '1.3rem' }}>{r.title}<span style={{ color: '#fc4d0f' }}>:</span></div><div className="small" style={{ color: '#5a6570' }}>Leieperiode {fr(r.start_date, r.end_date)} · {days} {days === 1 ? 'dag' : 'dager'}</div></div>
        <div style={{ overflowX: 'auto' }}><table><thead><tr><th>Utstyr</th><th className="n">Ant.</th><th className="n">Pris/dag</th><th className="n">Sum</th></tr></thead><tbody>
          {rows.map((x, i) => <tr key={i}><td>{x.name}</td><td className="n">{x.q}</td><td className="n">{x.price == null ? '–' : kr(x.price)}</td><td className="n">{x.price == null ? 'Avklares' : kr(x.sum)}</td></tr>)}
          <tr className="tot"><td colSpan={3}>Sum utstyr</td><td className="n">{kr(sub)}</td></tr>
          {disc > 0 && <tr className="tot"><td colSpan={3}>Rabatt {r.discount} %</td><td className="n">−{kr(disc)}</td></tr>}
          <tr className="tot"><td colSpan={3}>MVA 25 %</td><td className="n">{kr(mva)}</td></tr><tr className="grand"><td colSpan={3}>Totalt</td><td className="n">{kr(net + mva)}</td></tr></tbody></table></div>
        <div className="small" style={{ color: '#5a6570' }}>Tilbudet gjelder i 14 dager. Transport, rigg og teknikere kommer i tillegg.</div>
      </div>
      <div className="row-actions"><button className="btn" onClick={() => navigator.clipboard.writeText(text).then(() => toast('Tilbudsteksten er kopiert'), () => toast('Kunne ikke kopiere', 'bad'))}><Icon.copy /> Kopier tilbudstekst</button>
        {r.email && <a className="btn" href={`mailto:${r.email}?subject=${encodeURIComponent('Tilbud: ' + r.title)}&body=${encodeURIComponent(text)}`}>Åpne i e-post</a>}
        <button className="btn" onClick={() => window.print()}>Skriv ut / PDF</button></div>
    </div>
    {picking && <Picker title="Legg til utstyr" start={r.start_date} end={r.end_date} exRequest={id} onClose={() => setPicking(false)} onPick={async (sel, kit) => {
      const ins = kit ? [{ request_id: id, model_id: kit.model_id, qty: 1 }] : sel.map(([model_id, qty]) => ({ request_id: id, model_id, qty }));
      const { error } = await sb().from('request_lines').insert(ins); if (error) return toast(error.message, 'bad');
      await store.refresh('request_lines'); setPicking(false);
    }} />}
  </>;
}
