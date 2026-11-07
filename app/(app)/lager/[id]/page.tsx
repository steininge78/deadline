'use client';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useMemo, useState } from 'react';
import { sb, photoUrl } from '@/lib/supabase';
import { intervalOf, useAvailability, useStore } from '@/lib/store';
import { Head, Icon, Label, Pill, Sheet, Stepper, QR, useToast } from '@/components/ui';
import { ModelSheet, PhotoButtons, UnitSheet, uploadPhotos } from '@/components/sheets';
import { addDays, fd, fr, kr, newQR, today } from '@/lib/util';

function Utstyr() {
  const { id } = useParams<{ id: string }>(); const search = useSearchParams();
  const store = useStore(); const toast = useToast(); const m = store.M(id);
  const [edit, setEdit] = useState(false); const [unit, setUnit] = useState<any>(null); const [labels, setLabels] = useState(false); const [busy, setBusy] = useState(false); const [big, setBig] = useState<string | null>(null);
  const T = today(); const av = useAvailability(T, T);
  useEffect(() => { const u = search.get('enhet'); if (u && store.U(u)) setUnit(store.U(u)); }, [search, store.db.units.length]); // eslint-disable-line
  const bookings = useMemo(() => {
    if (!m) return [];
    const end = addDays(T, 60);
    const ps = store.db.project_lines.filter(l => l.model_id === m.id).map(l => ({ l, p: store.P(l.project_id) })).filter(({ p }) => p && !['Avlyst', 'Returnert'].includes(p.status) && p.end_date >= T && p.start_date <= end)
      .map(({ l, p }) => ({ href: '/prosjekter/' + p.id, name: p.name, qty: l.qty, s: p.start_date, e: p.end_date }));
    const rs = store.db.request_lines.filter(l => l.model_id === m.id).map(l => ({ l, r: store.db.requests.find(r => r.id === l.request_id) })).filter(({ r }) => r && ['Reservert', 'Tilbud sendt'].includes(r.status) && r.end_date >= T)
      .map(({ l, r }) => ({ href: '/foresporsler/' + r.id, name: r.title + ' (forespørsel)', qty: l.qty, s: r.start_date, e: r.end_date }));
    return [...ps, ...rs].sort((a, b) => a.s.localeCompare(b.s));
  }, [m, store.db, T]);
  if (!m) return store.db.models.length ? <Head title="Fant ikke utstyret" back={['/lager', 'Lager']} /> : <div className="loading">Laster…</div>;
  const us = store.unitsOf(m.id); const a = av.get(m.id)?.available ?? 0; const tot = m.track === 'qty' ? m.stock : us.length;

  const addPhotos = async (files: File[]) => { if (!files.length) return; setBusy(true); try { await uploadPhotos(m.id, files, m.photos); await store.refresh('models'); toast(files.length === 1 ? 'Bildet er lagret' : `${files.length} bilder lagret`); } catch (e: any) { toast(e.message, 'bad'); } finally { setBusy(false); } };
  const removePhoto = async (path: string) => { const photos = m.photos.filter((p: string) => p !== path); await sb().from('models').update({ photos }).eq('id', m.id); await sb().storage.from('photos').remove([path]); await store.refresh('models'); setBig(null); };
  const makeMain = async (path: string) => { const photos = [path, ...m.photos.filter((p: string) => p !== path)]; await sb().from('models').update({ photos }).eq('id', m.id); await store.refresh('models'); setBig(null); toast('Hovedbilde endret'); };

  return <>
    <Head title={m.name} back={['/lager', 'Lager']} sub={`${m.cat}${m.sub ? ' › ' + m.sub : ''}`}
      actions={store.internal && <><button className="btn" onClick={() => setEdit(true)}>Rediger</button>{m.track === 'unit' && <button className="btn accent" onClick={async () => {
        const no = (us.reduce((x, u) => Math.max(x, u.no), 0)) + 1; const { data, error } = await sb().from('units').insert({ model_id: m.id, no, qr: newQR() }).select().single();
        if (error) return toast(error.message, 'bad'); await store.refresh('units'); setUnit(data); toast(`Enhet #${no} lagt til`);
      }}><Icon.plus /> Ny enhet</button>}</>} />
    <div className="photos big">
      {(m.photos || []).map((p: string, i: number) => <button key={p} className="ph" style={{ border: 0, padding: 0 }} onClick={() => setBig(p)}><img src={photoUrl(p)} alt={`Bilde ${i + 1} av ${m.name}`} /></button>)}
      {store.internal && <PhotoButtons id="ph" onFiles={addPhotos} />}
      {busy && <span className="small muted" style={{ alignSelf: 'center' }}>Laster opp…</span>}
    </div>
    <div className="grid2">
      <div className="card"><span className="eyebrow">Tilgjengelig i dag</span><div style={{ fontFamily: 'var(--f-display)', fontSize: '2rem', fontWeight: 900 }} className="tnum">{a}<span className="muted" style={{ fontSize: '1rem' }}> / {tot}</span></div></div>
      <div className="card"><span className="eyebrow">Booket neste 60 dager</span>{bookings.length ? bookings.map((b, i) => <Link key={i} className="small" href={b.href}><b className="tnum">{b.qty}×</b> {b.name} · <span className="tnum">{fr(b.s, b.e)}</span></Link>) : <span className="muted small">Ingen bookinger</span>}</div>
    </div>
    <div className="card"><dl className="kv">
      <dt>Pris</dt><dd>{m.price == null ? <Pill c="warn">Uten pris</Pill> : kr(m.price)}{m.price_basis && <span className="muted small"> {m.price_basis}</span>}</dd>
      {m.price_status && <><dt>Prisstatus</dt><dd>{m.price_status}{m.control_note ? ' · ' + m.control_note : ''}</dd></>}
      <dt>Lagerplass</dt><dd>{m.loc || '–'}</dd><dt>Utstyrskode</dt><dd>{m.code || '–'}</dd><dt>Rentman-ID</dt><dd>{m.rentman_id ?? '–'}</dd>
      <dt>Inspeksjon</dt><dd>{m.inspect_interval ? `hver ${m.inspect_interval}. dag` : 'Ikke satt'}</dd><dt>Nettsiden</dt><dd>{m.web ? <Pill c="acc">Vises for utleie</Pill> : 'Vises ikke'}</dd></dl>
      {m.description && <p className="small" style={{ margin: 0 }}>{m.description}</p>}{m.notes && <p className="small muted" style={{ margin: 0 }}>Notat: {m.notes}</p>}</div>

    {m.track === 'qty' ? <div className="card"><h3>Antall på lager</h3><p className="muted small" style={{ margin: 0 }}>Telles i antall, ikke enkeltvis.{m.qr && <> Felles kode: <b>{m.qr}</b>.</>}</p>
      {m.qr && <QR text={m.qr} size={96} />}
      {store.internal && <Stepper value={m.stock} onChange={async n => { store.mutate('models', r => r.map(x => x.id === m.id ? { ...x, stock: n } : x)); await sb().from('models').update({ stock: n }).eq('id', m.id); }} />}
    </div> : <div className="group"><div className="group-h"><h3>Enheter</h3>{us.some(u => u.qr) && <button className="btn sm" onClick={() => setLabels(true)}>Skriv ut QR-etiketter</button>}</div>
      <div className="list">{us.map(u => { const iv = intervalOf(store, u); const ni = iv && u.last_inspection ? addDays(u.last_inspection, iv) : null; const due = iv && (!ni || ni <= T);
        return <button key={u.id} className="item" onClick={() => setUnit(u)}>
          <span style={{ width: 36, height: 36, display: 'grid', placeItems: 'center', background: 'var(--surface-2)', borderRadius: 8, color: u.qr ? 'var(--ink)' : 'var(--warn)', fontWeight: 900 }}>{u.qr ? <Icon.scan size={20} /> : '?'}</span>
          <div className="main"><div className="t">#{u.no}{u.serial ? ' · ' + u.serial : ''}</div><div className="s">{u.qr || 'Ingen QR-kode'}{ni ? <> · neste inspeksjon <span className="tnum">{fd(ni)}</span></> : ''}</div></div>
          <div className="end">{u.status === 'service' ? <Pill c="bad">Service</Pill> : due ? <Pill c="warn">{ni ? 'Inspeksjon' : 'Ikke inspisert'}</Pill> : <Pill c="ok">OK</Pill>}</div></button>; })}</div></div>}

    {edit && <ModelSheet model={m} onClose={() => setEdit(false)} />}
    {unit && <UnitSheet unit={store.U(unit.id) || unit} onClose={() => setUnit(null)} />}
    {labels && <Sheet title="QR-etiketter" onClose={() => setLabels(false)}>
      <div className="labels print-area">{us.filter(u => u.qr).map(u => <Label key={u.id} code={u.qr} title={`${m.name} #${u.no}`} sub={m.loc || ''} />)}</div>
      <button className="btn primary block" style={{ marginTop: 12 }} onClick={() => window.print()}>Skriv ut</button>
    </Sheet>}
    {big && <Sheet title="Bilde" onClose={() => setBig(null)}><div className="form"><img src={photoUrl(big)} alt="" style={{ width: '100%', borderRadius: 12 }} />
      {store.internal && <div className="row-actions"><button className="btn" onClick={() => makeMain(big)}>Bruk som hovedbilde</button><button className="btn ghost danger" onClick={() => removePhoto(big)}><Icon.trash /> Slett bilde</button></div>}</div></Sheet>}
  </>;
}
export default function Page() { return <Suspense fallback={<div className="loading">Laster…</div>}><Utstyr /></Suspense>; }
