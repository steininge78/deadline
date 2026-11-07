'use client';
import { useState } from 'react';
import { sb } from '@/lib/supabase';
import { unitLabel, useStore } from '@/lib/store';
import { Icon, Pill, Sheet } from './ui';
import { ModelSheet } from './sheets';

// Ukjent kode skannet: knytt til en enhet uten kode, eller registrer nytt utstyr med koden
export function LinkCodeSheet({ code, onClose, onDone }: { code: string; onClose: () => void; onDone: (msg: string) => void }) {
  const store = useStore(); const [q, setQ] = useState(''); const [create, setCreate] = useState(false);
  if (create) return <ModelSheet code={code} onClose={onClose} />;
  const unl = store.db.units.filter(u => !u.qr && unitLabel(store, u).toLowerCase().includes(q.toLowerCase()));
  return <Sheet title={'Ny kode: ' + code} onClose={onClose}>
    <div className="form">
      <div className="notice">Koden finnes ikke i systemet. Knytt den til en enhet som mangler QR-kode, eller registrer nytt utstyr.</div>
      <div className="search"><Icon.search /><input value={q} onChange={e => setQ(e.target.value)} placeholder="Søk blant enheter uten QR" aria-label="Søk" /></div>
      <div className="list">
        {unl.slice(0, 30).map(u => { const m = store.M(u.model_id); return <button key={u.id} className="item" onClick={async () => {
          const { error } = await sb().from('units').update({ qr: code.toUpperCase() }).eq('id', u.id);
          if (error) return onDone(error.message);
          await store.refresh('units'); onDone(`${code} er knyttet til ${unitLabel(store, u)}`);
        }}><div className="main"><div className="t">{unitLabel(store, u)}</div><div className="s">{m?.sub}{m?.loc ? ' · ' + m.loc : ''}</div></div><Pill c="warn">Mangler QR</Pill></button>; })}
        {unl.length > 30 && <div className="item small muted">Viser 30 av {unl.length}. Søk for å finne riktig.</div>}
        {!unl.length && <div className="empty">Ingen treff</div>}
      </div>
      <button className="btn primary block" onClick={() => setCreate(true)}><Icon.plus /> Registrer nytt utstyr med denne koden</button>
    </div>
  </Sheet>;
}
