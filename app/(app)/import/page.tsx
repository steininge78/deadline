'use client';
import { useState } from 'react';
import { sb } from '@/lib/supabase';
import { useStore } from '@/lib/store';
import { Head, Icon, useToast } from '@/components/ui';
import { RentmanPhotos } from '@/components/RentmanPhotos';

// Import fra Rentman-eksport eller annet regneark. Kan kjøres flere ganger:
// artikler oppdateres på utstyrskode, nye QR-koder blir nye enheter, ingenting slettes.
const FIELDS: [string, string, RegExp][] = [
  ['name', 'Navn *', /^utstyr$|^navn$|^name$|artikkel|produkt/i], ['cat', 'Kategori', /^kategori$|^category$/i], ['sub', 'Underkategori', /underkategori|subcat/i],
  ['qty', 'Antall', /^antall$|^qty$|quantity|^stk$/i], ['price', 'Dagpris', /^pris|^price/i], ['code', 'Utstyrskode (unik)', /utstyrskode|^kode$|^code$|sku/i],
  ['qr', 'QR-koder (kommaseparert)', /qr|rfid|barcode|strek/i], ['serial', 'Serienumre', /serie|serial/i], ['loc', 'Lagerplass', /lagerplass|location|plassering/i],
  ['type', 'Utstyrstype (pakke?)', /utstyrstype/i], ['sale', 'Utleie/salg', /utleie\/salg|salg/i], ['rid', 'Rentman-ID', /rentman-id/i],
  ['desc', 'Beskrivelse', /^beskrivelse$|description/i], ['notes', 'Notater', /^notater$|^notes$/i], ['pstat', 'Prisstatus', /prisstatus/i], ['pbasis', 'Prisgrunnlag', /prisgrunnlag/i], ['ctrl', 'Kontroll', /kontroll/i]
];
const split = (v: any) => String(v ?? '').split(',').map(s => s.trim()).filter(Boolean);
const chunks = <T,>(a: T[], n = 400) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));

