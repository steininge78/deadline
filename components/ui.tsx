'use client';
import Link from 'next/link';
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import QRCode from 'qrcode';
import { cx } from '@/lib/util';

const svg = (d: React.ReactNode, w = 2) => ({ size = 20, ...p }: any) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={w} strokeLinecap="round" strokeLinejoin="round" {...p}>{d}</svg>
);
export const Icon = {
  proj: svg(<><path d="M9 4h6M8 3h8a1 1 0 0 1 1 1v1h2a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h2V4a1 1 0 0 1 1-1z" /><path d="m9 13 2 2 4-4" /></>),
  box: svg(<><path d="M21 8 12 3 3 8v8l9 5 9-5z" /><path d="m3 8 9 5 9-5M12 13v8" /></>),
  scan: svg(<><path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3" /><path d="M8 9h3v3H8zM13 9h3M13 12h3M8 15h8" /></>, 2.2),
  cal: svg(<><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></>),
  more: svg(<path d="M4 7h16M4 12h16M4 17h16" />),
  req: svg(<><path d="M4 5h16v11H8l-4 4z" /><path d="M8 9h8M8 12h5" /></>),
  wrench: svg(<path d="M14.7 6.3a4 4 0 0 0-5.4 5.1L3 17.7 6.3 21l6.3-6.3a4 4 0 0 0 5.1-5.4l-2.6 2.6-2.4-.6-.6-2.4z" />),
  chev: svg(<path d="m9 6 6 6-6 6" />),
  check: svg(<path d="m5 12 5 5 9-10" />, 3),
  plus: svg(<path d="M12 5v14M5 12h14" />, 2.4),
  search: svg(<><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></>),
  truck: svg(<><path d="M2 6h11v10H2zM13 9h4l4 4v3h-8" /><circle cx="6" cy="18" r="2" /><circle cx="17" cy="18" r="2" /></>),
  case: svg(<><rect x="3" y="7" width="18" height="13" rx="2" /><path d="M9 7V4h6v3M3 12h18M8 12v2M16 12v2" /></>),
  layers: svg(<><path d="m12 3 9 5-9 5-9-5z" /><path d="m3 13 9 5 9-5" /></>),
  upload: svg(<path d="M12 16V4M7 9l5-5 5 5M4 20h16" />),
  users: svg(<><circle cx="9" cy="8" r="3.5" /><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6M16 4.5a3.5 3.5 0 0 1 0 7M21 20c0-2.6-1.6-4.8-4-5.6" /></>),
  camera: svg(<><path d="M4 7h3l2-3h6l2 3h3a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1z" /><circle cx="12" cy="13" r="4" /></>),
  x: svg(<path d="M6 6l12 12M18 6 6 18" />, 2.2),
  copy: svg(<><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3" /></>),
  globe: svg(<><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" /></>),
  trash: svg(<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />)
};

export const Brand = ({ href = '/prosjekter' }: { href?: string }) => <Link className="brand" href={href}>deadline<i /></Link>;
export const Pill = ({ c = '', children }: { c?: string; children: React.ReactNode }) => <span className={cx('pill', c)}>{children}</span>;

export function Prog({ label, a, b }: { label: string; a: number; b: number }) {
  const p = b ? Math.round(a / b * 100) : 0;
  return <div className="prog"><div className="lbl"><span>{label}</span><span className="tnum">{p}%</span></div>
    <div className="bar"><i style={{ width: p + '%', background: p === 0 ? 'transparent' : p < 100 ? 'var(--warn)' : undefined }} /></div></div>;
}

export function Head({ title, sub, actions, back }: { title: string; sub?: React.ReactNode; actions?: React.ReactNode; back?: [string, string] }) {
  return <>
    {back && <Link className="back" href={back[0]}>‹ {back[1]}</Link>}
    <div className="pagehead"><div><h1>{title}<span className="c">:</span></h1>{sub && <div className="muted">{sub}</div>}</div>{actions && <div className="row-actions">{actions}</div>}</div>
  </>;
}

export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => { const f = (e: KeyboardEvent) => e.key === 'Escape' && onClose(); addEventListener('keydown', f); return () => removeEventListener('keydown', f); }, [onClose]);
  if (typeof document === 'undefined') return null;
  return createPortal(<div className="scrim" onClick={e => e.target === e.currentTarget && onClose()}>
    <div className="sheet" role="dialog" aria-modal="true" aria-label={title}>
      <div className="grab" />
      <div className="sheet-h"><h2>{title}</h2><button className="btn ghost sm" onClick={onClose} aria-label="Lukk"><Icon.x /></button></div>
      <div className="sheet-b">{children}</div>
    </div>
  </div>, document.body);
}

export function Stepper({ value, onChange, min = 0, max = Infinity, label }: { value: number; onChange: (n: number) => void; min?: number; max?: number; label?: React.ReactNode }) {
  return <div className="stepper">
    <button type="button" onClick={() => onChange(Math.max(min, value - 1))} aria-label="Minus">−</button>
    <span className="tnum">{label ?? value}</span>
    <button type="button" onClick={() => onChange(Math.min(max, value + 1))} disabled={value >= max} aria-label="Pluss">+</button>
  </div>;
}

export function QR({ text, size = 116 }: { text: string; size?: number }) {
  const [s, setS] = useState('');
  useEffect(() => { QRCode.toString(text, { type: 'svg', margin: 0, errorCorrectionLevel: 'M' }).then(setS); }, [text]);
  return <span className="qr" style={{ width: size + 12, height: size + 12 }}><span style={{ width: size, height: size, display: 'block' }} dangerouslySetInnerHTML={{ __html: s.replace('<svg', `<svg width="${size}" height="${size}"`) }} /></span>;
}

export function Label({ code, title, sub }: { code: string; title: string; sub?: string }) {
  return <div className="label"><QR text={code} size={96} /><div><div className="lt">{title}</div>{sub && <div className="ls">{sub}</div>}<div className="code">{code}</div><div className="ls" style={{ fontWeight: 800, marginTop: 4 }}>deadline</div></div></div>;
}

// Varsler nederst på skjermen
type ToastT = { msg: string; kind: string; action?: { label: string; fn: () => void } };
const TC = createContext<(msg: string, kind?: string, action?: ToastT['action']) => void>(() => {});
export const useToast = () => useContext(TC);
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [t, setT] = useState<ToastT | null>(null); const timer = useRef<any>(null);
  const show = useCallback((msg: string, kind = 'ok', action?: ToastT['action']) => {
    setT({ msg, kind, action }); clearTimeout(timer.current); timer.current = setTimeout(() => setT(null), action ? 6000 : 2800);
    try { navigator.vibrate?.(kind === 'bad' ? [60, 40, 60] : 30); } catch {}
  }, []);
  return <TC.Provider value={show}>{children}{t && <div className={cx('toast', t.kind)} role="status"><span>{t.msg}</span>
    {t.action && <button className="btn sm" style={{ background: 'transparent', color: 'inherit', borderColor: '#3d4b57' }} onClick={() => { setT(null); t.action!.fn(); }}>{t.action.label}</button>}</div>}</TC.Provider>;
}

export const Empty = ({ children }: { children: React.ReactNode }) => <div className="empty">{children}</div>;
