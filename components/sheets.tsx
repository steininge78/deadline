'use client';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { sb, photoUrl } from '@/lib/supabase';
import { intervalOf, unitLabel, useAvailability, useStore, lookupCode } from '@/lib/store';
import { Icon, Label, Pill, Sheet, Stepper, useToast } from './ui';
import { Scanner } from './Scanner';
import { KTYPE, PSTATUS, fd, addDays, kr, newQR, shrinkImage, today } from '@/lib/util';

export async function uploadPhotos(modelId: string, files: File[], existing: string[] = []) {
  const paths: string[] = [];
  for (const f of files) {
    const blob = await shrinkImage(f);
    const path = `${modelId}/${Date.now()}-${Math.random().toString(36).slice(2, 6)}.jpg`;
    const { error } = await sb().storage.from('photos').upload(path, blob, { contentType: 'image/jpeg' });
    if (error) throw error;
    paths.push(path);
  }
  const all = [...existing, ...paths];
  const { error } = await sb().from('models').update({ photos: all }).eq('id', modelId);
  if (error) throw error;
  return all;
}

export function PhotoButtons({ id, onFiles, small }: { id: string; onFiles: (f: File[]) => void; small?: boolean }) {
  return <>
    <label className={small ? 'btn sm' : 'phadd'} htmlFor={id + '-cam'}><Icon.camera size={small ? 18 : 26} /><span>Ta bilde</span></label>
    <label className={small ? 'btn sm' : 'phadd'} htmlFor={id + '-up'}><Icon.upload size={small ? 18 : 26} /><span>Last opp</span></label>
    <input id={id + '-cam'} type="file" accept="image/*" capture="environment" hidden onChange={e => { onFiles([...(e.target.files || [])]); e.target.value = ''; }} />
    <input id={id + '-up'} type="file" accept="image/*" multiple hidden onChange={e => { onFiles([...(e.target.files || [])]); e.target.value = ''; }} />
  </>;
}

