'use client';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { kitQR, useAvailability, useStore } from '@/lib/store';
import { Head, Icon, Label } from '@/components/ui';
import { KitSheet } from '@/components/KitSheet';
import { KTYPE, kr, today } from '@/lib/util';

export default function Pakke() {
  const { id } = useParams<{ id: string }>(); const store = useStore();
  const [edit, setEdit] = useState(false); const T = today(); const av = useAvailability(T, T);
  const k = store.K(id); const m = k && store.M(k.model_id);
  if (!k || !m) return store.db.kits.length ? <Head title="Fant ikke pakken" back={['/lager', 'Lager']} /> : <div className="loading">Laster…</div>;
  const items = store.kitItems(k.id); const qr = kitQR(store, k);
  return <>
    <Head title={m.name} back={['/lager', 'Lager']} sub={`${KTYPE[k.type]} · ${m.price == null ? 'uten pris' : kr(m.price) + '/dag'}${m.loc ? ' · ' + m.loc : ''}`}
      actions={store.internal && <><Link className="btn" href={`/lager/${m.id}`}>Artikkel og bilder</Link><button className="btn accent" onClick={() => setEdit(true)}>Rediger innhold</button></>} />
    {qr ? <Label code={qr} title={m.name} sub={KTYPE[k.type]} /> : k.type === 'case' && <div className="notice warn">Pakken har ingen QR-kode. Åpne artikkelen for å lage eller knytte en kode.</div>}
    {!items.length && <div className="notice warn">Innholdet er ikke registrert. Til det er lagt inn, havner pakken som én linje på pakklista.{m.notes ? ' Notat: ' + m.notes : ''}</div>}
    {k.inferred && <div className="notice">Innholdet er foreslått ut fra artikkelnavnene ved importen. Kontroller det, og trykk «Rediger innhold» → «Lagre» for å bekrefte.</div>}
    {items.length > 0 && <><div className="list">{items.map(i => { const im = store.M(i.model_id); return <Link key={i.model_id} className="item" href={`/lager/${i.model_id}`}>
      <div className="qty tnum">{i.qty}×</div><div className="main"><div className="t">{im?.name}</div><div className="s">{im?.sub} · {av.get(i.model_id)?.available ?? 0} ledig i dag</div></div><Icon.chev className="chev" /></Link>; })}</div>
      <div className="notice">Når du legger pakken til i et prosjekt, blir den til {items.length} linjer på pakklista, samlet under pakkenavnet.</div></>}
    {edit && <KitSheet kit={k} onClose={() => setEdit(false)} />}
  </>;
}
