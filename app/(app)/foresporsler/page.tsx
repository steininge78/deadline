'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { sb } from '@/lib/supabase';
import { useStore } from '@/lib/store';
import { Empty, Head, Icon, Pill, Sheet, useToast } from '@/components/ui';
import { RSTATUS, fr, today } from '@/lib/util';

export default function Foresporsler() {
  const store = useStore(); const toast = useToast(); const router = useRouter();
  const [creating, setCreating] = useState(false); const [show, setShow] = useState('Åpne');
  const open = (r: any) => !['Akseptert', 'Avslått'].includes(r.status);
  const list = store.db.requests.filter(r => show === 'Alle' || open(r)).sort((a, b) => a.start_date.localeCompare(b.start_date));
  return <>
    <Head title="Forespørsler" back={['/mer', 'Mer']} sub="Sjekk ledighet, reserver og send tilbud" actions={<button className="btn accent" onClick={() => setCreating(true)}><Icon.plus /> Ny forespørsel</button>} />
    <div className="chips">{['Åpne', 'Alle'].map(k => <button key={k} className="chip" aria-pressed={k === show} onClick={() => setShow(k)}>{k}</button>)}</div>
    <div className="list">{list.map(r => {
      const expired = r.status === 'Reservert' && r.hold_until && new Date(r.hold_until) < new Date();
      return <Link key={r.id} className="item" href={`/foresporsler/${r.id}`}><div className="main"><div className="t">{r.title}</div><div className="s">{r.customer} · <span className="tnum">{fr(r.start_date, r.end_date)}</span></div></div>
        <div className="end"><Pill c={RSTATUS[r.status]}>{r.status}</Pill>{r.source === 'Nettside' && <Pill c="acc">Nettside</Pill>}{expired && <Pill c="bad">Holdetid ute</Pill>}</div><Icon.chev className="chev" /></Link>;
    })}{!list.length && <Empty>Ingen forespørsler.</Empty>}</div>
    {creating && <Sheet title="Ny forespørsel" onClose={() => setCreating(false)}>
      <form className="form" onSubmit={async e => {
        e.preventDefault(); const d = Object.fromEntries(new FormData(e.currentTarget)) as any;
        if (d.end_date < d.start_date) return toast('Til-dato kan ikke være før fra-dato', 'bad');
        const { data, error } = await sb().from('requests').insert(d).select().single(); if (error) return toast(error.message, 'bad');
        await store.refresh('requests'); router.push('/foresporsler/' + data.id);
      }}>
        <div className="field"><label htmlFor="rf-t">Hva gjelder det?</label><input className="input" id="rf-t" name="title" required placeholder="F.eks. Sommerfest" /></div>
        <div className="frow stack"><div className="field"><label htmlFor="rf-c">Kunde</label><input className="input" id="rf-c" name="customer" required /></div><div className="field"><label htmlFor="rf-k">Kontaktperson</label><input className="input" id="rf-k" name="contact" /></div></div>
        <div className="frow stack"><div className="field"><label htmlFor="rf-e">E-post</label><input className="input" id="rf-e" name="email" type="email" inputMode="email" /></div><div className="field"><label htmlFor="rf-p">Telefon</label><input className="input" id="rf-p" name="phone" type="tel" inputMode="tel" /></div></div>
        <div className="frow"><div className="field"><label htmlFor="rf-s">Fra</label><input className="input" id="rf-s" type="date" name="start_date" required defaultValue={today()} /></div><div className="field"><label htmlFor="rf-en">Til</label><input className="input" id="rf-en" type="date" name="end_date" required defaultValue={today()} /></div></div>
        <div className="field"><label htmlFor="rf-n">Notat</label><textarea className="input" id="rf-n" name="note" /></div>
        <button className="btn primary block">Opprett og velg utstyr</button>
      </form>
    </Sheet>}
  </>;
}
