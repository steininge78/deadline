'use client';
import { useEffect, useRef, useState } from 'react';
import { Icon, Pill, Sheet } from './ui';

// Leser QR fra et bilde, både vanlig og invertert (hvit kode på mørk bakgrunn)
async function readFromPhoto(file: File): Promise<string | null> {
  const QrScanner = (await import('qr-scanner')).default;
  const img = await createImageBitmap(file);
  const sc = Math.min(1, 1400 / Math.max(img.width, img.height));
  const c = document.createElement('canvas'); c.width = Math.round(img.width * sc); c.height = Math.round(img.height * sc);
  const x = c.getContext('2d')!; x.drawImage(img, 0, 0, c.width, c.height);
  for (const invert of [false, true]) {
    if (invert) { const d = x.getImageData(0, 0, c.width, c.height); for (let i = 0; i < d.data.length; i += 4) { d.data[i] = 255 - d.data[i]; d.data[i + 1] = 255 - d.data[i + 1]; d.data[i + 2] = 255 - d.data[i + 2]; } x.putImageData(d, 0, 0); }
    try { const r: any = await QrScanner.scanImage(c, { returnDetailedScanResult: true, alsoTryWithoutScanRegion: true }); if (r?.data) return r.data; } catch {}
  }
  return null;
}

export type ScanResult = { kind: 'ok' | 'warn' | 'bad'; msg: string; action?: { label: string; fn: () => void } } | void;

// Live QR-skanner med mobilkamera. Skanner fortløpende; samme kode ignoreres i 2,5 sek.
export function Scanner({ title, hint, onCode, onClose, continuous = false }: {
  title: string; hint?: string; continuous?: boolean; onClose: () => void;
  onCode: (code: string) => ScanResult | Promise<ScanResult>;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const [err, setErr] = useState<string | null>(null);
  const [flash, setFlash] = useState(false);
  const [log, setLog] = useState<{ id: number; r: any }[]>([]);
  const [manual, setManual] = useState('');
  const last = useRef({ code: '', t: 0 });
  const busy = useRef(false);
  const cb = useRef(onCode); cb.current = onCode;

  const handle = async (code: string) => {
    const now = Date.now();
    if (busy.current || (code === last.current.code && now - last.current.t < 2500)) return;
    last.current = { code, t: now }; busy.current = true;
    try {
      const r = await cb.current(code);
      setFlash(true); setTimeout(() => setFlash(false), 200);
      try { navigator.vibrate?.(r && r.kind === 'bad' ? [60, 40, 60] : 40); } catch {}
      if (r) setLog(l => [{ id: now, r }, ...l].slice(0, 30));
    } finally { busy.current = false; }
  };

  useEffect(() => {
    let scanner: any; let stopped = false;
    (async () => {
      try {
        const QrScanner = (await import('qr-scanner')).default;
        if (stopped || !video.current) return;
        if (!(await QrScanner.hasCamera())) { setErr('Fant ikke noe kamera. Skriv inn koden under.'); return; }
        scanner = new QrScanner(video.current, (res: any) => handle(res.data), { preferredCamera: 'environment', maxScansPerSecond: 8, returnDetailedScanResult: true });
        // Rentman-klistremerkene er hvite på svart (invertert QR), så vi leser begge varianter
        scanner.setInversionMode('both');
        await scanner.start();
      } catch (e: any) {
        setErr(/Permission|NotAllowed/i.test(String(e?.name || e)) ? 'Kameraet er blokkert. Gi nettleseren tilgang til kameraet i innstillingene, eller skriv inn koden under.' : 'Kunne ikke starte kameraet. Skriv inn koden under.');
      }
    })();
    return () => { stopped = true; scanner?.stop(); scanner?.destroy(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <Sheet title={title} onClose={onClose}>
    <div className="form">
      <div className="video-wrap"><video ref={video} muted playsInline /><div className="corners" /><div className={'flash' + (flash ? ' on' : '')} />
        {err && <div className="msg"><div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}><Icon.camera size={36} /><span className="small">{err}</span></div></div>}
      </div>
      {hint && <div className="small muted">{hint}</div>}
      <label className="btn sm" htmlFor="sc-photo" style={{ alignSelf: 'flex-start' }}><Icon.camera size={18} /> Ta bilde av koden i stedet</label>
      <input id="sc-photo" type="file" accept="image/*" capture="environment" hidden onChange={async e => {
        const f = e.target.files?.[0]; e.target.value = ''; if (!f) return;
        const code = await readFromPhoto(f);
        if (code) { last.current = { code: '', t: 0 }; handle(code); } else setLog(l => [{ id: Date.now(), r: { kind: 'bad', msg: 'Fant ingen QR-kode i bildet. Gå nærmere og sørg for godt lys.' } }, ...l]);
      }} />
      <form className="search" onSubmit={e => { e.preventDefault(); if (manual.trim()) { last.current = { code: '', t: 0 }; handle(manual.trim()); setManual(''); } }}>
        <input value={manual} onChange={e => setManual(e.target.value)} placeholder="…eller skriv koden" autoComplete="off" aria-label="Kode" />
        <button className="btn sm primary" type="submit">OK</button>
      </form>
      {(continuous || log.length > 0) && <div className="scanlog" aria-live="polite">{log.map(({ id, r }) => <div key={id}>
        <Pill c={r.kind === 'ok' ? 'ok' : r.kind === 'warn' ? 'warn' : 'bad'}>{r.kind === 'ok' ? 'OK' : r.kind === 'warn' ? 'Obs' : 'Feil'}</Pill><span>{r.msg}</span>
        {r.action && <button className="btn sm" onClick={() => { r.action.fn(); setLog(l => l.map(x => x.id === id ? { ...x, r: { ...x.r, action: undefined } } : x)); }}>{r.action.label}</button>}
      </div>)}</div>}
    </div>
  </Sheet>;
}
