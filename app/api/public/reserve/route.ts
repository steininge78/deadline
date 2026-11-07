import { NextResponse } from 'next/server';
import { sbAdmin } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';
const HOLD_HOURS = 48;
const hits = new Map<string, number[]>();

export async function POST(req: Request) {
  // Enkel begrensning: maks 5 reservasjoner per IP per time
  const ip = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'ukjent';
  const now = Date.now(); const h = (hits.get(ip) || []).filter(t => now - t < 3600e3);
  if (h.length >= 5) return NextResponse.json({ error: 'For mange forsøk. Prøv igjen senere.' }, { status: 429 });
  hits.set(ip, [...h, now]);

  let b: any; try { b = await req.json(); } catch { return NextResponse.json({ error: 'Ugyldig forespørsel' }, { status: 400 }); }
  if (b.website) return NextResponse.json({ ok: true }); // honningkrukke mot roboter
  const name = String(b.name || '').trim().slice(0, 120), email = String(b.email || '').trim().slice(0, 160), phone = String(b.phone || '').trim().slice(0, 40), note = String(b.note || '').trim().slice(0, 2000);
  const start = String(b.start || ''), end = String(b.end || '');
  const items: { id: string; qty: number }[] = Array.isArray(b.items) ? b.items.slice(0, 50).map((i: any) => ({ id: String(i.id), qty: Math.max(0, Math.min(999, parseInt(i.qty) || 0)) })).filter((i: any) => i.qty > 0) : [];
  const d = /^\d{4}-\d{2}-\d{2}$/;
  if (!name || !/^\S+@\S+\.\S+$/.test(email) || !d.test(start) || !d.test(end) || end < start || !items.length) return NextResponse.json({ error: 'Fyll inn navn, gyldig e-post, datoer og minst én artikkel.' }, { status: 400 });
  if (start < new Date().toISOString().slice(0, 10)) return NextResponse.json({ error: 'Datoen har passert.' }, { status: 400 });

  const db = sbAdmin();
  const { data: models } = await db.from('models').select('id,name').in('id', items.map(i => i.id)).eq('web', true);
  if (!models || models.length !== new Set(items.map(i => i.id)).size) return NextResponse.json({ error: 'Ukjent artikkel i kurven.' }, { status: 400 });
  const { data: av } = await db.rpc('availability', { p_start: start, p_end: end });
  const avMap = new Map<string, number>((av || []).map((r: any) => [r.model_id, Number(r.available)]));
  const short = items.filter(i => (avMap.get(i.id) ?? 0) < i.qty);
  if (short.length) return NextResponse.json({ error: `Ikke nok ledig: ${short.map(s => models.find(m => m.id === s.id)?.name).join(', ')}. Velg andre datoer eller færre.` }, { status: 409 });

  const { data: r, error } = await db.from('requests').insert({
    source: 'Nettside', title: 'Nettbestilling: ' + name, customer: name, contact: name, email, phone, note, start_date: start, end_date: end,
    status: 'Reservert', hold_until: new Date(now + HOLD_HOURS * 3600e3).toISOString()
  }).select('id').single();
  if (error) return NextResponse.json({ error: 'Kunne ikke lagre reservasjonen.' }, { status: 500 });
  await db.from('request_lines').insert(items.map(i => ({ request_id: r.id, model_id: i.id, qty: i.qty })));
  return NextResponse.json({ ok: true, holdHours: HOLD_HOURS });
}
