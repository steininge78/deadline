'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { sb } from '@/lib/supabase';
import { useStore } from '@/lib/store';
import { Empty, Icon, Sheet, Stepper, useToast } from './ui';
import { newQR } from '@/lib/util';

// Ny pakke, eller rediger innhold i eksisterende
export function KitSheet({ kit, onClose }: { kit?: any; onClose: () => void }) {
  const store = useStore(); const toast = useToast(); const router = useRouter();
  const km = kit ? store.M(kit.model_id) : null;
  const [type, setType] = useState(kit?.type || 'case');
  const [name, setName] = useState(km?.name || '');
  const [q, setQ] = useState('');
  const [sel, setSel] = useState<Record<string, number>>(() => Object.fromEntries((kit ? store.kitItems(kit.id) : []).map(i => [i.model_id, i.qty])));
  const [busy, setBusy] = useState(false);
  const chosen = Object.entries(sel).filter(([, n]) => n > 0);
  const ms = store.db.models.filter(m => m.id !== kit?.model_id && (sel[m.id] !== undefined || (q.length > 1 && m.name.toLowerCase().includes(q.toLowerCase())))).slice(0, 40);

  const save = async (e: React.FormEvent) => {
    e.preventDefault(); if (!chosen.length) return toast('Velg minst én ting i pakken', 'bad'); setBusy(true);
    try {
      let kid = kit?.id;
      if (kit) {
        await sb().from('models').update({ name }).eq('id', kit.model_id);
        await sb().from('kits').update({ type, inferred: false }).eq('id', kit.id);
        await sb().from('kit_items').delete().eq('kit_id', kit.id);
      } else {
        const { data: m, error } = await sb().from('models').insert({ name, cat: 'Utstyrspakker', sub: type === 'case' ? 'Fysisk pakke' : 'Virtuell pakke', is_kit: true, track: 'unit' }).select().single();
        if (error) throw error;
        await sb().from('units').insert({ model_id: m.id, no: 1, qr: type === 'case' ? newQR() : null });
        const { data: k, error: e2 } = await sb().from('kits').insert({ model_id: m.id, type }).select().single(); if (e2) throw e2;
        kid = k.id;
      }
      const { error } = await sb().from('kit_items').insert(chosen.map(([model_id, qty]) => ({ kit_id: kid, model_id, qty })));
      if (error) throw error;
      await store.refresh('models', 'units', 'kits', 'kit_items');
      toast(kit ? 'Innholdet er lagret' : `${name} er opprettet`); onClose();
      if (!kit) router.push('/pakker/' + kid);
    } catch (err: any) { toast(err.message, 'bad'); } finally { setBusy(false); }
  };

  return <Sheet title={kit ? 'Rediger ' + km?.name : 'Ny pakke'} onClose={onClose}>
    <form className="form" onSubmit={save}>
      <div className="seg"><button type="button" aria-pressed={type === 'case'} onClick={() => setType('case')}>Fysisk pakke</button><button type="button" aria-pressed={type === 'pakke'} onClick={() => setType('pakke')}>Virtuell pakke</button></div>
      <div className="field"><label htmlFor="kf-n">Navn</label><input className="input" id="kf-n" required value={name} onChange={e => setName(e.target.value)} placeholder="F.eks. DJ-pakke stor" /></div>
      <div className="field"><span className="eyebrow">Innhold</span>
        <div className="small muted">{chosen.length ? chosen.map(([m, n]) => `${n}× ${store.M(m)?.name}`).join(', ') : 'Ingenting valgt ennå'}</div>
        <div className="search"><Icon.search /><input value={q} onChange={e => setQ(e.target.value)} placeholder="Søk i lageret for å legge til" aria-label="Søk" /></div>
        <div className="list" style={{ maxHeight: 320, overflow: 'auto' }}>
          {ms.map(m => <div key={m.id} className="item"><div className="main"><div className="t">{m.name}</div><div className="s">{m.sub || m.cat}</div></div><Stepper value={sel[m.id] || 0} onChange={n => setSel({ ...sel, [m.id]: n })} /></div>)}
          {!ms.length && <Empty>Søk for å legge til utstyr</Empty>}
        </div></div>
      <button className="btn primary block" disabled={busy}>{busy ? 'Lagrer…' : kit ? 'Lagre innhold' : 'Opprett'}</button>
    </form>
  </Sheet>;
}
