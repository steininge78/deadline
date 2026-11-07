export const pad = (n: number) => String(n).padStart(2, '0');
export const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const parse = (s: string) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
export const addDays = (s: string, n: number) => { const d = parse(s); d.setDate(d.getDate() + n); return iso(d); };
export const today = () => iso(new Date());
export const MND = ['jan', 'feb', 'mar', 'apr', 'mai', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'des'];
export const MND_LANG = ['Januar', 'Februar', 'Mars', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Desember'];
export const DAG = ['søn', 'man', 'tir', 'ons', 'tor', 'fre', 'lør'];
export const fd = (s: string) => { const d = parse(s); return `${d.getDate()}. ${MND[d.getMonth()]}`; };
export const fr = (a: string, b: string) => {
  if (a === b) return fd(a);
  const A = parse(a), B = parse(b);
  return A.getMonth() === B.getMonth() && A.getFullYear() === B.getFullYear() ? `${A.getDate()}.–${B.getDate()}. ${MND[B.getMonth()]}` : `${fd(a)} – ${fd(b)}`;
};
export const daysBetween = (a: string, b: string) => Math.round((parse(b).getTime() - parse(a).getTime()) / 864e5);
export const overlap = (a1: string, a2: string, b1: string, b2: string) => a1 <= b2 && b1 <= a2;
export const kr = (n: number | null | undefined) => n == null ? 'Uten pris' : new Intl.NumberFormat('nb-NO', { maximumFractionDigits: 0 }).format(Math.round(n)) + ' kr';
export const initials = (n: string) => (n || '?').split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase();
export const mondayOf = (s: string) => { const d = parse(s); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return iso(d); };
export const cx = (...a: any[]) => a.filter(Boolean).join(' ');

export const STAGES = [
  { k: 'pick', col: 'done_pick', label: 'Satt fram', verb: 'Sett fram' },
  { k: 'load', col: 'done_load', label: 'Lastet', verb: 'Last på bil' },
  { k: 'ret', col: 'done_ret', label: 'Returnert', verb: 'Ta imot retur' }
] as const;
export type StageK = 'pick' | 'load' | 'ret';
export const PSTATUS: Record<string, string> = { Planlagt: 'vio', Bekreftet: 'acc', 'Pågår': 'ok', Returnert: '', Avlyst: 'bad' };
export const RSTATUS: Record<string, string> = { Ny: 'vio', 'Tilbud sendt': 'warn', Reservert: 'acc', Akseptert: 'ok', Avslått: 'bad' };
export const KTYPE: Record<string, string> = { case: 'Fysisk pakke', pakke: 'Virtuell pakke' };
export const ROLES: Record<string, string> = { admin: 'Admin', lager: 'Lager', prosjektleder: 'Prosjektleder', ekstern: 'Ekstern', ingen: 'Ingen tilgang' };

// QR-koder vi lager selv: DL-xxxxxx (tilfeldig, unik nok; databasen sjekker unikhet)
export const newQR = () => 'DL-' + Math.random().toString(36).slice(2, 8).toUpperCase();

// Skalerer bilde til maks 1600 px JPEG før opplasting
export function shrinkImage(file: File, max = 1600): Promise<Blob> {
  return new Promise((res, rej) => {
    const img = new Image(); const url = URL.createObjectURL(file);
    img.onload = () => {
      const sc = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas'); c.width = Math.round(img.width * sc); c.height = Math.round(img.height * sc);
      c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url);
      c.toBlob(b => b ? res(b) : rej(new Error('Kunne ikke lagre bildet')), 'image/jpeg', 0.8);
    };
    img.onerror = () => rej(new Error('Kunne ikke lese bildet'));
    img.src = url;
  });
}

export const projTotals = (lines: any[]) => lines.reduce((t, l) => ({ qty: t.qty + l.qty, pick: t.pick + l.done_pick, load: t.load + l.done_load, ret: t.ret + l.done_ret }), { qty: 0, pick: 0, load: 0, ret: 0 });