export default function Import() {
  const store = useStore(); const toast = useToast();
  const [rows, setRows] = useState<any[]>([]); const [cols, setCols] = useState<string[]>([]); const [sheet, setSheet] = useState('');
  const [map, setMap] = useState<Record<string, string>>({}); const [vehicles, setVehicles] = useState(true);
  const [log, setLog] = useState<string[]>([]); const [busy, setBusy] = useState(false);
  const say = (s: string) => setLog(l => [...l, s]);

  const read = async (f: File) => {
    const XLSX = await import('xlsx');
    const wb = XLSX.read(await f.arrayBuffer()); const ws = wb.Sheets[wb.SheetNames[0]];
    const raw: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
    // Finn overskriftsraden (Rentman-eksporten har tittelrader over)
    let h = raw.findIndex(r => r.some(c => /^(utstyr|navn|name)$/i.test(String(c).trim())));
    if (h < 0) h = 0;
    const header = raw[h].map((c: any) => String(c).trim());
    const data = raw.slice(h + 1).filter(r => r.some(c => c !== '')).map(r => Object.fromEntries(header.map((c, i) => [c, r[i]])));
    setCols(header.filter(Boolean)); setRows(data); setSheet(wb.SheetNames[0]); setLog([]);
    setMap(Object.fromEntries(FIELDS.map(([k, , re]) => [k, header.find(c => re.test(c)) || ''])));
  };

  const get = (r: any, k: string) => map[k] ? r[map[k]] : '';
  const big = rows.filter(r => +get(r, 'qty') > 1000);

  const run = async () => {
    if (!map.name) return toast('Velg hvilken kolonne som er navn', 'bad');
    setBusy(true); setLog([]);
    try {
      const items = rows.map(r => ({
        name: String(get(r, 'name')).trim(), cat: String(get(r, 'cat') || 'Uten kategori').trim(), sub: String(get(r, 'sub') || '').trim() || null,
        qty: Math.max(0, parseInt(get(r, 'qty')) || 1), price: get(r, 'price') === '' || get(r, 'price') == null ? null : +get(r, 'price'),
        code: String(get(r, 'code') || '').trim() || null, qrs: split(get(r, 'qr')).map(s => s.toUpperCase()), serials: split(get(r, 'serial')),
        loc: String(get(r, 'loc') || '').trim() || null, type: String(get(r, 'type') || ''), sale: /^salg$/i.test(String(get(r, 'sale')).trim()),
        rid: parseInt(get(r, 'rid')) || null, desc: String(get(r, 'desc') || '').trim() || null, notes: String(get(r, 'notes') || '').trim() || null,
        pstat: String(get(r, 'pstat') || '') || null, pbasis: String(get(r, 'pbasis') || '') || null, ctrl: String(get(r, 'ctrl') || '') || null
      })).filter(x => x.name);

      // 1. Salgsvarer
      const sales = items.filter(x => x.sale);
      if (sales.length) {
        const withCode = sales.filter(s => s.code), noCode = sales.filter(s => !s.code);
        if (withCode.length) { const { error } = await sb().from('consumables').upsert(withCode.map(s => ({ code: s.code, name: s.name, stock: s.qty, price: s.price })), { onConflict: 'code' }); if (error) throw error; }
        if (noCode.length) { const { error } = await sb().from('consumables').insert(noCode.map(s => ({ name: s.name, stock: s.qty, price: s.price }))); if (error) throw error; }
        say(`${sales.length} salgsvarer`);
      }
      // 2. Kjøretøy og hengere → ressurser
      const isVeh = (x: any) => vehicles && /kjøretøy og hengere/i.test(x.sub || '');
      const veh = items.filter(x => !x.sale && isVeh(x));
      const existingRes = new Set(store.db.resources.map(r => r.name.toLowerCase()));
      const newRes = veh.filter(v => !existingRes.has(v.name.toLowerCase()));
      if (newRes.length) { const { error } = await sb().from('resources').insert(newRes.map(v => ({ name: v.name, type: /henger|vogn/i.test(v.name) ? 'Tilhenger' : 'Kjøretøy', price: v.price, sub: v.loc }))); if (error) throw error; }
      if (veh.length) say(`${newRes.length} nye ressurser (kjøretøy og hengere)`);

      // 3. Artikler
      const arts = items.filter(x => !x.sale && !isVeh(x)).map(x => ({ ...x, track: (x.qrs.length === x.qty || x.qty <= 10) ? 'unit' : 'qty', kit: /fysisk pakke/i.test(x.type) ? 'case' : /virtuell pakke/i.test(x.type) ? 'pakke' : null }));
      const existing = new Map(store.db.models.filter(m => m.code).map(m => [m.code, m]));
      const fields = (x: any) => ({ name: x.name, cat: x.cat, sub: x.sub, price: x.price, loc: x.loc, rentman_id: x.rid, description: x.desc, notes: x.notes, price_status: x.pstat, price_basis: x.pbasis, control_note: x.ctrl, is_kit: !!x.kit });
      const defaultInterval = (x: any) => ((/strøm og kabler/i.test(x.cat) && !/aggregat/i.test(x.sub || '')) || /truss/i.test(x.sub || '')) ? 365 : 0;
      const toInsert = arts.filter(x => !x.code || !existing.has(x.code)).map(x => ({ ...fields(x), code: x.code, track: x.track, stock: x.track === 'qty' ? x.qty : 0, qr: x.track === 'qty' ? (x.qrs[0] || null) : null, inspect_interval: defaultInterval(x) }));
      const toUpdate = arts.filter(x => x.code && existing.has(x.code));
      const idByCode = new Map<string, string>(); const idByIdx = new Map<any, string>();
      existing.forEach((m, c) => idByCode.set(c, m.id));
      for (const part of chunks(toInsert)) { const { data, error } = await sb().from('models').insert(part).select('id,code,name'); if (error) throw error; data.forEach((d: any, i: number) => { if (d.code) idByCode.set(d.code, d.id); idByIdx.set(part[i], d.id); }); }
      for (const x of toUpdate) { const { error } = await sb().from('models').update(fields(x)).eq('code', x.code); if (error) throw error; }
      say(`${toInsert.length} nye artikler, ${toUpdate.length} oppdatert`);
      const idOf = (x: any) => x.code ? idByCode.get(x.code) : [...idByIdx.entries()].find(([k]) => k.name === x.name)?.[1];

      // 4. Enheter (én per QR-kode, eller antall)
      const { data: curUnits } = await fetchAllUnits();
      const usedQR = new Set(curUnits.map(u => (u.qr || '').toUpperCase()).filter(Boolean));
      const haveNo = new Map<string, Set<number>>(); curUnits.forEach(u => { if (!haveNo.has(u.model_id)) haveNo.set(u.model_id, new Set()); haveNo.get(u.model_id)!.add(u.no); });
      const newUnits: any[] = [];
      arts.filter(x => x.track === 'unit').forEach(x => {
        const mid = idOf(x); if (!mid) return; const have = haveNo.get(mid) || new Set();
        const n = Math.max(x.qty, x.qrs.length);
        for (let i = 1; i <= n; i++) { if (have.has(i)) continue; const q = x.qrs[i - 1]; newUnits.push({ model_id: mid, no: i, serial: x.serials[i - 1] || null, qr: q && !usedQR.has(q) ? q : null }); if (q) usedQR.add(q); }
      });
      for (const part of chunks(newUnits, 500)) { const { error } = await sb().from('units').insert(part); if (error) throw error; }
      say(`${newUnits.length} nye enheter`);

      // 5. Pakker
      const { data: kitsNow } = await sb().from('kits').select('model_id');
      const hasKit = new Set((kitsNow || []).map((k: any) => k.model_id));
      const newKits = arts.filter(x => x.kit && idOf(x) && !hasKit.has(idOf(x))).map(x => ({ model_id: idOf(x), type: x.kit }));
      if (newKits.length) { const { error } = await sb().from('kits').insert(newKits); if (error) throw error; }
      say(`${newKits.length} nye pakker`);
      // Foreslått innhold ut fra navn (bare for pakker uten innhold)
      await store.refresh();
      const { data: allModels } = await sb().from('models').select('id,name').limit(5000);
      const { data: allKits } = await sb().from('kits').select('id,model_id').limit(5000);
      const { data: kitItems } = await sb().from('kit_items').select('kit_id').limit(10000);
      const filled = new Set((kitItems || []).map((i: any) => i.kit_id));
      const kitModelIds = new Set((allKits || []).map((k: any) => k.model_id));
      const rules: [RegExp, (n: string) => boolean][] = [
        [/^ALLE LED moduler \(50x50cm\)/i, n => n.startsWith('LED-moduler/paneler (50x50cm):')],
        [/^ALLE LED-moduler \(50x100cm\)/i, n => n.startsWith('LED-moduler/paneler (50x100cm):')],
        [/^Barncolor SETT/i, n => /^Barncolor \d/.test(n)],
        [/^Fiber tromler SETT/i, n => n.startsWith('Fiber trommel:')],
        [/^SDI tromler SETT/i, n => n.startsWith('50M 3G SDI trommel:')],
        [/^DJ pakke$/i, n => /^DJ konsoll:|^Bose F1 Sett med SUB/.test(n)]
      ];
      let inferred = 0;
      for (const k of allKits || []) {
        if (filled.has(k.id)) continue; const km = allModels?.find((m: any) => m.id === k.model_id); if (!km) continue;
        const rule = rules.find(([re]) => re.test(km.name)); if (!rule) continue;
        const parts = (allModels || []).filter((m: any) => m.id !== km.id && (!kitModelIds.has(m.id) || /^Bose F1 Sett/.test(m.name)) && rule[1](m.name));
        if (!parts.length) continue;
        await sb().from('kit_items').insert(parts.map((m: any) => ({ kit_id: k.id, model_id: m.id, qty: 1 })));
        await sb().from('kits').update({ inferred: true }).eq('id', k.id); inferred++;
      }
      if (inferred) say(`Foreslått innhold for ${inferred} pakker (kontroller dem under Lager → Pakker)`);
      await store.refresh(); say('Ferdig ✓'); toast('Importen er fullført');
    } catch (e: any) { say('Feil: ' + (e.message || e)); toast('Importen stoppet: ' + (e.message || e), 'bad'); }
    finally { setBusy(false); }
  };

  if (!store.internal) return <Head title="Ingen tilgang" />;
  return <>
    <Head title="Importer lager" back={['/lager', 'Lager']} sub="Les inn Rentman-eksporten eller et annet regneark. Kan kjøres på nytt: artikler oppdateres på utstyrskode, og ingenting slettes." />
    <div className="card">
      <label className="btn accent" htmlFor="xl" style={{ alignSelf: 'flex-start' }}><Icon.upload /> Velg .xlsx eller .csv</label>
      <input id="xl" type="file" accept=".xlsx,.xls,.csv" hidden onChange={e => { const f = e.target.files?.[0]; if (f) read(f); e.target.value = ''; }} />
      {rows.length > 0 && <div className="form">
        <div className="notice">{rows.length} rader i arket «{sheet}». Kontroller at kolonnene er koblet riktig:</div>
        {big.length > 0 && <div className="notice warn">Sjekk antall: {big.map(r => `${get(r, 'name')} (${get(r, 'qty')})`).join(', ')}. Rett i regnearket eller i appen etterpå.</div>}
        <div className="grid2">{FIELDS.map(([k, l]) => <div className="field" key={k}><label htmlFor={'map-' + k}>{l}</label>
          <select className="input" id={'map-' + k} value={map[k] || ''} onChange={e => setMap({ ...map, [k]: e.target.value })}><option value="">– ingen –</option>{cols.map(c => <option key={c}>{c}</option>)}</select></div>)}</div>
        <label style={{ display: 'flex', gap: 10, alignItems: 'center', fontWeight: 600 }}><input type="checkbox" checked={vehicles} onChange={e => setVehicles(e.target.checked)} style={{ width: 20, height: 20, accentColor: 'var(--orange)' }} /> Legg «Kjøretøy og hengere» inn som ressurser i kalenderen</label>
        <div className="tbl"><table><thead><tr>{cols.slice(0, 10).map(c => <th key={c}>{c}</th>)}</tr></thead><tbody>{rows.slice(0, 5).map((r, i) => <tr key={i}>{cols.slice(0, 10).map(c => <td key={c}>{String(r[c] ?? '').slice(0, 40)}</td>)}</tr>)}</tbody></table></div>
        <button className="btn primary" disabled={busy} onClick={run}>{busy ? 'Importerer…' : `Importer ${rows.length} rader`}</button>
      </div>}
      {log.length > 0 && <div className="scanlog">{log.map((l, i) => <div key={i}>{l}</div>)}</div>}
    </div>
    <RentmanPhotos />
  </>;
}

async function fetchAllUnits() {
  const out: any[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb().from('units').select('model_id,no,qr').range(from, from + 999);
    if (error) throw error; out.push(...data); if (data.length < 1000) break;
  }
  return { data: out };
}
