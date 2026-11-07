import { NextResponse } from 'next/server';
import { sbAdmin } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';
const okDate = (s: string | null) => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);

// Offentlig: artikler merket for nettsiden, med ledighet for valgt periode. Ingen kundedata.
export async function GET(req: Request) {
  const u = new URL(req.url); const start = u.searchParams.get('start'); const end = u.searchParams.get('end');
  const db = sbAdmin();
  const { data: models, error } = await db.from('models').select('id,name,cat,sub,price,web_description,description,photos').eq('web', true).eq('active', true).not('price', 'is', null).order('cat').order('name');
  if (error) return NextResponse.json({ error: 'Kunne ikke hente utstyr' }, { status: 500 });
  let av = new Map<string, number>();
  if (okDate(start) && okDate(end) && start! <= end!) {
    const { data } = await db.rpc('availability', { p_start: start, p_end: end });
    av = new Map((data || []).map((r: any) => [r.model_id, Math.max(0, r.available)]));
  }
  const base = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/photos/`;
  return NextResponse.json({
    items: models.map(m => ({ id: m.id, name: m.name, cat: m.cat, price: m.price, text: m.web_description || m.description || '', photos: (m.photos || []).map((p: string) => base + p), available: av.size ? av.get(m.id) ?? 0 : null }))
  }, { headers: { 'Cache-Control': 'no-store' } });
}
