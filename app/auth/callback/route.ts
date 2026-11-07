import { NextResponse } from 'next/server';
import { sbServer } from '@/lib/supabase-server';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const next = url.searchParams.get('next') || '/prosjekter';
  if (code) {
    const supabase = await sbServer();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(next.startsWith('/') ? next : '/prosjekter', url.origin));
  }
  return NextResponse.redirect(new URL('/login?feil=1', url.origin));
}
