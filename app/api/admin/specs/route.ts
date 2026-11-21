import { NextResponse } from 'next/server';
import { sbAdmin, sbServer } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Slår opp tekniske spesifikasjoner på nett med Claude (krever ANTHROPIC_API_KEY i Vercel)
export async function POST(req: Request) {
  const user = await (await sbServer()).auth.getUser();
  if (!user.data.user) return NextResponse.json({ error: 'Ikke logget inn' }, { status: 401 });
  const db = sbAdmin();
  const { data: prof } = await db.from('profiles').select('role').eq('id', user.data.user.id).single();
  if (!prof || !['admin', 'lager', 'prosjektleder'].includes(prof.role)) return NextResponse.json({ error: 'Ingen tilgang' }, { status: 403 });
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return NextResponse.json({ error: 'AI-oppslag er ikke satt opp. Legg inn ANTHROPIC_API_KEY under Environment Variables i Vercel og publiser på nytt.' }, { status: 501 });

  const { modelId } = await req.json().catch(() => ({}));
  const { data: m } = await db.from('models').select('name,cat,sub,description').eq('id', modelId).single();
  if (!m) return NextResponse.json({ error: 'Fant ikke produktet' }, { status: 404 });

  const prompt = `Finn tekniske spesifikasjoner for dette utleieutstyret fra produsentens nettside eller pålitelige forhandlere.
Produkt: ${m.name}
Kategori: ${m.cat}${m.sub ? ' / ' + m.sub : ''}
${m.description ? 'Vår beskrivelse: ' + m.description.slice(0, 400) : ''}

Ta med det som er nyttig for en teknikker, f.eks. strømforbruk (W), spenning, vekt, mål, oppløsning, lysstyrke (lumen/lux), lydtrykk (dB SPL), frekvensområde, kontakter/innganger, DMX-kanaler, IP-klasse, batteritid. Bare verdier du finner kilde for.
Svar til slutt med KUN en JSON-blokk på formen:
\`\`\`json
{"specs": {"Strømforbruk": "450 W", "Vekt": "12,5 kg"}, "sources": ["https://..."]}
\`\`\`
Bruk norske egenskapsnavn og korte verdier med enheter. Hvis produktet er tvetydig eller du ikke finner det, returner tom specs.`;

  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({
      model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-5',
      max_tokens: 2000,
      tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 4 }],
      messages: [{ role: 'user', content: prompt }]
    })
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) return NextResponse.json({ error: 'AI-tjenesten svarte med feil: ' + (j?.error?.message || r.status) }, { status: 502 });
  const text = (j.content || []).filter((b: any) => b.type === 'text').map((b: any) => b.text).join('\n');
  const block = text.match(/```json\s*([\s\S]*?)```/)?.[1] || text.slice(text.lastIndexOf('{"specs"'));
  try {
    const out = JSON.parse(block);
    const specs = Object.fromEntries(Object.entries(out.specs || {}).slice(0, 30).map(([k, v]) => [String(k).slice(0, 60), String(v).slice(0, 160)]));
    const sources = (out.sources || []).filter((s: any) => /^https?:\/\//.test(String(s))).slice(0, 6);
    return NextResponse.json({ specs, sources });
  } catch {
    return NextResponse.json({ error: 'Klarte ikke å tolke svaret fra AI. Prøv igjen.' }, { status: 502 });
  }
}
