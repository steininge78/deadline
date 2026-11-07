import { NextResponse } from 'next/server';
import { sbAdmin } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';
export async function GET(req: Request) {
  const u = new URL(req.url); const model = u.searchParams.get('model'); const from = u.searchParams.get('from'); const to = u.searchParams.get('to');
  if (!model || !from || !to || !/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) return NextResponse.json({ error: 'Mangler parametre' }, { status: 400 });
  const db = sbAdmin();
  const { data: m } = await db.from('models').select('id').eq('id', model).eq('web', true).maybeSingle();
  if (!m) return NextResponse.json({ error: 'Ukjent artikkel' }, { status: 404 });
  const { data, error } = await db.rpc('availability_days', { p_model: model, p_from: from, p_to: to });
  if (error) return NextResponse.json({ error: 'Kunne ikke hente kalender' }, { status: 500 });
  return NextResponse.json({ days: (data || []).map((d: any) => ({ day: String(d.day).slice(0, 10), available: Math.max(0, d.available), usable: d.usable })) });
}
