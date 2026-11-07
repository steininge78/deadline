'use client';
import { useState } from 'react';
import { sb } from '@/lib/supabase';
import { useStore } from '@/lib/store';
import { Empty, Icon, Pill, Sheet, Stepper, useToast } from '@/components/ui';
import { kr } from '@/lib/util';

export function Consumables() {
  const store = useStore(); const toast = useToast(); const [edit, setEdit] = useState<any>(null);
  const setStock = async (c: any, stock: number) => {
    store.mutate('consumables', rows => rows.map(r => r.id === c.id ? { ...r, stock } : r));
    const { error } = await sb().from('consumables').update({ stock }).eq('id', c.id); if (error) toast(error.message, 'bad');
  };
  const list = [...store.db.consumables].sort((a, b) => (+(b.min && b.stock < b.min) - +(a.min && a.stock < a.min)) || a.name.localeCompare(b.name, 'nb'));
  return <>
    <div className="list">{list.map(c => { const low = c.min && c.stock < c.min; return <div key={c.id} className="item">
      <div className="main" onClick={() => setEdit(c)} style={{ cursor: 'pointer' }}><div className="t">{c.name}</div><div className="s tnum">{c.min ? `Minimum ${c.min} ${c.unit}` : 'Minimum ikke satt'}{c.price != null ? ' · ' + kr(c.price) : ''}</div></div>
      {low ? <Pill c="bad">Bestill</Pill> : null}<Stepper value={c.stock} onChange={n => setStock(c, n)} />
    </div>; })}{!list.length && <Empty>Ingen salgs- eller forbruksvarer ennå.</Empty>}</div>
    {store.internal && <button className="btn" onClick={() => setEdit({})}><Icon.plus /> Ny vare</button>}
    {edit && <Sheet title={edit.id ? edit.name : 'Ny vare'} onClose={() => setEdit(null)}>
      <form className="form" onSubmit={async e => {
        e.preventDefault(); const d = Object.fromEntries(new FormData(e.currentTarget)) as any;
        const row = { name: d.name, unit: d.unit || 'stk', stock: +d.stock || 0, min: +d.min || 0, price: d.price === '' ? null : +d.price };
        const { error } = edit.id ? await sb().from('consumables').update(row).eq('id', edit.id) : await sb().from('consumables').insert(row);
        if (error) return toast(error.message, 'bad'); await store.refresh('consumables'); setEdit(null); toast('Lagret');
      }}>
        <div className="field"><label htmlFor="c-n">Navn</label><input className="input" id="c-n" name="name" required defaultValue={edit.name} /></div>
        <div className="frow"><div className="field"><label htmlFor="c-s">På lager</label><input className="input" id="c-s" name="stock" type="number" min="0" inputMode="numeric" defaultValue={edit.stock ?? 0} /></div>
          <div className="field"><label htmlFor="c-m">Minimum</label><input className="input" id="c-m" name="min" type="number" min="0" inputMode="numeric" defaultValue={edit.min ?? 0} /></div></div>
        <div className="frow"><div className="field"><label htmlFor="c-u">Enhet</label><input className="input" id="c-u" name="unit" defaultValue={edit.unit || 'stk'} /></div>
          <div className="field"><label htmlFor="c-p">Pris (kr)</label><input className="input" id="c-p" name="price" type="number" min="0" step="any" defaultValue={edit.price ?? ''} /></div></div>
        <button className="btn primary block">Lagre</button>
        {edit.id && <button type="button" className="btn ghost danger" onClick={async () => { await sb().from('consumables').delete().eq('id', edit.id); await store.refresh('consumables'); setEdit(null); }}><Icon.trash /> Slett vare</button>}
      </form>
    </Sheet>}
  </>;
}
