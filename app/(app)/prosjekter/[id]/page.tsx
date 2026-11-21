'use client';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { sb } from '@/lib/supabase';
import { lookupCode, resBusy, unitLabel, useAvailability, useStore } from '@/lib/store';
import { Empty, Head, Icon, Pill, Prog, Sheet, Stepper, useToast } from '@/components/ui';
import { Scanner, type ScanResult } from '@/components/Scanner';
import { Picker, ProjectSheet, photoOf } from '@/components/sheets';
import { KTYPE, PSTATUS, STAGES, type StageK, daysBetween, fr, initials, projTotals } from '@/lib/util';

const PICKUPS = ['Lageret', 'Kontoret', 'Tomta'];
type GroupBy = 'pakke' | 'hent' | 'bil';
const ss = { get: (k: string) => { try { return sessionStorage.getItem(k); } catch { return null; } }, set: (k: string, v: string) => { try { sessionStorage.setItem(k, v); } catch {} } };

export default function Prosjekt() {
  const { id } = useParams<{ id: string }>();
  const store = useStore(); const toast = useToast(); const router = useRouter();
  const p = store.P(id);
  const [tab, setTab] = useState<'pakk' | 'info' | 'res'>(() => (ss.get('ptab:' + id) as any) || 'pakk');
  const [stage, setStage] = useState<StageK>(() => (ss.get('pstage:' + id) as any) || 'pick');
  const [groupBy, setGroupBy] = useState<GroupBy>(() => (ss.get('pgroup') as any) || 'pakke');
  const [filter, setFilter] = useState<string>(() => ss.get('pfilter:' + id) || 'Alle');
  const [scanning, setScanning] = useState(false); const [picking, setPicking] = useState(false); const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState(false); const [lineEdit, setLineEdit] = useState<any>(null);
  const [scans, setScans] = useState<any[]>([]);
  useEffect(() => { ss.set('ptab:' + id, tab); ss.set('pstage:' + id, stage); ss.set('pgroup', groupBy); ss.set('pfilter:' + id, filter); }, [id, tab, stage, groupBy, filter]);

  const lines = useMemo(() => store.db.project_lines.filter(l => l.project_id === id).sort((a, b) => (+b.starred - +a.starred) || a.sort - b.sort || a.created_at.localeCompare(b.created_at)), [store.db.project_lines, id]);
  const av = useAvailability(p?.start_date, p?.end_date, id);
  const loadScans = useCallback(async () => {
    if (!lines.length) return setScans([]);
    const { data } = await sb().from('scans').select('*').in('line_id', lines.map(l => l.id));
    setScans(data || []);
  }, [lines]);
  useEffect(() => { loadScans(); }, [loadScans]);

  if (!p) return store.db.projects.length ? <Head title="Fant ikke prosjektet" back={['/prosjekter', 'Prosjekter']} /> : <div className="loading">Laster…</div>;
  const st = STAGES.find(s => s.k === stage)!;
  const col = st.col as 'done_pick' | 'done_load' | 'done_ret';
  const t = projTotals(lines);
  const nameOf = (l: any) => l.model_id ? (store.M(l.model_id)?.name || '?') : l.custom_name;
  const projRes = store.db.project_resources.filter(x => x.project_id === p.id).map(x => store.R(x.resource_id)).filter(Boolean);
  const pickups = [...new Set([...lines.map(l => l.pickup).filter(Boolean)])];
  const vehicles = [...new Set(lines.map(l => l.vehicle_id).filter(Boolean))].map(v => store.R(v)).filter(Boolean);

  const setProgress = async (l: any, n: number, unitId?: string) => {
    n = Math.max(0, Math.min(l.qty, n));
    store.mutate('project_lines', rows => rows.map(r => r.id === l.id ? { ...r, [col]: n } : r));
    const { error } = await sb().rpc('set_progress', { p_line: l.id, p_stage: stage, p_n: n, p_unit: unitId || null });
    if (error) { toast(error.message, 'bad'); store.refresh('project_lines'); return false; }
    const after = lines.map(r => r.id === l.id ? { ...r, [col]: n } : r); const tt = projTotals(after);
    if (stage === 'load' && p.status === 'Bekreftet' && tt.load === tt.qty) { await sb().from('projects').update({ status: 'Pågår' }).eq('id', p.id); store.refresh('projects'); toast('Alt er lastet. Prosjektet står nå som «Pågår».'); }
    if (stage === 'ret' && p.status !== 'Returnert' && tt.ret === tt.qty) { await sb().from('projects').update({ status: 'Returnert' }).eq('id', p.id); store.refresh('projects'); toast('Alt er returnert. Prosjektet er avsluttet.'); }
    return true;
  };

  const defaults = () => ({ pickup: groupBy === 'hent' && filter !== 'Alle' ? filter : null, vehicle_id: groupBy === 'bil' && filter !== 'Alle' && filter !== '–' ? filter : null });
  const addLines = async (rows: any[]) => {
    const base = lines.length;
    const { error } = await sb().from('project_lines').insert(rows.map((r, i) => ({ project_id: p.id, sort: base + i, ...defaults(), ...r })));
    if (error) return toast(error.message, 'bad');
    await store.refresh('project_lines');
  };
  const addKit = (k: any) => {
    const items = store.kitItems(k.id);
    return addLines(items.length ? items.map(i => ({ model_id: i.model_id, qty: i.qty, kit_id: k.id })) : [{ model_id: k.model_id, qty: 1, kit_id: k.id }]);
  };

  const scanned = (l: any) => scans.filter(s => s.line_id === l.id && s.stage === stage);
  const onScan = async (code: string): Promise<ScanResult> => {
    const r = lookupCode(store, code);
    if (r.type === 'none') return { kind: 'bad', msg: `Ukjent kode ${r.code}` };
    if (r.type === 'kit') {
      const kl = lines.filter(l => l.kit_id === r.kit.id);
      if (kl.length) { for (const l of kl) await setProgress(l, l.qty); return { kind: 'ok', msg: `${store.M(r.kit.model_id).name}: ${kl.reduce((a, l) => a + l.qty, 0)} enheter ${st.label.toLowerCase()}` }; }
    }
    if (r.type === 'model') {
      const ml = lines.filter(l => l.model_id === r.model.id);
      if (!ml.length) return { kind: 'warn', msg: `${r.model.name} er ikke på pakklista` };
      for (const l of ml) await setProgress(l, l.qty);
      return { kind: 'ok', msg: `${r.model.name}: alle ${ml.reduce((a, l) => a + l.qty, 0)} ${st.label.toLowerCase()}` };
    }
    const u = r.unit; const m = store.M(u.model_id);
    if (u.status === 'service') return { kind: 'bad', msg: `${unitLabel(store, u)} er på service. Ikke bruk den.` };
    const ml = lines.filter(l => l.model_id === u.model_id);
    if (!ml.length) return { kind: 'warn', msg: `${m.name} er ikke på pakklista`, action: store.internal ? { label: 'Legg til', fn: async () => { await addLines([{ model_id: u.model_id, qty: 1 }]); toast('Lagt til på pakklista'); } } : undefined };
    if (scans.some(s => s.unit_id === u.id && s.stage === stage && ml.some(l => l.id === s.line_id))) return { kind: 'warn', msg: `${unitLabel(store, u)} er allerede skannet` };
    const l = ml.find(l => l[col] < l.qty);
    if (!l) return { kind: 'warn', msg: `Nok ${m.name} er allerede ${st.label.toLowerCase()} (${ml.reduce((a, l) => a + l.qty, 0)})` };
    const ok = await setProgress(l, l[col] + 1, u.id);
    if (ok) setScans(s => [...s, { line_id: l.id, unit_id: u.id, stage }]);
    return { kind: 'ok', msg: `${unitLabel(store, u)} · ${l[col] + 1}/${l.qty}${l.pickup ? ' · ' + l.pickup : ''}` };
  };

  // Gruppering og filter
  const keyOf = (l: any): { key: string; title: string; kit?: any } => {
    if (groupBy === 'hent') return { key: 'h:' + (l.pickup || ''), title: l.pickup || 'Uten hentested' };
    if (groupBy === 'bil') { const r = l.vehicle_id ? store.R(l.vehicle_id) : null; return { key: 'b:' + (l.vehicle_id || ''), title: r ? r.name : 'Uten kjøretøy' }; }
    if (l.kit_id) { const kit = store.K(l.kit_id); return { key: 'k:' + l.kit_id, title: kit ? store.M(kit.model_id)?.name : 'Pakke', kit }; }
    return { key: 'c:' + (l.model_id ? store.M(l.model_id)?.cat || '' : 'Uoppført utstyr'), title: l.model_id ? store.M(l.model_id)?.cat || '' : 'Uoppført utstyr' };
  };
  const filterOpts = groupBy === 'hent' ? ['Alle', ...pickups, ...(lines.some(l => !l.pickup) ? ['–'] : [])] : groupBy === 'bil' ? ['Alle', ...vehicles.map((v: any) => v.id), ...(lines.some(l => !l.vehicle_id) ? ['–'] : [])] : [];
  const fLabel = (f: string) => f === 'Alle' ? 'Alle' : f === '–' ? (groupBy === 'hent' ? 'Uten hentested' : 'Uten kjøretøy') : groupBy === 'bil' ? store.R(f)?.name || '?' : f;
  const shown = lines.filter(l => groupBy === 'pakke' || filter === 'Alle' || (groupBy === 'hent' ? (filter === '–' ? !l.pickup : l.pickup === filter) : (filter === '–' ? !l.vehicle_id : l.vehicle_id === filter)));
  const groups: { key: string; title: string; kit?: any; lines: any[] }[] = [];
  shown.forEach(l => { const k = keyOf(l); let g = groups.find(x => x.key === k.key); if (!g) { g = { ...k, lines: [] }; groups.push(g); } g.lines.push(l); });
  groups.sort((a, b) => (a.key.startsWith('k:') ? 0 : 1) - (b.key.startsWith('k:') ? 0 : 1) || (a.title.startsWith('Uten') ? 1 : 0) - (b.title.startsWith('Uten') ? 1 : 0) || a.title.localeCompare(b.title, 'nb'));
  const idx = STAGES.findIndex(s => s.k === stage);
  const st2 = shown.reduce((a, l) => ({ d: a.d + Math.min(l.qty, l[col]), q: a.q + l.qty }), { d: 0, q: 0 });

  return <>
    <Head title={p.name} back={['/prosjekter', 'Prosjekter']} sub={<>{p.customer}{p.asana ? ` · Asana ${p.asana}` : ''} · <span className="tnum">{fr(p.start_date, p.end_date)}</span></>} />
    <div className="card"><div className="progs"><Prog label="Satt fram" a={t.pick} b={t.qty} /><Prog label="Lastet" a={t.load} b={t.qty} /><Prog label="Returnert" a={t.ret} b={t.qty} /></div></div>
    <div className="seg" role="group" aria-label="Visning">{([['pakk', 'Pakkliste'], ['info', 'Info'], ['res', 'Ressurser']] as const).map(([k, l]) => <button key={k} aria-pressed={tab === k} onClick={() => setTab(k)}>{l}</button>)}</div>

    {tab === 'pakk' && <>
      <div className="stagebar">
        <div className="seg" role="group" aria-label="Steg">{STAGES.map(s => <button key={s.k} aria-pressed={stage === s.k} onClick={() => setStage(s.k)}>{s.label}</button>)}</div>
        <div className="row-actions"><button className="btn accent" style={{ flex: 1 }} onClick={() => setScanning(true)}><Icon.scan /> Skann til «{st.label.toLowerCase()}»</button>
          {store.internal && <><button className="btn" onClick={() => setPicking(true)} aria-label="Legg til utstyr fra lageret"><Icon.plus /> Utstyr</button><button className="btn" onClick={() => setAdding(true)}><Icon.plus /> Uoppført</button></>}</div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <span className="small muted">Sorter etter</span>
          <div className="chips">{([['pakke', 'Pakke/kategori'], ['hent', 'Hentested'], ['bil', 'Kjøretøy']] as const).map(([k, l]) => <button key={k} className="chip" aria-pressed={groupBy === k} onClick={() => { setGroupBy(k); setFilter('Alle'); }}>{l}</button>)}</div>
        </div>
        {filterOpts.length > 1 && <div className="chips">{filterOpts.map(f => <button key={f} className="chip" aria-pressed={filter === f} style={{ fontSize: '.82rem', padding: '4px 12px' }} onClick={() => setFilter(f)}>{fLabel(f)}</button>)}</div>}
        {filter !== 'Alle' && groupBy !== 'pakke' && <div className="small muted tnum">{st.label}: {st2.d}/{st2.q} i dette utvalget. Nytt utstyr du legger til nå havner her.</div>}
      </div>
      {groups.map(g => {
        const gd = g.lines.reduce((a, l) => a + Math.min(l.qty, l[col]), 0), gq = g.lines.reduce((a, l) => a + l.qty, 0);
        return <div className="group" key={g.key}>
          <div className="group-h"><h3>{g.kit && (g.kit.type === 'case' ? <Icon.case size={18} /> : <Icon.layers size={18} />)}{groupBy === 'bil' && <Icon.truck size={18} />}{g.title}{g.kit && <> <Pill c="vio">{KTYPE[g.kit.type]}</Pill></>}</h3><span className="small muted tnum">{gd}/{gq}</span></div>
          <div className="list">{g.lines.map(l => {
            const m = l.model_id ? store.M(l.model_id) || { name: '?', cat: '' } : null; const d = l[col]; const full = d >= l.qty;
            const prevCol = idx > 0 ? STAGES[idx - 1].col : null; const prev = prevCol ? l[prevCol] : null;
            const a = l.model_id ? av.get(l.model_id)?.available : null; const short = stage === 'pick' && !l.external && p.status !== 'Returnert' && a != null ? Math.max(0, l.qty - Math.max(0, a)) : 0;
            const sc = scanned(l).map(s => store.U(s.unit_id)).filter(Boolean); const veh = l.vehicle_id ? store.R(l.vehicle_id) : null; const ph = m && photoOf(m);
            const meta = [m ? (m.loc || m.sub || m.cat) : 'Uoppført', groupBy !== 'hent' && l.pickup ? 'Hentes: ' + l.pickup : null, groupBy !== 'bil' && veh ? veh.name : null].filter(Boolean).join(' · ');
            return <div key={l.id} className={'pl' + (full ? ' done' : '')}>
              {ph ? <img className="thumb" src={ph} alt="" style={{ width: 40, height: 40 }} /> : <div className="qty tnum">{l.qty}×</div>}
              <div className="main" role={m ? 'link' : undefined} tabIndex={m ? 0 : undefined} style={{ cursor: m || store.internal ? 'pointer' : undefined }}
                onClick={() => m ? router.push(`/lager/${l.model_id}?fra=${id}`) : store.internal && setLineEdit(l)}
                onKeyDown={e => e.key === 'Enter' && m && router.push(`/lager/${l.model_id}?fra=${id}`)}>
                <div className="t">{l.starred && <span style={{ color: 'var(--orange)' }} aria-label="Prioritert">★ </span>}{ph && <span className="tnum">{l.qty}× </span>}{nameOf(l)}</div>
                <div className="s">{meta}{l.external && <> <Pill c="acc">Lånes eksternt</Pill></>}{prev != null && prev < l.qty && <span style={{ color: 'var(--warn)' }}> · {STAGES[idx - 1].label} {prev}/{l.qty}</span>}{short > 0 && <> <Pill c="bad">Mangler {short}</Pill></>}</div>
                {l.note && <div className="s" style={{ fontStyle: 'italic' }}>{l.note}</div>}
                {sc.length > 0 && <div className="unitchips">{sc.map(u => <span key={u.id}>#{u.no}</span>)}</div>}
              </div>
              {l.qty > 1 && <Stepper value={d} max={l.qty} onChange={n => setProgress(l, n)} label={`${d}/${l.qty}`} />}
              <button className={'check' + (full ? ' full' : d ? ' part' : '')} onClick={() => setProgress(l, full ? 0 : l.qty)} aria-label={`${st.verb}: ${nameOf(l)}`} aria-pressed={full}><Icon.check size={24} /></button>
              {store.internal && <button className="btn ghost sm" style={{ padding: '6px 4px', minHeight: 44 }} onClick={() => setLineEdit(l)} aria-label={`Endre ${nameOf(l)}`}>⋯</button>}
            </div>;
          })}</div>
        </div>;
      })}
      {!lines.length && <div className="card"><Empty>Pakklista er tom. {store.internal ? 'Trykk «Utstyr» for å legge inn fra lageret, eller «Uoppført» for paller, tusjer og lånt utstyr.' : ''}</Empty></div>}
      {lines.length > 0 && !shown.length && <div className="card"><Empty>Ingenting i dette utvalget.</Empty></div>}
    </>}

    {tab === 'info' && <InfoTab p={p} onEdit={() => setEditing(true)} />}
    {tab === 'res' && <ResTab p={p} />}

    {scanning && <Scanner title={'Skann: ' + st.label} hint="Hold koden foran kameraet. Lista oppdateres fortløpende." continuous onClose={() => setScanning(false)} onCode={onScan} />}
    {picking && <Picker title="Legg til i pakkliste" start={p.start_date} end={p.end_date} exProject={p.id} onClose={() => setPicking(false)} onPick={async (sel, kit) => {
      if (kit) await addKit(kit); if (sel.length) await addLines(sel.map(([model_id, qty]) => ({ model_id, qty })));
      setPicking(false); toast(kit ? `${store.M(kit.model_id).name} er lagt til` : `${sel.length} linjer lagt til`);
    }} />}
    {adding && <CustomSheet pickups={[...new Set([...PICKUPS, ...pickups])]} vehicles={projRes} def={defaults()} onClose={() => setAdding(false)} onSave={async row => { await addLines([row]); setAdding(false); toast(`${row.custom_name} er lagt til`); }} />}
    {editing && <ProjectSheet project={p} onClose={() => setEditing(false)} />}
    {lineEdit && <LineSheet line={lineEdit} lines={lines} name={nameOf(lineEdit)} pickups={[...new Set([...PICKUPS, ...pickups])]} vehicles={projRes} onClose={() => setLineEdit(null)} />}
  </>;
}

function PickupField({ id, pickups, value }: { id: string; pickups: string[]; value?: string | null }) {
  return <div className="field"><label htmlFor={id}>Hentes fra</label><input className="input" id={id} name="pickup" list={id + '-l'} defaultValue={value || ''} placeholder="F.eks. Lageret, Kontoret, Tomta" />
    <datalist id={id + '-l'}>{pickups.map(x => <option key={x} value={x} />)}</datalist></div>;
}
function VehicleField({ id, vehicles, value }: { id: string; vehicles: any[]; value?: string | null }) {
  const store = useStore(); const all = [...vehicles, ...store.db.resources.filter(r => r.active && !vehicles.some(v => v.id === r.id))];
  return <div className="field"><label htmlFor={id}>Pakkes i</label><select className="input" id={id} name="vehicle_id" defaultValue={value || ''}>
    <option value="">– ikke valgt –</option>
    {vehicles.length > 0 && <optgroup label="På prosjektet">{vehicles.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}</optgroup>}
    {all.length > vehicles.length && <optgroup label="Andre">{all.slice(vehicles.length).map(v => <option key={v.id} value={v.id}>{v.name}</option>)}</optgroup>}
  </select></div>;
}

function CustomSheet({ pickups, vehicles, def, onClose, onSave }: { pickups: string[]; vehicles: any[]; def: any; onClose: () => void; onSave: (row: any) => void }) {
  const [qty, setQty] = useState(1);
  return <Sheet title="Uoppført utstyr" onClose={onClose}>
    <form className="form" onSubmit={e => { e.preventDefault(); const d = Object.fromEntries(new FormData(e.currentTarget)) as any;
      onSave({ custom_name: d.name.trim(), qty, pickup: d.pickup || null, vehicle_id: d.vehicle_id || null, note: d.note || null, external: !!d.external }); }}>
      <p className="small muted" style={{ margin: 0 }}>For ting som ikke står i lageret, som paller, paraplyer og tusjer, eller utstyr som lånes eksternt. Linjen kan hakes av på alle steg som annet utstyr.</p>
      <div className="field"><label htmlFor="cu-n">Hva</label><input className="input" id="cu-n" name="name" required autoFocus placeholder="F.eks. Europaller" /></div>
      <div className="field"><label>Antall</label><Stepper value={qty} min={1} onChange={setQty} /></div>
      <PickupField id="cu-p" pickups={pickups} value={def.pickup} />
      <VehicleField id="cu-v" vehicles={vehicles} value={def.vehicle_id} />
      <div className="field"><label htmlFor="cu-k">Kommentar</label><input className="input" id="cu-k" name="note" placeholder="F.eks. lånes fra Scenekunst, hentes torsdag" /></div>
      <label style={{ display: 'flex', gap: 10, alignItems: 'center', fontWeight: 600 }}><input type="checkbox" name="external" style={{ width: 20, height: 20, accentColor: 'var(--orange)' }} /> Lånes eller leies eksternt</label>
      <button className="btn primary block">Legg til</button>
    </form>
  </Sheet>;
}

function LineSheet({ line, lines, name, pickups, vehicles, onClose }: { line: any; lines: any[]; name: string; pickups: string[]; vehicles: any[]; onClose: () => void }) {
  const store = useStore(); const toast = useToast(); const [qty, setQty] = useState(line.qty);
  const move = async (dir: -1 | 1) => {
    const same = lines.filter(l => l.starred === line.starred);
    const i = same.findIndex(l => l.id === line.id); const other = same[i + dir]; if (!other) return;
    const a = same.map((l, k) => ({ id: l.id, sort: k }));
    [a[i].sort, a[i + dir].sort] = [a[i + dir].sort, a[i].sort];
    await Promise.all(a.map(x => sb().from('project_lines').update({ sort: x.sort }).eq('id', x.id)));
    await store.refresh('project_lines'); toast(dir < 0 ? 'Flyttet opp' : 'Flyttet ned');
  };
  return <Sheet title={name} onClose={onClose}>
    <form className="form" onSubmit={async e => {
      e.preventDefault(); const d = Object.fromEntries(new FormData(e.currentTarget)) as any;
      const patch: any = { qty, pickup: d.pickup || null, vehicle_id: d.vehicle_id || null, note: d.note || null, starred: !!d.starred, external: !!d.external,
        done_pick: Math.min(qty, line.done_pick), done_load: Math.min(qty, line.done_load), done_ret: Math.min(qty, line.done_ret) };
      if (!line.model_id) patch.custom_name = d.custom_name || line.custom_name;
      const { error } = await sb().from('project_lines').update(patch).eq('id', line.id); if (error) return toast(error.message, 'bad');
      await store.refresh('project_lines'); toast('Lagret'); onClose();
    }}>
      {!line.model_id && <div className="field"><label htmlFor="le-n">Navn</label><input className="input" id="le-n" name="custom_name" defaultValue={line.custom_name} /></div>}
      {line.model_id && <Link className="btn" href={`/lager/${line.model_id}?fra=${line.project_id}`}>Åpne produktsiden</Link>}
      <div className="field"><label>Antall</label><Stepper value={qty} min={1} onChange={setQty} /></div>
      <PickupField id="le-p" pickups={pickups} value={line.pickup} />
      <VehicleField id="le-v" vehicles={vehicles} value={line.vehicle_id} />
      <div className="field"><label htmlFor="le-k">Kommentar</label><input className="input" id="le-k" name="note" defaultValue={line.note || ''} /></div>
      <label style={{ display: 'flex', gap: 10, alignItems: 'center', fontWeight: 600 }}><input type="checkbox" name="starred" defaultChecked={line.starred} style={{ width: 20, height: 20, accentColor: 'var(--orange)' }} /> ★ Prioritert – skal først</label>
      <label style={{ display: 'flex', gap: 10, alignItems: 'center', fontWeight: 600 }}><input type="checkbox" name="external" defaultChecked={line.external} style={{ width: 20, height: 20, accentColor: 'var(--orange)' }} /> Lånes eller leies eksternt</label>
      <div className="row-actions"><button type="button" className="btn sm" onClick={() => move(-1)}>↑ Flytt opp</button><button type="button" className="btn sm" onClick={() => move(1)}>↓ Flytt ned</button></div>
      <button className="btn primary block">Lagre</button>
      <button type="button" className="btn ghost danger" onClick={async () => { const { error } = await sb().from('project_lines').delete().eq('id', line.id); if (error) return toast(error.message, 'bad'); await store.refresh('project_lines'); toast('Linjen er fjernet'); onClose(); }}><Icon.trash /> Fjern fra pakklista</button>
    </form>
  </Sheet>;
}

function InfoTab({ p, onEdit }: { p: any; onEdit: () => void }) {
  const store = useStore(); const toast = useToast();
  const [invites, setInvites] = useState<any[]>([]); const [email, setEmail] = useState('');
  const load = useCallback(async () => { if (!store.internal) return; const { data } = await sb().from('project_invites').select('*').eq('project_id', p.id); setInvites(data || []); }, [p.id, store.internal]);
  useEffect(() => { load(); }, [load]);
  const crew = store.db.project_crew.filter(c => c.project_id === p.id).map(c => store.db.profiles.find(u => u.id === c.user_id)).filter(Boolean);
  const shareUrl = p.share_token ? `${typeof location !== 'undefined' ? location.origin : ''}/p/${p.share_token}` : null;
  const setShare = async (on: boolean) => {
    const token = on ? Array.from(crypto.getRandomValues(new Uint8Array(18)), b => b.toString(36).padStart(2, '0')).join('').slice(0, 24) : null;
    const { error } = await sb().from('projects').update({ share_token: token }).eq('id', p.id); if (error) return toast(error.message, 'bad');
    await store.refresh('projects'); toast(on ? 'Delbar lenke er laget' : 'Lenken er slått av');
  };
  return <>
    <div className="card"><dl className="kv"><dt>Kunde</dt><dd>{p.customer}</dd><dt>Asana</dt><dd>{p.asana || '–'}</dd><dt>Periode</dt><dd className="tnum">{fr(p.start_date, p.end_date)} ({daysBetween(p.start_date, p.end_date) + 1} dager)</dd>
      <dt>Sted</dt><dd>{p.venue || '–'}</dd><dt>Kontakt</dt><dd>{p.contact || '–'}</dd><dt>Status</dt><dd><Pill c={PSTATUS[p.status]}>{p.status}</Pill></dd></dl>
      {store.internal && <button className="btn" onClick={onEdit}>Rediger prosjekt</button>}</div>
    {store.internal && <div className="card"><h3>Delbar lenke til pakklista</h3>
      <p className="small muted" style={{ margin: 0 }}>Alle med lenken kan se pakklista uten å logge inn, men ikke endre den. For å hake av må man være innlogget eller invitert.</p>
      {shareUrl ? <>
        <div className="search"><input readOnly value={shareUrl} aria-label="Lenke" onFocus={e => e.target.select()} /><button className="btn sm primary" onClick={() => navigator.clipboard.writeText(shareUrl).then(() => toast('Lenken er kopiert'), () => toast('Merk og kopier lenken', 'warn'))}><Icon.copy /> Kopier</button></div>
        <div className="row-actions"><a className="btn sm" href={shareUrl} target="_blank" rel="noreferrer">Åpne</a><button className="btn sm ghost danger" onClick={() => setShare(false)}>Slå av lenken</button></div>
      </> : <button className="btn" onClick={() => setShare(true)}>Lag delbar lenke</button>}
    </div>}
    {store.internal && <div className="card"><h3>Eksterne med tilgang</h3>
      <div className="list">
        {crew.map((u: any) => <div key={u.id} className="item"><span className="avatar ext">{initials(u.name || u.email)}</span><div className="main"><div className="t">{u.name}</div><div className="s">{u.email} · kan se og hake av pakklista</div></div>
          <button className="btn ghost sm" aria-label="Fjern tilgang" onClick={async () => { await sb().from('project_crew').delete().match({ project_id: p.id, user_id: u.id }); store.refresh('project_crew'); }}><Icon.x /></button></div>)}
        {invites.map(i => <div key={i.email} className="item"><span className="avatar ext">?</span><div className="main"><div className="t">{i.email}</div><div className="s">Invitert, har ikke logget inn ennå</div></div>
          <button className="btn ghost sm" aria-label="Trekk tilbake" onClick={async () => { await sb().from('project_invites').delete().match({ project_id: p.id, email: i.email }); load(); }}><Icon.x /></button></div>)}
        {!crew.length && !invites.length && <Empty>Ingen eksterne invitert.</Empty>}
      </div>
      <form className="search" onSubmit={async e => {
        e.preventDefault(); if (!email.trim()) return;
        const { data, error } = await sb().rpc('invite_external', { p_project: p.id, p_email: email.trim() });
        if (error) return toast(error.message, 'bad');
        toast(data === 'lagt_til' ? `${email} har fått tilgang` : `${email} er invitert. Send dem lenken til appen; de logger inn med Google.`);
        setEmail(''); load(); store.refresh('project_crew', 'profiles');
      }}><input type="email" inputMode="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="Google-konto (e-post)" aria-label="E-post" /><button className="btn sm primary">Inviter</button></form>
      <p className="small muted" style={{ margin: 0 }}>Eksterne logger inn med Google og ser bare pakklista i prosjektene de er invitert til.</p>
    </div>}
  </>;
}

function ResTab({ p }: { p: any }) {
  const store = useStore(); const toast = useToast();
  const on = new Set(store.db.project_resources.filter(x => x.project_id === p.id).map(x => x.resource_id));
  const res = store.db.resources.filter(r => r.active || on.has(r.id));
  return <div className="card"><h3>Kjøretøy og ressurser</h3><p className="small muted" style={{ margin: 0 }}>Kjøretøy du velger her, kommer øverst når du bestemmer hva utstyret skal pakkes i.</p><div className="list">
    {res.map(r => { const busy = resBusy(store, r.id, p.start_date, p.end_date, { project: p.id }); const checked = on.has(r.id);
      return <label key={r.id} className="item" style={{ cursor: 'pointer' }}>
        <input type="checkbox" checked={checked} disabled={!store.internal} style={{ width: 22, height: 22, accentColor: 'var(--orange)' }} onChange={async e => {
          const { error } = e.target.checked ? await sb().from('project_resources').insert({ project_id: p.id, resource_id: r.id }) : await sb().from('project_resources').delete().match({ project_id: p.id, resource_id: r.id });
          if (error) return toast(error.message, 'bad'); store.refresh('project_resources');
        }} />
        <div className="main"><div className="t">{r.name}</div><div className="s">{r.type}{r.sub ? ' · ' + r.sub : ''}</div></div>
        {busy.length ? <Pill c={checked ? 'bad' : 'warn'}>Opptatt: {busy[0].name}</Pill> : <Pill c="ok">Ledig</Pill>}
      </label>; })}
    {!res.length && <Empty>Ingen ressurser registrert. Legg dem til under Mer → Ressurser.</Empty>}
  </div></div>;
}
