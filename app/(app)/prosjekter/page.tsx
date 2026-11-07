'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useStore } from '@/lib/store';
import { Empty, Head, Icon, Pill } from '@/components/ui';
import { ProjectSheet } from '@/components/sheets';
import { PSTATUS, addDays, fr, overlap, projTotals, today } from '@/lib/util';

export default function Prosjekter() {
  const store = useStore(); const router = useRouter();
  const [filter, setFilter] = useState('Aktive'); const [creating, setCreating] = useState(false);
  const T = today();
  const F: Record<string, (p: any) => boolean> = {
    Aktive: p => p.status !== 'Returnert' && p.status !== 'Avlyst',
    'Denne uka': p => overlap(p.start_date, p.end_date, T, addDays(T, 7)),
    Avsluttet: p => p.status === 'Returnert' || p.status === 'Avlyst',
    Alle: () => true
  };
  const list = [...store.db.projects].sort((a, b) => filter === 'Avsluttet' ? b.start_date.localeCompare(a.start_date) : a.start_date.localeCompare(b.start_date)).filter(F[filter]);
  return <>
    <Head title="Prosjekter" sub={store.internal ? `${store.db.projects.filter(F.Aktive).length} aktive` : 'Prosjekter du er invitert til'}
      actions={store.internal && <button className="btn accent" onClick={() => setCreating(true)}><Icon.plus /> Nytt prosjekt</button>} />
    <div className="chips">{Object.keys(F).map(k => <button key={k} className="chip" aria-pressed={k === filter} onClick={() => setFilter(k)}>{k}</button>)}</div>
    <div className="list">
      {list.map(p => {
        const t = projTotals(store.db.project_lines.filter(l => l.project_id === p.id));
        const next = t.pick < t.qty ? ['Satt fram', t.pick] : t.load < t.qty ? ['Lastet', t.load] : ['Returnert', t.ret];
        return <Link key={p.id} className="item" href={`/prosjekter/${p.id}`}>
          <div className="main"><div className="t">{p.name}</div><div className="s">{p.customer}{p.asana ? ` · Asana ${p.asana}` : ''}</div>
            <div className="s tnum">{fr(p.start_date, p.end_date)} · {t.qty} kolli{t.qty ? ` · ${next[0]} ${next[1]}/${t.qty}` : ''}</div></div>
          <div className="end"><Pill c={PSTATUS[p.status]}>{p.status}</Pill>{p.start_date <= T && p.end_date >= T && <Pill c="ok">I dag</Pill>}</div><Icon.chev className="chev" />
        </Link>;
      })}
      {!list.length && <Empty>{store.internal ? 'Ingen prosjekter her ennå. Trykk «Nytt prosjekt» for å starte.' : 'Du er ikke invitert til noen prosjekter ennå.'}</Empty>}
    </div>
    {creating && <ProjectSheet onClose={() => setCreating(false)} onSaved={p => router.push('/prosjekter/' + p.id)} />}
  </>;
}
