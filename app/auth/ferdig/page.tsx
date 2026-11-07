'use client';
import { useEffect, useState } from 'react';
import { sb } from '@/lib/supabase';

// Fullfører Google-innloggingen i nettleseren (der PKCE-nøkkelen ligger).
export default function Ferdig() {
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    (async () => {
      const q = new URLSearchParams(location.search);
      const next = q.get('next') || '/prosjekter';
      const urlErr = q.get('error_description') || q.get('error');
      if (urlErr) { setErr(urlErr); return; }
      const code = q.get('code');
      let { data: { session } } = await sb().auth.getSession();
      if (!session && code) {
        const flowId = q.get('sb_flow_id');
        const { data, error } = await sb().auth.exchangeCodeForSession(code, flowId ? { flowId } as any : undefined);
        if (error) { setErr(error.message); return; }
        session = data.session;
      }
      if (!session) { setErr('Fikk ikke logget inn. Prøv igjen.'); return; }
      location.replace(next.startsWith('/') ? next : '/prosjekter');
    })();
  }, []);
  return <div className="login" style={{ minHeight: '100vh' }}>
    <span className="brand">deadline<i /></span>
    {err ? <><p style={{ color: '#ff8a8a' }}>Innloggingen feilet: {err}</p><a className="gbtn alt" href="/login">Prøv igjen</a></> : <p>Logger inn…</p>}
  </div>;
}