// ----- Nytt / rediger utstyr -----
export function ModelSheet({ model, code, onClose }: { model?: any; code?: string; onClose: () => void }) {
  const store = useStore(); const toast = useToast(); const router = useRouter();
  const cats = useMemo(() => [...new Set(store.db.models.map(m => m.cat))].sort(), [store.db.models]);
  const subs = useMemo(() => [...new Set(store.db.models.map(m => m.sub).filter(Boolean))].sort(), [store.db.models]);
  const [files, setFiles] = useState<File[]>([]); const [busy, setBusy] = useState(false);
  const isNew = !model;
  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault(); setBusy(true);
    const d = Object.fromEntries(new FormData(e.currentTarget)) as any;
    const fields = { name: d.name.trim(), cat: d.cat || 'Uten kategori', sub: d.sub || null, price: d.price === '' ? null : +d.price, loc: d.loc || null, inspect_interval: +d.interval || 0, web: !!d.web, web_description: d.web_description || null };
    try {
      let id = model?.id;
      if (isNew) {
        const { data, error } = await sb().from('models').insert({ ...fields, track: d.track, stock: d.track === 'qty' ? +d.qty || 0 : 0 }).select().single();
        if (error) throw error; id = data.id;
        if (d.track === 'unit') {
          const n = Math.max(1, +d.qty || 1);
          const rows = Array.from({ length: n }, (_, i) => ({ model_id: id, no: i + 1, qr: i === 0 && code ? code : newQR() }));
          const { error: e2 } = await sb().from('units').insert(rows); if (e2) throw e2;
        }
      } else {
        const { error } = await sb().from('models').update(fields).eq('id', id); if (error) throw error;
      }
      if (files.length) await uploadPhotos(id, files, model?.photos || []);
      await store.refresh('models', 'units');
      toast(isNew ? `${fields.name} er lagt til` : 'Lagret'); onClose();
      if (isNew) router.push('/lager/' + id);
    } catch (err: any) { toast(err.message, 'bad'); } finally { setBusy(false); }
  };
  return <Sheet title={isNew ? 'Nytt utstyr' : 'Rediger ' + model.name} onClose={onClose}>
    <form className="form" onSubmit={submit}>
      {isNew && <div className="field"><span className="eyebrow">Bilder</span>
        <div className="photos">{files.map((f, i) => <span className="ph" key={i}><img src={URL.createObjectURL(f)} alt="" /><button type="button" onClick={() => setFiles(files.filter((_, j) => j !== i))} aria-label="Fjern"><Icon.x size={14} /></button></span>)}
          <PhotoButtons id="mf" onFiles={f => setFiles([...files, ...f])} /></div></div>}
      <div className="field"><label htmlFor="mf-n">Navn</label><input className="input" id="mf-n" name="name" required defaultValue={model?.name} placeholder="Produsent og modell" /></div>
      <div className="frow stack">
        <div className="field"><label htmlFor="mf-c">Kategori</label><input className="input" id="mf-c" name="cat" list="mf-cats" defaultValue={model?.cat} required /><datalist id="mf-cats">{cats.map(c => <option key={c} value={c} />)}</datalist></div>
        <div className="field"><label htmlFor="mf-s">Underkategori</label><input className="input" id="mf-s" name="sub" list="mf-subs" defaultValue={model?.sub} /><datalist id="mf-subs">{subs.map(c => <option key={c} value={c} />)}</datalist></div>
      </div>
      <div className="frow stack">
        <div className="field"><label htmlFor="mf-p">Dagpris (kr eks. mva.)</label><input className="input" id="mf-p" name="price" type="number" min="0" step="any" inputMode="decimal" defaultValue={model?.price ?? ''} placeholder="Tom = uten pris" /></div>
        <div className="field"><label htmlFor="mf-l">Lagerplass</label><input className="input" id="mf-l" name="loc" defaultValue={model?.loc} /></div>
      </div>
      {isNew && <>
        <div className="field"><label htmlFor="mf-t">Sporing</label><select className="input" id="mf-t" name="track"><option value="unit">Enkeltenheter med QR-kode</option><option value="qty">Antall (servise, kabler, småutstyr)</option></select></div>
        <div className="field"><label htmlFor="mf-q">Antall</label><input className="input" id="mf-q" name="qty" type="number" min="1" defaultValue="1" inputMode="numeric" /><span className="hint">{code ? `Første enhet får koden ${code}, resten får nye koder.` : 'Hver enhet får en unik QR-kode automatisk.'}</span></div>
      </>}
      <div className="field"><label htmlFor="mf-i">Inspeksjonsintervall (dager)</label><input className="input" id="mf-i" name="interval" type="number" min="0" inputMode="numeric" defaultValue={model?.inspect_interval ?? 0} /><span className="hint">0 = ingen fast inspeksjon. Kan overstyres per enhet.</span></div>
      <label style={{ display: 'flex', gap: 10, alignItems: 'center', fontWeight: 600 }}><input type="checkbox" name="web" defaultChecked={model?.web} style={{ width: 22, height: 22, accentColor: 'var(--orange)' }} /> Vis på nettsiden for utleie</label>
      <div className="field"><label htmlFor="mf-w">Tekst på nettsiden</label><textarea className="input" id="mf-w" name="web_description" defaultValue={model?.web_description || ''} placeholder="Kort beskrivelse for kunder (valgfritt)" /></div>
      <button className="btn primary block" disabled={busy}>{busy ? 'Lagrer…' : isNew ? 'Legg til i lageret' : 'Lagre'}</button>
    </form>
  </Sheet>;
}

