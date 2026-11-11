import { NextResponse } from 'next/server';
import { sbAdmin, sbServer } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const API = 'https://api.rentman.net';
const isImage = (f: any) => {
  const mt = String(f.mimetype || f.mime_type || f.type || '').toLowerCase();
  const nm = String(f.name || f.displayname || f.readable_name || f.path || '').toLowerCase();
  return mt.startsWith('image/') || /\.(jpe?g|png|webp|gif|heic)$/.test(nm) || f.image === true;
};
const idOf = (ref: any) => { const m = String(ref ?? '').match(/(\d+)\s*$/); return m ? m[1] : null; };

async function rentman(path: string, token: string) {
  const r = await fetch(API + path, { headers: { Authorization: 'Bearer ' + token, Accept: 'application/json' }, cache: 'no-store' });
  if (r.status === 401 || r.status === 403) throw Object.assign(new Error('Rentman avviste nøkkelen (ugyldig token eller manglende rettigheter).'), { fatal: true });
  if (r.status === 429) { await new Promise(res => setTimeout(res, 1500)); return rentman(path, token); }
  if (!r.ok) throw new Error(`Rentman svarte ${r.status} på ${path}`);
  return r.json();
}

// Henter bilder fra Rentman for noen få artikler per kall (klienten går gjennom alle i bolker).
export async function POST(req: Request) {
  const user = await (await sbServer()).auth.getUser();
  if (!user.data.user) return NextResponse.json({ error: 'Ikke logget inn' }, { status: 401 });
  const db = sbAdmin();
  const { data: prof } = await db.from('profiles').select('role').eq('id', user.data.user.id).single();
  if (!prof || !['admin', 'lager', 'prosjektleder'].includes(prof.role)) return NextResponse.json({ error: 'Ingen tilgang' }, { status: 403 });

  const { token, modelIds } = await req.json().catch(() => ({}));
  if (!token || !Array.isArray(modelIds) || !modelIds.length) return NextResponse.json({ error: 'Mangler nøkkel eller artikler' }, { status: 400 });
  const { data: models } = await db.from('models').select('id,name,rentman_id,photos').in('id', modelIds.slice(0, 10));

  const results: any[] = [];
  for (const m of models || []) {
    if (!m.rentman_id) { results.push({ id: m.id, name: m.name, added: 0, note: 'mangler Rentman-ID' }); continue; }
    try {
      const [eq, files] = await Promise.all([rentman(`/equipment/${m.rentman_id}`, token), rentman(`/equipment/${m.rentman_id}/files`, token)]);
      const mainId = idOf(eq?.data?.image);
      const imgs = (files?.data || []).filter(isImage).sort((a: any, b: any) => (String(b.id) === mainId ? 1 : 0) - (String(a.id) === mainId ? 1 : 0));
      const photos: string[] = [...(m.photos || [])];
      let added = 0;
      for (const f of imgs) {
        const ext = (String(f.name || f.path || '').match(/\.(jpe?g|png|webp|gif|heic)$/i)?.[1] || 'jpg').toLowerCase();
        const path = `${m.id}/rentman-${f.id}.${ext}`;
        if (photos.includes(path)) continue;
        const url = f.url || f.proxy_url || f.download_url;
        if (!url) continue;
        const bin = await fetch(url, { cache: 'no-store' });
        if (!bin.ok) continue;
        const buf = Buffer.from(await bin.arrayBuffer());
        if (buf.length > 15e6) continue;
        const { error } = await db.storage.from('photos').upload(path, buf, { contentType: bin.headers.get('content-type') || 'image/' + (ext === 'jpg' ? 'jpeg' : ext), upsert: true });
        if (error) throw error;
        if (String(f.id) === mainId) photos.unshift(path); else photos.push(path);
        added++;
      }
      if (added) await db.from('models').update({ photos }).eq('id', m.id);
      results.push({ id: m.id, name: m.name, added, found: imgs.length });
    } catch (e: any) {
      if (e.fatal) return NextResponse.json({ error: e.message }, { status: 401 });
      results.push({ id: m.id, name: m.name, added: 0, error: e.message });
    }
  }
  return NextResponse.json({ results });
}
