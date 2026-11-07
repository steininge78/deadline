'use client';
import { useEffect, useMemo, useState } from 'react';
import { Icon, Pill, Sheet, Stepper } from '@/components/ui';
import { MND_LANG, addDays, daysBetween, fr, iso, kr, today } from '@/lib/util';

// Offentlig utleieside. Kan bygges inn på Squarespace med <iframe src=".../leie?embed=1">.
export default function Leie() {
  const T = today();
  const [embed, setEmbed] = useState(false);
  const [start, setStart] = useState(addDays(T, 7)); const [end, setEnd] = useState(addDays(T, 8));
  const [items, setItems] = useState<any[] | null>(null); const [cart, setCart] = useState<Record<string, number>>({});
  const [q, setQ] = useState(''); const [cat, setCat] = useState('Alle'); const [cal, setCal] = useState<any>(null);
  const [sent, setSent] = useState<string | null>(null); const [err, setErr] = useState<string | null>(null); const [busy, setBusy] = useState(false);
  useEffect(() => { setEmbed(new URLSearchParams(location.search).has('embed')); }, []);
  useEffect(() => { fetch(`/api/public/catalog?start=${start}&end=${end}`).then(r => r.json()).then(d => setItems(d.items || [])).catch(() => setItems([])); }, [start, end]);
  // Tilpass iframe-høyden på Squarespace
  useEffect(() => { if (!embed) return; const ro = new ResizeObserver(() => parent.postMessage({ deadlineLeieHeight: document.body.scrollHeight }, '*')); ro.observe(document.body); return () => ro.disconnect(); }, [embed]);

  const days = Math.max(1, daysBetween(start, end) + 1);
  const cats = useMemo(() => ['Alle', ...new Set((items || []).map(i => i.cat))], [items]);
  const shown = (items || []).filter(i => (cat === 'Alle' || i.cat === cat) && i.name.toLowerCase().includes(q.toLowerCase()));
  const chosen = Object.entries(cart).filter(([, n]) => n > 0).map(([id, n]) => ({ item: (items || []).find(i => i.id === id), n })).filter(x => x.item);
  const sum = chosen.reduce((a, { item, n }) => a + item.price * n * days, 0);

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault(); setBusy(true); setErr(null);
    const d = Object.fromEntries(new FormData(e.currentTarget));
    const res = await fetch('/api/public/reserve', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...d, start, end, items: chosen.map(c => ({ id: c.item.id, qty: c.n })) }) });
    const j = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setErr(j.error || 'Noe gikk galt. Prøv igjen.');
    setSent(String(d.email)); setCart({});
  };

  return <div style={{ background: '#f6f1ef', minHeight: '100vh', colorScheme: 'light' }}>
    <div className={'webshop' + (embed ? ' embed' : '')} style={{ maxWidth: 980, margin: '0 auto', paddingLeft: 'max(16px, env(safe-area-inset-left))', paddingRight: 'max(16px, env(safe-area-inset-right))' }}>
      {!embed && <div className="wsh"><span className="brand" style={{ color: '#1b252e' }}>deadline<i /></span><span className="small" style={{ color: '#5a6570' }}>Utleie</span></div>}
      {sent ? <div className="wcart" role="status"><h2 style={{ fontFamily: 'var(--f-display)' }}>Takk! Reservasjonen er mottatt<span style={{ color: '#fc4d0f' }}>:</span></h2>
        <p style={{ margin: 0 }}>Vi holder av utstyret i 48 timer og bekrefter på e-post til {sent} så snart vi har sett på bestillingen.</p>
        <button className="btn" onClick={() => setSent(null)}>Gjør en ny reservasjon</button></div> : <>
      <div className="frow"><div className="field"><label htmlFor="w-s">Henting</label><input className="input" type="date" id="w-s" value={start} min={T} onChange={e => { setStart(e.target.value); if (end < e.target.value) setEnd(e.target.value); }} /></div>
        <div className="field"><label htmlFor="w-e">Retur</label><input className="input" type="date" id="w-e" value={end} min={start} onChange={e => setEnd(e.target.value < start ? start : e.target.value)} /></div></div>
      <div className="search"><Icon.search /><input value={q} onChange={e => setQ(e.target.value)} placeholder="Søk i utleieutstyr" aria-label="Søk" /></div>
      {cats.length > 2 && <div className="chips">{cats.map(c => <button key={c} className="chip" aria-pressed={c === cat} onClick={() => setCat(c)} style={c === cat ? { background: '#1b252e', color: '#f6f1ef', borderColor: '#1b252e' } : { background: '#fff', color: '#5a6570', borderColor: '#e1d9d4' }}>{c}</button>)}</div>}
      {items === null ? <div className="empty">Henter utstyr…</div> : <div className="wgrid">{shown.map(i => { const a = i.available ?? 0; const n = cart[i.id] || 0;
        return <div className="witem" key={i.id}>
          <button className="wimg" onClick={() => setCal(i)} aria-label={`Se ledighet for ${i.name}`}>{i.photos[0] ? <img src={i.photos[0]} alt="" /> : <Icon.box size={34} />}</button>
          <div className="wbody"><div className="t">{i.name}</div><div className="small" style={{ color: '#5a6570' }}>{kr(i.price)} per dag</div>
            <div className="wfoot">{a ? <Pill c="ok">{a > 5 ? 'Ledig' : `${a} ledig`}</Pill> : <Pill c="bad">Opptatt</Pill>}<button className="linkbtn" onClick={() => setCal(i)}>Kalender</button></div>
            {a > 0 && <Stepper value={n} max={a} onChange={v => setCart({ ...cart, [i.id]: v })} />}</div></div>; })}
        {!shown.length && <div className="empty">Ingen treff.</div>}</div>}
      {chosen.length > 0 && <div className="wcart"><h3>Din reservasjon</h3><div className="small" style={{ color: '#5a6570' }}>{fr(start, end)} · {days} {days === 1 ? 'dag' : 'dager'}</div>
        {chosen.map(({ item, n }) => <div className="wrow" key={item.id}><span>{n}× {item.name}</span><span className="tnum">{kr(item.price * n * days)}</span></div>)}
        <div className="wrow" style={{ fontWeight: 800, borderTop: '2px solid #1b252e', paddingTop: 8 }}><span>Estimert, eks. mva.</span><span className="tnum">{kr(sum)}</span></div>
        <form className="form" onSubmit={submit}>
          <input name="website" tabIndex={-1} autoComplete="off" style={{ position: 'absolute', left: -9999 }} aria-hidden="true" />
          <div className="frow stack"><div className="field"><label htmlFor="w-n">Navn</label><input className="input" id="w-n" name="name" required autoComplete="name" /></div>
            <div className="field"><label htmlFor="w-p">Telefon</label><input className="input" id="w-p" name="phone" type="tel" inputMode="tel" autoComplete="tel" /></div></div>
          <div className="field"><label htmlFor="w-m">E-post</label><input className="input" id="w-m" name="email" type="email" required inputMode="email" autoComplete="email" /></div>
          <div className="field"><label htmlFor="w-t">Hva skal utstyret brukes til?</label><textarea className="input" id="w-t" name="note" /></div>
          {err && <div className="notice warn">{err}</div>}
          <button className="btn accent block" disabled={busy}>{busy ? 'Sender…' : 'Send reservasjon'}</button>
          <p className="small" style={{ margin: 0, color: '#5a6570' }}>Utstyret holdes av i 48 timer til Deadline bekrefter. Prisene er veiledende og eks. mva.</p>
        </form></div>}
      </>}
    </div>
    {cal && <MonthCal item={cal} start={start} end={end} onClose={() => setCal(null)} />}
  </div>;
}

