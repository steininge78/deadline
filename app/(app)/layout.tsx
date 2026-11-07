'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';
import { StoreProvider, lookupCode, useStore } from '@/lib/store';
import { Brand, Icon, Pill, ToastProvider, useToast } from '@/components/ui';
import { Scanner } from '@/components/Scanner';
import { LinkCodeSheet } from '@/components/LinkCode';
import { ROLES, initials } from '@/lib/util';
import { sb } from '@/lib/supabase';

const NAV = [
  { h: '/prosjekter', l: 'Prosjekter', i: 'proj' },
  { h: '/lager', l: 'Lager', i: 'box', also: ['/pakker', '/import'] },
  { h: '/kalender', l: 'Kalender', i: 'cal' },
  { h: '/foresporsler', l: 'Forespørsler', i: 'req' },
  { h: '/vedlikehold', l: 'Vedlikehold', i: 'wrench' },
  { h: '/mer', l: 'Mer', i: 'more' }
] as const;

function Shell({ children }: { children: React.ReactNode }) {
  const store = useStore(); const { me, loading, error, internal } = store;
  const path = usePathname(); const router = useRouter(); const toast = useToast();
  const [scan, setScan] = useState(false); const [linkCode, setLinkCode] = useState<string | null>(null);

  if (loading) return <div className="loading">Laster…</div>;
  if (!me) return <div className="loading"><a className="btn" href="/login">Logg inn</a></div>;
  if (me.role === 'ingen') return <div className="login" style={{ minHeight: '100vh' }}><Brand /><h1>Ingen tilgang ennå<span style={{ color: 'var(--orange)' }}>:</span></h1>
    <p>Du er logget inn som {me.email}, men kontoen har ikke fått tilgang. Be en administrator hos Deadline om å invitere deg til et prosjekt eller gi deg en rolle.</p>
    <button className="gbtn alt" onClick={async () => { await sb().auth.signOut(); location.href = '/login'; }}>Logg ut</button></div>;

  const cur = (n: any) => path.startsWith(n.h) || (n.also || []).some((a: string) => path.startsWith(a));
  const navs = internal ? NAV : NAV.filter(n => n.h === '/prosjekter' || n.h === '/mer');
  const tabs: any[] = internal ? [NAV[0], NAV[1], null, NAV[2], NAV[5]] : [NAV[0], null, NAV[5]];
  const moreActive = ['/foresporsler', '/vedlikehold', '/mer'].some(p => path.startsWith(p));

  const onCode = (code: string) => {
    const r = lookupCode(store, code);
    if (r.type === 'unit') { setScan(false); router.push(`/lager/${r.unit.model_id}?enhet=${r.unit.id}`); }
    else if (r.type === 'kit') { setScan(false); router.push(`/pakker/${r.kit.id}`); }
    else if (r.type === 'model') { setScan(false); router.push(`/lager/${r.model.id}`); }
    else if (!internal) return { kind: 'bad' as const, msg: `Ukjent kode ${code}` };
    else { setScan(false); setLinkCode(code); }
  };
  const I = (k: string) => { const C = (Icon as any)[k]; return <C />; };

  return <div id="app">
    <nav className="rail" aria-label="Hovedmeny"><Brand />
      {navs.map(n => <Link key={n.h} href={n.h} aria-current={cur(n) ? 'page' : undefined}>{I(n.i)}{n.l}</Link>)}
      <button className="scanbtn" onClick={() => setScan(true)}><Icon.scan /> Skann QR</button>
      <div className="foot">{me.email}</div>
    </nav>
    <main><div className="wrap">
      <div className="topbar"><Brand /><Link className="who" href="/mer" aria-label="Min konto"><Pill c={me.role === 'ekstern' ? 'acc' : 'vio'}>{ROLES[me.role]}</Pill><span className={'avatar' + (me.role === 'ekstern' ? ' ext' : '')}>{initials(me.name || me.email)}</span></Link></div>
      {error && <div className="notice warn">Feil ved lasting av data: {error}</div>}
      {children}
    </div></main>
    <nav className="tabbar" aria-label="Hovedmeny" style={{ gridTemplateColumns: `repeat(${tabs.length},1fr)` }}>
      {tabs.map((n, i) => n ? <Link key={n.h} href={n.h} aria-current={cur(n) || (n.h === '/mer' && moreActive) ? 'page' : undefined}>{I(n.i)}{n.l}</Link>
        : <button key={i} className="scanfab" onClick={() => setScan(true)} aria-label="Skann QR"><span className="b"><Icon.scan /></span>Skann</button>)}
    </nav>
    {scan && <Scanner title="Skann QR" hint="Slå opp utstyr eller pakke" onClose={() => setScan(false)} onCode={onCode} />}
    {linkCode && <LinkCodeSheet code={linkCode} onClose={() => setLinkCode(null)} onDone={(msg) => { toast(msg); setLinkCode(null); }} />}
  </div>;
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <StoreProvider><ToastProvider><Shell>{children}</Shell></ToastProvider></StoreProvider>;
}
