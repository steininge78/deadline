'use client';
import Link from 'next/link';
import { useState } from 'react';
import { sb } from '@/lib/supabase';
import { resBusy, useStore } from '@/lib/store';
import { Empty, Head, Icon, Pill, Sheet, useToast } from '@/components/ui';
import { ROLES, initials, kr, today } from '@/lib/util';

const RTYPES = ['Kjøretøy', 'Tilhenger', 'Scene', 'Maskin', 'Annet'];

export default function Mer() {
  const store = useStore(); const toast = useToast(); const me = store.me;
  const [res, setRes] = useState<any>(null);
  const T = today();
  const links: [string, keyof typeof Icon, string, string][] = store.internal ? [
    ['/foresporsler', 'req', 'Forespørsler og tilbud', `${store.db.requests.filter(r => !['Akseptert', 'Avslått'].includes(r.status)).length} åpne`],
    ['/vedlikehold', 'wrench', 'Vedlikehold', `${store.db.tickets.filter(t => t.status !== 'Ferdig').length} åpne saker`],
    ['/kalender', 'cal', 'Kalender', ''],
    ['/import', 'upload', 'Importer lager fra Excel', ''],
    ['/leie', 'globe', 'Utleiesiden (slik kundene ser den)', `${store.db.models.filter(m => m.web).length} artikler vises`]
  ] : [];
  return <>
    <Head title="Mer" />
    <div className="card" style={{ flexDirection: 'row', alignItems: 'center' }}>
      <span className={'avatar' + (me.role === 'ekstern' ? ' ext' : '')} style={{ width: 48, height: 48 }}>{initials(me.name || me.email)}</span>
      <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontWeight: 700 }}>{me.name}</div><div className="small muted" style={{ overflowWrap: 'anywhere' }}>{me.email} · {ROLES[me.role]}</div></div>
      <button className="btn sm" onClick={async () => { await sb().auth.signOut(); location.href = '/login'; }}>Logg ut</button>
    </div>
    {links.length > 0 && <div className="list">{links.map(([h, i, l, s]) => { const I = Icon[i]; return <Link key={h} className="item" href={h} target={h === '/leie' ? '_blank' : undefined}><span style={{ color: 'var(--accent-ink)' }}><I size={22} /></span><div className="main"><div className="t">{l}</div>{s && <div className="s">{s}</div>}</div><Icon.chev className="chev" /></Link>; })}</div>}

    {store.internal && <div className="group"><div className="group-h"><h3>Ressurser</h3><button className="btn sm" onClick={() => setRes({ type: 'Kjøretøy', active: true })}><Icon.plus /> Ny ressurs</button></div>
      <div className="list">{[...store.db.resources].sort((a, b) => a.name.localeCompare(b.name, 'nb')).map(r => { const busy = resBusy(store, r.id, T, T);
        return <button key={r.id} className="item" onClick={() => setRes(r)}><span style={{ color: 'var(--violet-ink)' }}><Icon.truck size={22} /></span>
          <div className="main"><div className="t">{r.name}</div><div className="s">{r.type}{r.sub ? ' · ' + r.sub : ''}{r.price != null ? ' · ' + kr(r.price) + '/dag' : ''}</div></div>
          {!r.active ? <Pill>Inaktiv</Pill> : busy.length ? <Pill c="warn">I bruk i dag</Pill> : <Pill c="ok">Ledig i dag</Pill>}<Icon.chev className="chev" /></button>; })}
        {!store.db.resources.length && <Empty>Ingen ressurser ennå. Legg til lastebil, tilhengere, scene, hjullaster og annet som skal bookes.</Empty>}</div></div>}

    {store.admin && <Users />}

    {res && <Sheet title={res.id ? res.name : 'Ny ressurs'} onClose={() => setRes(null)}>
      <form className="form" onSubmit={async e => {
        e.preventDefault(); const d = Object.fromEntries(new FormData(e.currentTarget)) as any;
        const row = { name: d.name.trim(), type: d.type, sub: d.sub || null, price: d.price === '' ? null : +d.price, active: !!d.active };
        const { error } = res.id ? await sb().from('resources').update(row).eq('id', res.id) : await sb().from('resources').insert(row);
        if (error) return toast(error.message, 'bad'); await store.refresh('resources'); setRes(null); toast('Ressursen er lagret');
      }}>
        <div className="field"><label htmlFor="r-n">Navn</label><input className="input" id="r-n" name="name" required defaultValue={res.name} placeholder="F.eks. Lastebil 18 t" /></div>
        <div className="frow stack"><div className="field"><label htmlFor="r-t">Type</label><select className="input" id="r-t" name="type" defaultValue={res.type}>{RTYPES.map(t => <option key={t}>{t}</option>)}</select></div>
          <div className="field"><label htmlFor="r-s">Reg.nr. eller detaljer</label><input className="input" id="r-s" name="sub" defaultValue={res.sub || ''} /></div></div>
        <div className="field"><label htmlFor="r-p">Dagpris (kr eks. mva.)</label><input className="input" id="r-p" name="price" type="number" min="0" step="any" defaultValue={res.price ?? ''} placeholder="Tom = ikke fakturerbar" /></div>
        <label style={{ display: 'flex', gap: 10, alignItems: 'center', fontWeight: 600 }}><input type="checkbox" name="active" defaultChecked={res.active !== false} style={{ width: 20, height: 20, accentColor: 'var(--orange)' }} /> Aktiv (kan bookes)</label>
        <button className="btn primary block">Lagre</button>
        {res.id && <button type="button" className="btn ghost danger" onClick={async () => {
          if (!window.confirm(`Slette ${res.name}? Bookinger av ressursen forsvinner også.`)) return;
          const { error } = await sb().from('resources').delete().eq('id', res.id); if (error) return toast(error.message, 'bad');
          await store.refresh('resources', 'project_resources', 'request_resources'); setRes(null); toast('Ressursen er slettet');
        }}><Icon.trash /> Slett ressurs</button>}
      </form>
    </Sheet>}
  </>;
}

function Users() {
  const store = useStore(); const toast = useToast();
  const users = [...store.db.profiles].sort((a, b) => (a.role === 'ingen' ? -1 : 0) - (b.role === 'ingen' ? -1 : 0) || (a.name || '').localeCompare(b.name || '', 'nb'));
  return <div className="group"><div className="group-h"><h3>Brukere og roller</h3></div>
    <div className="notice">Alle med @deadline.no får rollen Prosjektleder første gang de logger inn. Eksterne kommer inn når de inviteres til et prosjekt. Her endrer du roller.</div>
    <div className="list">{users.map(u => <div key={u.id} className="item"><span className={'avatar' + (u.role === 'ekstern' ? ' ext' : '')}>{initials(u.name || u.email)}</span>
      <div className="main"><div className="t">{u.name}</div><div className="s" style={{ overflowWrap: 'anywhere' }}>{u.email}</div></div>
      <select className="input" value={u.role} disabled={u.id === store.me.id} style={{ width: 'auto', minHeight: 36, padding: '4px 8px' }} aria-label="Rolle" onChange={async e => {
        const { error } = await sb().from('profiles').update({ role: e.target.value }).eq('id', u.id); if (error) return toast(error.message, 'bad');
        await store.refresh('profiles'); toast('Rollen er endret');
      }}>{Object.entries(ROLES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>)}</div>
    <p className="small muted" style={{ margin: 0 }}>Admin: alt, også roller. Lager og Prosjektleder: alt unntatt roller. Ekstern: bare pakklister i prosjekter de er invitert til.</p>
  </div>;
}