// ----- Enhet: QR, inspeksjon, feil -----
export function UnitSheet({ unit, onClose }: { unit: any; onClose: () => void }) {
  const store = useStore(); const toast = useToast(); const m = store.M(unit.model_id);
  const [linking, setLinking] = useState(false); const [fault, setFault] = useState(false);
  const iv = intervalOf(store, unit); const next = iv && unit.last_inspection ? addDays(unit.last_inspection, iv) : null;
  const upd = async (patch: any, msg: string) => { const { error } = await sb().from('units').update(patch).eq('id', unit.id); if (error) return toast(error.message, 'bad'); await store.refresh('units'); toast(msg); };
  if (linking) return <Scanner title={'Knytt kode til ' + unitLabel(store, unit)} hint="Skann klistremerket som allerede sitter på utstyret" onClose={() => setLinking(false)} onCode={async code => {
    const r = lookupCode(store, code); if (r.type !== 'none') return { kind: 'bad', msg: 'Koden er allerede i bruk' };
    await upd({ qr: code.trim().toUpperCase() }, `${code} er knyttet til ${unitLabel(store, unit)}`); onClose();
  }} />;
  if (fault) return <FaultSheet unit={unit} onClose={onClose} />;
  return <Sheet title={unitLabel(store, unit)} onClose={onClose}>
    <div className="form">
      {unit.qr ? <Label code={unit.qr} title={unitLabel(store, unit)} sub={unit.serial ? 'S/N ' + unit.serial : m?.loc || ''} /> : <div className="notice warn">Enheten har ingen QR-kode ennå.</div>}
      {store.internal && <div className="row-actions"><button className="btn" onClick={async () => { await upd({ qr: newQR() }, 'Ny QR-kode laget'); onClose(); }}>{unit.qr ? 'Lag ny kode' : 'Lag QR-kode'}</button><button className="btn" onClick={() => setLinking(true)}><Icon.scan /> Knytt eksisterende kode</button></div>}
      <dl className="kv"><dt>Serienummer</dt><dd>{unit.serial || '–'}</dd><dt>Status</dt><dd>{unit.status === 'service' ? <Pill c="bad">På service</Pill> : <Pill c="ok">I drift</Pill>}</dd>
        <dt>Sist inspisert</dt><dd className="tnum">{unit.last_inspection ? fd(unit.last_inspection) : 'Ikke registrert'}</dd><dt>Neste inspeksjon</dt><dd className="tnum">{next ? fd(next) : iv ? 'Snarest' : 'Intervall ikke satt'}</dd></dl>
      {store.internal && <>
        <div className="frow"><div className="field"><label htmlFor="u-int">Eget intervall (dager)</label><input className="input" id="u-int" type="number" min="0" inputMode="numeric" defaultValue={unit.inspect_interval ?? ''} placeholder={String(m?.inspect_interval || 0)} onBlur={e => upd({ inspect_interval: e.target.value === '' ? null : +e.target.value }, 'Intervall lagret')} /></div>
          <div className="field"><label htmlFor="u-ser">Serienummer</label><input className="input" id="u-ser" defaultValue={unit.serial || ''} onBlur={e => e.target.value !== (unit.serial || '') && upd({ serial: e.target.value || null }, 'Serienummer lagret')} /></div></div>
        <div className="row-actions">
          <button className="btn primary" onClick={async () => { await sb().from('inspections').insert({ unit_id: unit.id, user_id: store.me.id }); await upd({ last_inspection: today(), status: unit.status === 'service' ? 'ok' : unit.status }, 'Inspeksjon registrert'); onClose(); }}><Icon.check /> Inspisert i dag</button>
          <button className="btn" onClick={() => setFault(true)}>Meld feil</button>
        </div>
      </>}
    </div>
  </Sheet>;
}

