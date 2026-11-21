'use client';
import { Fragment, useState } from 'react';
import { sb } from '@/lib/supabase';
import { useStore } from '@/lib/store';
import { Empty, Icon, Sheet, useToast } from './ui';

const KINDS = ['Manual', 'Driver', 'Fixture-fil', 'Kalibrering', 'Datablad', 'Annet'];
const size = (b: number) => b > 1e6 ? (b / 1e6).toFixed(1) + ' MB' : Math.max(1, Math.round(b / 1e3)) + ' kB';

// Manualer, drivere, fixture-filer o.l. på produktet (privat bøtte, åpnes med tidsbegrenset lenke)
export function ModelFiles({ model }: { model: any }) {
  const store = useStore(); const toast = useToast();
  const [kind, setKind] = useState('Manual'); const [busy, setBusy] = useState(false);
  const files = store.db.model_files.filter(f => f.model_id === model.id).sort((a, b) => a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name));
  const upload = async (list: File[]) => {
    if (!list.length) return; setBusy(true);
    try {
      for (const f of list) {
        if (f.size > 50e6) { toast(`${f.name} er større enn 50 MB`, 'bad'); continue; }
        const safe = f.name.replace(/[^\w.\-]+/g, '_');
        const path = `${model.id}/${Date.now()}-${safe}`;
        const { error } = await sb().storage.from('files').upload(path, f, { contentType: f.type || 'application/octet-stream' });
        if (error) throw error;
        const { error: e2 } = await sb().from('model_files').insert({ model_id: model.id, name: f.name, kind, path, size: f.size, created_by: store.me.id });
        if (e2) throw e2;
      }
      await store.refresh('model_files'); toast(list.length === 1 ? 'Filen er lastet opp' : `${list.length} filer lastet opp`);
    } catch (e: any) { toast(e.message, 'bad'); } finally { setBusy(false); }
  };
  const open = async (f: any) => {
    const { data, error } = await sb().storage.from('files').createSignedUrl(f.path, 3600, { download: f.name });
    if (error) return toast(error.message, 'bad'); window.open(data.signedUrl, '_blank');
  };
  const remove = async (f: any) => {
    if (!window.confirm(`Slette ${f.name}?`)) return;
    await sb().storage.from('files').remove([f.path]); await sb().from('model_files').delete().eq('id', f.id); await store.refresh('model_files');
  };
  return <div className="group"><div className="group-h"><h3>Filer og manualer</h3></div>
    <div className="list">{files.map(f => <div key={f.id} className="item">
      <div className="main" onClick={() => open(f)} style={{ cursor: 'pointer' }}><div className="t">{f.name}</div><div className="s">{f.kind}{f.size ? ' · ' + size(f.size) : ''}</div></div>
      <button className="btn sm" onClick={() => open(f)}>Åpne</button>
      {store.internal && <button className="btn ghost sm" aria-label={'Slett ' + f.name} onClick={() => remove(f)}><Icon.trash /></button>}
    </div>)}{!files.length && <Empty>Ingen filer ennå. Legg til manualer, drivere, fixture-filer eller kalibreringsfiler.</Empty>}</div>
    {store.internal && <div className="row-actions" style={{ alignItems: 'center' }}>
      <select className="input" value={kind} onChange={e => setKind(e.target.value)} style={{ width: 'auto', minHeight: 40 }} aria-label="Type fil">{KINDS.map(k => <option key={k}>{k}</option>)}</select>
      <label className="btn" htmlFor="mf-files"><Icon.upload /> {busy ? 'Laster opp…' : 'Last opp filer'}</label>
      <input id="mf-files" type="file" multiple hidden onChange={e => { upload([...(e.target.files || [])]); e.target.value = ''; }} />
    </div>}
  </div>;
}

