'use client';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { kitQR, useAvailability, useStore } from '@/lib/store';
import { Empty, Head, Icon, Pill } from '@/components/ui';
import { ModelSheet, photoOf } from '@/components/sheets';
import { KitSheet } from '@/components/KitSheet';
import { Consumables } from '@/components/Consumables';
import { KTYPE, kr, today } from '@/lib/util';

export default function Lager() {
  const store = useStore();
  const [tab, setTab] = useState<'utstyr' | 'pakker' | 'forbruk'>('utstyr');
  const [q, setQ] = useState(''); const [cat, setCat] = useState('Alle'); const [sub, setSub] = useState('Alle'); const [limit, setLimit] = useState(60);
  const [creating, setCreating] = useState(false); const [newKit, setNewKit] = useState(false);
  const T = today(); const av = useAvailability(T, T);
  const cats = useMemo(() => [...new Set(store.db.models.map(m => m.cat))].sort(), [store.db.models]);
  const subs = cat === 'Alle' ? [] : [...new Set(store.db.models.filter(m => m.cat === cat).map(m => m.sub).filter(Boolean))].sort();
  const ql = q.toLowerCase();
  const ms = store.db.models.filter(m => m.active && (cat === 'Alle' || m.cat === cat) && (sub === 'Alle' || m.sub === sub) && [m.name, m.code, m.rentman_id, m.loc, m.sub].join(' ').toLowerCase().includes(ql)).sort((a, b) => a.name.localeCompare(b.name, 'nb'));
  const noQr = store.db.units.filter(u => !u.qr).length;

  return <>
    <Head title="Lager" sub={`${store.db.models.length} artikler · ${store.db.units.length} enheter · ${noQr} uten QR`}
      actions={store.internal && <><Link className="btn" href="/import"><Icon.upload /> Importer</Link><button className="btn accent" onClick={() => setCreating(true)}><Icon.plus /> Nytt utstyr</button></>} />
    <div className="seg" role="group" aria-label="Lagervisning">{([['utstyr', 'Utstyr'], ['pakker', 'Pakker'], ['forbruk', 'Salg og forbruk']] as const).map(([k, l]) => <button key={k} aria-pressed={tab === k} onClick={() => setTab(k)}>{l}</button>)}</div>

    {tab === 'utstyr' && <>
      <div className="search"><Icon.search /><input value={q} onChange={e => { setQ(e.target.value); setLimit(60); }} placeholder="Søk på navn, utstyrskode eller lagerplass" aria-label="Søk" /></div>
      <div className="chips">{['Alle', ...cats].map(c => <button key={c} className="chip" aria-pressed={c === cat} onClick={() => { setCat(c); setSub('Alle'); setLimit(60); }}>{c}</button>)}</div>
      {subs.length > 1 && <div className="chips">{['Alle', ...subs].map(c => <button key={c} className="chip" aria-pressed={c === sub} style={{ fontSize: '.82rem', padding: '4px 12px' }} onClick={() => { setSub(c); setLimit(60); }}>{c}</button>)}</div>}
      <div className="small muted tnum">{ms.length} artikler</div>
      <div className="list">
        {ms.slice(0, limit).map(m => {
          const us = store.unitsOf(m.id); const tot = m.track === 'qty' ? m.stock : us.length; const a = av.get(m.id)?.available ?? 0;
          const svc = us.filter(u => u.status === 'service').length, nq = m.track === 'unit' ? us.filter(u => !u.qr).length : 0; const k = store.kitOfModel(m.id); const ph = photoOf(m);
          return <Link key={m.id} className="item" href={k ? `/pakker/${k.id}` : `/lager/${m.id}`}>
            {ph && <img className="thumb" src={ph} alt="" />}
            <div className="main"><div className="t">{m.name}</div><div className="s">{m.sub || m.cat} · {m.track === 'qty' ? 'telles i antall' : `${tot} ${tot === 1 ? 'enhet' : 'enheter'}`} · {m.price == null ? 'uten pris' : kr(m.price) + '/dag'}</div></div>
            <div className="end"><span className="tnum small" style={{ fontWeight: 700 }}>{a}/{tot} ledig</span>
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', justifyContent: 'flex-end' }}>{k && <Pill c="vio">{KTYPE[k.type]}</Pill>}{svc > 0 && <Pill c="bad">{svc} service</Pill>}{nq > 0 && <Pill c="warn">{nq} uten QR</Pill>}{m.web && <Pill c="acc">Nett</Pill>}</div></div>
            <Icon.chev className="chev" />
          </Link>;
        })}
        {!ms.length && <Empty>{store.db.models.length ? 'Ingen treff' : 'Lageret er tomt. Bruk «Importer» for å lese inn Rentman-lista.'}</Empty>}
      </div>
      {ms.length > limit && <button className="btn" onClick={() => setLimit(limit + 60)}>Vis flere ({ms.length - limit} igjen)</button>}
    </>}

    {tab === 'pakker' && <>
      <div className="notice">Fysiske pakker er case, samlekasser og pallekarmer med egen QR-kode. Skanner du den, blir hele innholdet merket. Virtuelle pakker er utstyr som pleier å gå sammen.</div>
      <div className="list">{store.db.kits.map(k => { const m = store.M(k.model_id); if (!m) return null; const items = store.kitItems(k.id); const qr = kitQR(store, k);
        return <Link key={k.id} className="item" href={`/pakker/${k.id}`}><span style={{ color: 'var(--violet-ink)' }}>{k.type === 'case' ? <Icon.case size={24} /> : <Icon.layers size={24} />}</span>
          <div className="main"><div className="t">{m.name}</div><div className="s">{items.length ? `${items.length} linjer` : 'Innhold ikke registrert'}{qr ? ' · ' + qr : ''}</div></div>
          <div className="end"><Pill c="vio">{KTYPE[k.type]}</Pill>{!items.length ? <Pill c="warn">Mangler innhold</Pill> : k.inferred ? <Pill c="acc">Foreslått</Pill> : null}</div><Icon.chev className="chev" /></Link>; })}
        {!store.db.kits.length && <Empty>Ingen pakker ennå.</Empty>}</div>
      {store.internal && <button className="btn" onClick={() => setNewKit(true)}><Icon.plus /> Ny pakke</button>}
    </>}

    {tab === 'forbruk' && <Consumables />}
    {creating && <ModelSheet onClose={() => setCreating(false)} />}
    {newKit && <KitSheet onClose={() => setNewKit(false)} />}
  </>;
}