export function FaultSheet({ unit, onClose }: { unit: any; onClose: () => void }) {
  const store = useStore(); const toast = useToast();
  return <Sheet title="Meld feil" onClose={onClose}>
    <form className="form" onSubmit={async e => {
      e.preventDefault(); const d = new FormData(e.currentTarget);
      const { error } = await sb().from('tickets').insert({ unit_id: unit.id, issue: d.get('issue'), created_by: store.me.id });
      if (error) return toast(error.message, 'bad');
      if (d.get('block')) await sb().from('units').update({ status: 'service' }).eq('id', unit.id);
      await store.refresh('tickets', 'units'); toast('Feilmelding registrert'); onClose();
    }}>
      <div className="field"><label>Utstyr</label><div style={{ fontWeight: 700 }}>{unitLabel(store, unit)}</div></div>
      <div className="field"><label htmlFor="ff-i">Hva er feil?</label><textarea className="input" id="ff-i" name="issue" required /></div>
      <label style={{ display: 'flex', gap: 10, alignItems: 'center' }}><input type="checkbox" name="block" defaultChecked style={{ width: 20, height: 20, accentColor: 'var(--orange)' }} /> Sett enheten ut av drift</label>
      <button className="btn primary block">Send</button>
    </form>
  </Sheet>;
}

// ----- Velg utstyr / pakker (til pakkliste eller forespørsel) -----
export function Picker({ title, start, end, exProject, exRequest, onPick, onClose }: {
  title: string; start: string; end: string; exProject?: string; exRequest?: string;
  onPick: (sel: [string, number][], kit: any | null) => void; onClose: () => void;
}) {
  const store = useStore(); const av = useAvailability(start, end, exProject, exRequest);
  const [q, setQ] = useState(''); const [cat, setCat] = useState('Alle'); const [sel, setSel] = useState<Record<string, number>>({});
  const cats = useMemo(() => [...new Set(store.db.models.map(m => m.cat))].sort(), [store.db.models]);
  const ql = q.toLowerCase();
  const kits = store.db.kits.map(k => ({ ...k, m: store.M(k.model_id) })).filter(k => k.m && (cat === 'Alle' || cat === 'Pakker') && k.m.name.toLowerCase().includes(ql));
  const all = cat === 'Pakker' ? [] : store.db.models.filter(m => m.active && !store.kitOfModel(m.id) && (cat === 'Alle' || m.cat === cat) && (m.name + ' ' + (m.code || '')).toLowerCase().includes(ql));
  const ms = all.slice(0, 40);
  const n = Object.values(sel).filter(x => x > 0).length;
  return <Sheet title={title} onClose={onClose}>
    <div className="form">
      <div className="search"><Icon.search /><input value={q} onChange={e => setQ(e.target.value)} placeholder="Søk i lageret" aria-label="Søk" /></div>
      <div className="chips">{['Alle', 'Pakker', ...cats].map(c => <button key={c} className="chip" aria-pressed={c === cat} onClick={() => setCat(c)}>{c}</button>)}</div>
      <div className="list">
        {kits.slice(0, cat === 'Pakker' ? 99 : 5).map(k => { const items = store.kitItems(k.id); return <button key={k.id} className="item" onClick={() => onPick([], k)}>
          <span style={{ color: 'var(--violet-ink)' }}>{k.type === 'case' ? <Icon.case size={22} /> : <Icon.layers size={22} />}</span>
          <div className="main"><div className="t">{k.m.name}</div><div className="s">{KTYPE[k.type]} · {items.length ? items.map(i => `${i.qty}× ${store.M(i.model_id)?.name}`).join(', ') : 'innhold ikke registrert, legges til som én linje'}</div></div><Icon.plus /></button>; })}
        {ms.map(m => { const a = av.get(m.id)?.available ?? 0; return <div key={m.id} className="item">
          <div className="main"><div className="t">{m.name}</div><div className="s">{m.sub || m.cat} · {m.price == null ? 'uten pris' : kr(m.price) + '/dag'}</div></div>
          <Pill c={a > 0 ? 'ok' : 'bad'}>{a} ledig</Pill>
          <Stepper value={sel[m.id] || 0} onChange={v => setSel({ ...sel, [m.id]: v })} />
        </div>; })}
        {all.length > ms.length && <div className="item small muted">Viser 40 av {all.length}. Søk for å finne resten.</div>}
        {!kits.length && !ms.length && <div className="empty">Ingen treff</div>}
      </div>
      <button className="btn primary block" disabled={!n} onClick={() => onPick(Object.entries(sel).filter(([, v]) => v > 0) as any, null)}>Legg til {n || ''} valgte</button>
    </div>
  </Sheet>;
}