// Tekniske spesifikasjoner (fritt nøkkel/verdi), med AI-oppslag på nett
export function ModelSpecs({ model }: { model: any }) {
  const store = useStore(); const toast = useToast();
  const [edit, setEdit] = useState(false); const [ai, setAi] = useState<any>(null); const [busy, setBusy] = useState(false);
  const specs: Record<string, string> = model.specs || {};
  const entries = Object.entries(specs);
  const save = async (next: Record<string, string>, source?: string) => {
    const { error } = await sb().from('models').update({ specs: next, ...(source ? { specs_source: source } : {}) }).eq('id', model.id);
    if (error) return toast(error.message, 'bad'); await store.refresh('models'); toast('Spesifikasjonene er lagret');
  };
  const lookup = async () => {
    setBusy(true);
    try {
      const res = await fetch('/api/admin/specs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ modelId: model.id }) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || 'Oppslaget feilet');
      if (!j.specs || !Object.keys(j.specs).length) throw new Error('Fant ingen spesifikasjoner. Prøv å gjøre produktnavnet mer presist.');
      setAi(j);
    } catch (e: any) { toast(e.message, 'bad'); } finally { setBusy(false); }
  };
  return <div className="group"><div className="group-h"><h3>Spesifikasjoner</h3>
    {store.internal && <div className="row-actions"><button className="btn sm" onClick={lookup} disabled={busy}>{busy ? 'Søker på nett…' : '✦ Finn med AI'}</button><button className="btn sm" onClick={() => setEdit(true)}>Rediger</button></div>}</div>
    <div className="card">{entries.length ? <dl className="kv">{entries.map(([k, v]) => <Fragment key={k}><dt>{k}</dt><dd>{v}</dd></Fragment>)}</dl> : <span className="muted small">Ingen spesifikasjoner registrert.</span>}
      {model.specs_source && <div className="small muted" style={{ overflowWrap: 'anywhere' }}>Kilde: {model.specs_source}</div>}</div>
    {edit && <SpecEditor initial={specs} onClose={() => setEdit(false)} onSave={async s => { await save(s); setEdit(false); }} />}
    {ai && <Sheet title="Forslag fra AI" onClose={() => setAi(null)}><div className="form">
      <p className="small muted" style={{ margin: 0 }}>Hentet fra nettet for «{model.name}». Sjekk at det stemmer med akkurat deres modell før du lagrer.</p>
      <dl className="kv">{Object.entries(ai.specs).map(([k, v]: any) => <Fragment key={k}><dt>{k}</dt><dd>{String(v)}</dd></Fragment>)}</dl>
      {ai.sources?.length > 0 && <div className="small muted">Kilder: {ai.sources.slice(0, 4).map((s: string, i: number) => <a key={i} href={s} target="_blank" rel="noreferrer" style={{ marginRight: 8, overflowWrap: 'anywhere' }}>{new URL(s).hostname}</a>)}</div>}
      <div className="row-actions">
        <button className="btn primary" onClick={async () => { await save({ ...specs, ...ai.specs }, (ai.sources || []).slice(0, 3).join(' ')); setAi(null); }}>Legg til i produktet</button>
        <button className="btn" onClick={async () => { await save(ai.specs, (ai.sources || []).slice(0, 3).join(' ')); setAi(null); }}>Erstatt eksisterende</button>
      </div></div></Sheet>}
  </div>;
}

function SpecEditor({ initial, onClose, onSave }: { initial: Record<string, string>; onClose: () => void; onSave: (s: Record<string, string>) => void }) {
  const [rows, setRows] = useState<[string, string][]>(() => { const e = Object.entries(initial); return e.length ? e : [['', '']]; });
  return <Sheet title="Rediger spesifikasjoner" onClose={onClose}><div className="form">
    {rows.map(([k, v], i) => <div key={i} className="frow" style={{ gridTemplateColumns: '1fr 1.4fr auto', alignItems: 'end' }}>
      <input className="input" value={k} placeholder="F.eks. Strømforbruk" aria-label="Egenskap" onChange={e => setRows(rows.map((r, j) => j === i ? [e.target.value, r[1]] : r))} />
      <input className="input" value={v} placeholder="F.eks. 450 W" aria-label="Verdi" onChange={e => setRows(rows.map((r, j) => j === i ? [r[0], e.target.value] : r))} />
      <button className="btn ghost sm" aria-label="Fjern rad" onClick={() => setRows(rows.filter((_, j) => j !== i))}><Icon.x /></button>
    </div>)}
    <button className="btn sm" onClick={() => setRows([...rows, ['', '']])}><Icon.plus /> Legg til rad</button>
    <button className="btn primary block" onClick={() => onSave(Object.fromEntries(rows.filter(([k]) => k.trim()).map(([k, v]) => [k.trim(), v.trim()])))}>Lagre</button>
  </div></Sheet>;
}
