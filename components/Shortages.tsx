'use client';
import { useState } from 'react';
import { sb } from '@/lib/supabase';
import { lookupCode, useStore } from '@/lib/store';
import { Empty, Icon, Pill, Sheet, Stepper, useToast } from './ui';
import { Scanner } from './Scanner';
import { fd } from '@/lib/util';

const SC: Record<string, string> = { 'Åpen': 'warn', Bestilt: 'vio', 'Løst': 'ok' };

// Mangler: ting som begynner å bli lite (stropper, strømtilførsler …), meldt fra lageret eller på farta
export function ShortageList() {
  const store = useStore(); const toast = useToast(); const [all, setAll] = useState(false);
  const list = [...store.db.shortages].sort((a, b) => (+(a.status === 'Løst') - +(b.status === 'Løst')) || b.created_at.localeCompare(a.created_at)).filter(s => all || s.status !== 'Løst');
  return <div className="group"><div className="group-h"><h3>Mangler</h3><button className="btn sm ghost" onClick={() => setAll(!all)}>{all ? 'Skjul løste' : 'Vis løste'}</button></div>
    <div className="list">{list.map(s => { const m = s.model_id ? store.M(s.model_id) : null; const by = store.db.profiles.find(p => p.id === s.created_by);
      return <div key={s.id} className="item"><div className="main">
        <div className="t">{m ? m.name : (s.comment || 'Mangel').slice(0, 60)}{s.qty ? <span className="muted tnum"> · {s.qty} stk</span> : null}</div>
        <div className="s">{m && s.comment ? s.comment + ' · ' : ''}{by?.name || 'ukjent'}, <span className="tnum">{fd(s.created_at.slice(0, 10))}</span></div>
        {s.url && <a className="small" href={s.url} target="_blank" rel="noreferrer" style={{ overflowWrap: 'anywhere' }}>{s.url}</a>}
      </div>
        <select className="input" value={s.status} style={{ width: 'auto', minHeight: 36, padding: '4px 8px' }} aria-label="Status" onChange={async e => {
          const { error } = await sb().from('shortages').update({ status: e.target.value }).eq('id', s.id); if (error) return toast(error.message, 'bad');
          await store.refresh('shortages'); toast('Status oppdatert');
        }}>{Object.keys(SC).map(x => <option key={x}>{x}</option>)}</select>
      </div>; })}
      {!list.length && <Empty>Ingen meldte mangler.</Empty>}</div></div>;
}

export function ShortageSheet({ onClose }: { onClose: () => void }) {
  const store = useStore(); const toast = useToast();
  const [model, setModel] = useState<any>(null); const [qty, setQty] = useState(0); const [scan, setScan] = useState(false); const [q, setQ] = useState('');
  const hits = q.length > 1 ? store.db.models.filter(m => m.name.toLowerCase().includes(q.toLowerCase())).slice(0, 8) : [];
  if (scan) return <Scanner title="Skann utstyret" hint="Skann QR-koden på utstyret det mangler av" onClose={() => setScan(false)} onCode={code => {
    const r = lookupCode(store, code);
    const mid = r.type === 'unit' || r.type === 'kit' ? r.unit?.model_id || r.kit?.model_id : r.type === 'model' ? r.model.id : null;
    if (!mid) return { kind: 'bad', msg: 'Fant ikke utstyret' };
    setModel(store.M(mid)); setScan(false);
  }} />;
  return <Sheet title="Meld mangel" onClose={onClose}>
    <form className="form" onSubmit={async e => {
      e.preventDefault(); const d = Object.fromEntries(new FormData(e.currentTarget)) as any;
      if (!model && !d.comment.trim()) return toast('Skriv en kommentar eller velg utstyr', 'bad');
      const { error } = await sb().from('shortages').insert({ comment: d.comment.trim() || null, url: d.url.trim() || null, model_id: model?.id || null, qty: qty || null, created_by: store.me.id });
      if (error) return toast(error.message, 'bad'); await store.refresh('shortages'); toast('Mangelen er meldt'); onClose();
    }}>
      <div className="field"><span className="eyebrow">Utstyr (valgfritt)</span>
        {model ? <div className="item" style={{ padding: '8px 0' }}><div className="main"><div className="t">{model.name}</div><div className="s">{model.loc || model.sub}</div></div><button type="button" className="btn ghost sm" onClick={() => setModel(null)} aria-label="Fjern"><Icon.x /></button></div>
          : <><div className="row-actions"><button type="button" className="btn" onClick={() => setScan(true)}><Icon.scan /> Skann utstyr</button></div>
            <div className="search"><Icon.search /><input value={q} onChange={e => setQ(e.target.value)} placeholder="…eller søk i lageret" aria-label="Søk" /></div>
            {hits.length > 0 && <div className="list">{hits.map(m => <button type="button" key={m.id} className="item" onClick={() => { setModel(m); setQ(''); }}><div className="main"><div className="t">{m.name}</div><div className="s">{m.sub}</div></div></button>)}</div>}</>}
      </div>
      <div className="field"><label>Hvor mange trengs?</label><Stepper value={qty} onChange={setQty} label={qty || '–'} /></div>
      <div className="field"><label htmlFor="sh-c">Kommentar</label><textarea className="input" id="sh-c" name="comment" placeholder="F.eks. Snart tomt for 5 m spennbånd. Bestill 20." /></div>
      <div className="field"><label htmlFor="sh-u">Lenke (valgfritt)</label><input className="input" id="sh-u" name="url" type="url" inputMode="url" placeholder="https://… til produktet hos leverandør" /></div>
      <button className="btn primary block">Meld mangel</button>
    </form>
  </Sheet>;
}
