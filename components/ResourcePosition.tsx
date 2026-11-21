'use client';
import { useState } from 'react';
import { sb } from '@/lib/supabase';
import { useStore } from '@/lib/store';
import { Icon, useToast } from './ui';

// Siste kjente posisjon for en ressurs. Apple har ikke noe åpent API for AirTag,
// så posisjonen registreres fra telefonen når kjøretøyet parkeres, og AirTag-en åpnes i «Hvor er?».
export function ResourcePosition({ r }: { r: any }) {
  const store = useStore(); const toast = useToast(); const [busy, setBusy] = useState(false);
  const has = r.last_lat != null && r.last_lng != null;
  const by = r.last_pos_by ? store.db.profiles.find(p => p.id === r.last_pos_by) : null;
  const d = 0.004;
  const mapSrc = has ? `https://www.openstreetmap.org/export/embed.html?bbox=${r.last_lng - d},${r.last_lat - d / 2},${r.last_lng + d},${r.last_lat + d / 2}&layer=mapnik&marker=${r.last_lat},${r.last_lng}` : '';
  const save = () => {
    if (!navigator.geolocation) return toast('Telefonen deler ikke posisjon', 'bad');
    setBusy(true);
    navigator.geolocation.getCurrentPosition(async pos => {
      const { error } = await sb().from('resources').update({ last_lat: pos.coords.latitude, last_lng: pos.coords.longitude, last_pos_at: new Date().toISOString(), last_pos_by: store.me.id }).eq('id', r.id);
      setBusy(false); if (error) return toast(error.message, 'bad');
      await store.refresh('resources'); toast('Posisjonen er lagret');
    }, err => { setBusy(false); toast(err.code === 1 ? 'Gi nettleseren tilgang til posisjon for å lagre den' : 'Fant ikke posisjonen', 'bad'); }, { enableHighAccuracy: true, timeout: 15000 });
  };
  return <div className="field"><span className="eyebrow">Posisjon</span>
    {has ? <>
      <iframe title={'Kart for ' + r.name} src={mapSrc} style={{ width: '100%', height: 200, border: 0, borderRadius: 10 }} loading="lazy" />
      <div className="small muted">Sist registrert {new Date(r.last_pos_at).toLocaleString('nb-NO', { dateStyle: 'short', timeStyle: 'short' })}{by ? ' av ' + by.name : ''}</div>
      <div className="row-actions"><a className="btn sm" href={`https://maps.apple.com/?ll=${r.last_lat},${r.last_lng}&q=${encodeURIComponent(r.name)}`} target="_blank" rel="noreferrer">Apple Kart</a>
        <a className="btn sm" href={`https://www.google.com/maps/search/?api=1&query=${r.last_lat},${r.last_lng}`} target="_blank" rel="noreferrer">Google Maps</a></div>
    </> : <span className="small muted">Ingen posisjon registrert ennå.</span>}
    <div className="row-actions">
      <button type="button" className="btn sm" onClick={save} disabled={busy}>{busy ? 'Henter posisjon…' : 'Lagre posisjonen min nå'}</button>
      {r.tracker_url ? <a className="btn sm" href={r.tracker_url} target="_blank" rel="noreferrer"><Icon.globe size={16} /> {r.tracker || 'Sporing'}</a>
        : r.tracker ? <a className="btn sm" href="https://www.icloud.com/find" target="_blank" rel="noreferrer"><Icon.globe size={16} /> Finn «{r.tracker}» i Hvor er?</a> : null}
    </div>
  </div>;
}
