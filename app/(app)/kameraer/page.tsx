'use client';
import { useEffect, useState } from 'react';
import { sb } from '@/lib/supabase';
import { useStore } from '@/lib/store';
import { Empty, Head, Icon, Sheet, useToast } from '@/components/ui';

const KIND: Record<string, string> = { bilde: 'Stillbilde (oppdateres hvert 5. sekund)', side: 'Nettside/strøm i ramme', lenke: 'Lenke som åpnes i ny fane' };

// Overvåkningskameraer (Reolink o.l.). Adressene lagres i databasen og vises bare for interne.
export default function Kameraer() {
  const store = useStore(); const toast = useToast();
  const [edit, setEdit] = useState<any>(null); const [big, setBig] = useState<any>(null); const [tick, setTick] = useState(0);
  useEffect(() => { const t = setInterval(() => setTick(x => x + 1), 5000); return () => clearInterval(t); }, []);
  const cams = [...store.db.cameras].sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name, 'nb'));
  const src = (c: any) => c.url + (c.url.includes('?') ? '&' : '?') + '_t=' + tick;
  const insecure = (u: string) => /^http:\/\//i.test(u);
  const view = (c: any, h: number) => c.kind === 'bilde' ? <img src={src(c)} alt={c.name} style={{ width: '100%', height: h, objectFit: 'cover', borderRadius: 10, background: '#0f161c', display: 'block' }} />
    : c.kind === 'side' ? <iframe src={c.url} title={c.name} style={{ width: '100%', height: h, border: 0, borderRadius: 10, background: '#0f161c' }} allow="fullscreen; autoplay" />
    : <a className="btn block" href={c.url} target="_blank" rel="noreferrer">Åpne {c.name}</a>;
  if (!store.internal) return <Head title="Ingen tilgang" />;
  return <>
    <Head title="Kameraer" back={['/mer', 'Mer']} sub="Overvåkningskamera på lager og tomt" actions={<button className="btn accent" onClick={() => setEdit({ kind: 'bilde' })}><Icon.plus /> Legg til kamera</button>} />
    <div className="grid2">{cams.map(c => <div key={c.id} className="card" style={{ padding: 10, gap: 8 }}>
      <div onClick={() => c.kind !== 'lenke' && setBig(c)} style={{ cursor: c.kind !== 'lenke' ? 'zoom-in' : undefined }}>{view(c, 190)}</div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}><b>{c.name}</b><button className="btn ghost sm" onClick={() => setEdit(c)}>Rediger</button></div>
      {insecure(c.url) && c.kind !== 'lenke' && <div className="small" style={{ color: 'var(--warn)' }}>Adressen bruker http. Nettleseren blokkerer ofte dette på en https-side. Se tipsene under.</div>}
    </div>)}</div>
    {!cams.length && <div className="card"><Empty>Ingen kameraer lagt inn ennå.</Empty></div>}
    <div className="card small" style={{ gap: 6 }}><b>Tips for Reolink</b>
      <span>• <b>Stillbilde:</b> <code style={{ overflowWrap: 'anywhere' }}>https://ADRESSE/cgi-bin/api.cgi?cmd=Snap&amp;channel=0&amp;rs=dl&amp;user=BRUKER&amp;password=PASSORD</code></span>
      <span>• Kameraet må kunne nås fra telefonen: samme nettverk, via VPN (f.eks. Tailscale), eller via en sikker videresending. Lag en egen Reolink-bruker med bare visningsrett til dette.</span>
      <span>• Fungerer ikke direktebildet, velg «Lenke» og pek på Reolink-appen eller kameraets nettside.</span></div>
    {big && <Sheet title={big.name} onClose={() => setBig(null)}>{view(big, 420)}</Sheet>}
    {edit && <Sheet title={edit.id ? 'Rediger kamera' : 'Nytt kamera'} onClose={() => setEdit(null)}>
      <form className="form" onSubmit={async e => {
        e.preventDefault(); const d = Object.fromEntries(new FormData(e.currentTarget)) as any;
        const row = { name: d.name.trim(), url: d.url.trim(), kind: d.kind, sort: +d.sort || 0 };
        const { error } = edit.id ? await sb().from('cameras').update(row).eq('id', edit.id) : await sb().from('cameras').insert(row);
        if (error) return toast(error.message, 'bad'); await store.refresh('cameras'); setEdit(null); toast('Kameraet er lagret');
      }}>
        <div className="field"><label htmlFor="c-n">Navn</label><input className="input" id="c-n" name="name" required defaultValue={edit.name} placeholder="F.eks. Lager inngang" /></div>
        <div className="field"><label htmlFor="c-u">Adresse</label><input className="input" id="c-u" name="url" required type="url" inputMode="url" defaultValue={edit.url} placeholder="https://…" /><span className="hint">Lim inn adressen til kameraets bilde, strøm eller nettside.</span></div>
        <div className="field"><label htmlFor="c-k">Visning</label><select className="input" id="c-k" name="kind" defaultValue={edit.kind}>{Object.entries(KIND).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
        <div className="field"><label htmlFor="c-s">Rekkefølge</label><input className="input" id="c-s" name="sort" type="number" inputMode="numeric" defaultValue={edit.sort ?? 0} /></div>
        <button className="btn primary block">Lagre</button>
        {edit.id && <button type="button" className="btn ghost danger" onClick={async () => { await sb().from('cameras').delete().eq('id', edit.id); await store.refresh('cameras'); setEdit(null); }}><Icon.trash /> Slett kamera</button>}
      </form>
    </Sheet>}
  </>;
}