// ----- Prosjektskjema -----
export function ProjectSheet({ project, defaults, onClose, onSaved }: { project?: any; defaults?: any; onClose: () => void; onSaved?: (p: any) => void }) {
  const store = useStore(); const toast = useToast(); const p = project || defaults || {};
  const customers = [...new Set(store.db.projects.map(x => x.customer).filter(Boolean))];
  return <Sheet title={project ? 'Rediger prosjekt' : 'Nytt prosjekt'} onClose={onClose}>
    <form className="form" onSubmit={async e => {
      e.preventDefault(); const d = Object.fromEntries(new FormData(e.currentTarget)) as any;
      if (d.end_date < d.start_date) return toast('Til-dato kan ikke være før fra-dato', 'bad');
      const q = project ? sb().from('projects').update(d).eq('id', project.id).select().single() : sb().from('projects').insert({ ...d, created_by: store.me.id }).select().single();
      const { data, error } = await q; if (error) return toast(error.message, 'bad');
      await store.refresh('projects'); toast(project ? 'Prosjektet er oppdatert' : 'Prosjektet er opprettet'); onSaved?.(data); onClose();
    }}>
      <div className="field"><label htmlFor="pf-name">Prosjektnavn</label><input className="input" id="pf-name" name="name" required defaultValue={p.name} placeholder="F.eks. Sommerfest Kunde AS" /></div>
      <div className="field"><label htmlFor="pf-cust">Kunde</label><input className="input" id="pf-cust" name="customer" required defaultValue={p.customer} list="custlist" /><datalist id="custlist">{customers.map(c => <option key={c} value={c} />)}</datalist></div>
      <div className="field"><label htmlFor="pf-asana">Prosjektnummer i Asana</label><input className="input" id="pf-asana" name="asana" required defaultValue={p.asana} /></div>
      <div className="frow"><div className="field"><label htmlFor="pf-start">Fra</label><input className="input" type="date" id="pf-start" name="start_date" required defaultValue={p.start_date || today()} /></div>
        <div className="field"><label htmlFor="pf-end">Til</label><input className="input" type="date" id="pf-end" name="end_date" required defaultValue={p.end_date || today()} /></div></div>
      <div className="frow stack"><div className="field"><label htmlFor="pf-venue">Sted</label><input className="input" id="pf-venue" name="venue" defaultValue={p.venue} /></div>
        <div className="field"><label htmlFor="pf-contact">Kontaktperson</label><input className="input" id="pf-contact" name="contact" defaultValue={p.contact} /></div></div>
      <div className="field"><label htmlFor="pf-status">Status</label><select className="input" id="pf-status" name="status" defaultValue={p.status || 'Planlagt'}>{Object.keys(PSTATUS).map(s => <option key={s}>{s}</option>)}</select></div>
      <button className="btn primary block">{project ? 'Lagre endringer' : 'Opprett prosjekt'}</button>
      {project && store.admin && <button type="button" className="btn ghost danger" onClick={async () => {
        if (!window.confirm('Slette prosjektet og pakklista for godt?')) return;
        const { error } = await sb().from('projects').delete().eq('id', project.id); if (error) return toast(error.message, 'bad');
        await store.refresh('projects', 'project_lines'); location.href = '/prosjekter';
      }}><Icon.trash /> Slett prosjekt</button>}
    </form>
  </Sheet>;
}

export const photoOf = (m: any) => m?.photos?.length ? photoUrl(m.photos[0]) : null;