function MonthCal({ item, start, end, onClose }: { item: any; start: string; end: string; onClose: () => void }) {
  const T = today(); const first = new Date(); first.setDate(1);
  const months = [0, 1].map(o => { const d = new Date(first); d.setMonth(d.getMonth() + o); return d; });
  const last = iso(new Date(months[1].getFullYear(), months[1].getMonth() + 1, 0));
  const [days, setDays] = useState<Map<string, any>>(new Map());
  useEffect(() => { fetch(`/api/public/days?model=${item.id}&from=${T}&to=${last}`).then(r => r.json()).then(d => setDays(new Map((d.days || []).map((x: any) => [x.day, x])))); }, [item.id, T, last]);
  return <Sheet title={item.name} onClose={onClose}><div className="form">
    {item.text && <p className="small" style={{ margin: 0 }}>{item.text}</p>}
    <div className="legend"><span><i style={{ background: 'var(--ok-soft)', border: '1px solid var(--ok)' }} />Ledig</span><span><i style={{ background: 'var(--warn-soft)', border: '1px solid var(--warn)' }} />Delvis</span><span><i style={{ background: 'var(--bad-soft)', border: '1px solid var(--bad)' }} />Opptatt</span></div>
    {months.map(md => { const y = md.getFullYear(), mo = md.getMonth(), n = new Date(y, mo + 1, 0).getDate(), off = (new Date(y, mo, 1).getDay() + 6) % 7;
      return <div key={mo}><h3 style={{ marginBottom: 8 }}>{MND_LANG[mo]} {y}</h3><div className="mcal">{['ma', 'ti', 'on', 'to', 'fr', 'lø', 'sø'].map(x => <b key={x}>{x}</b>)}{Array.from({ length: off }, (_, i) => <span key={'o' + i} />)}
        {Array.from({ length: n }, (_, i) => { const ds = iso(new Date(y, mo, i + 1)); if (ds < T) return <span key={ds} className="past">{i + 1}</span>; const x = days.get(ds);
          const cls = !x ? '' : x.available <= 0 ? 'no' : x.available < x.usable ? 'part' : 'yes'; return <span key={ds} className={cls + (ds >= start && ds <= end ? ' sel' : '')}>{i + 1}</span>; })}</div></div>; })}
    <p className="small muted" style={{ margin: 0 }}>Valgt periode er markert med ring.</p>
  </div></Sheet>;
}
