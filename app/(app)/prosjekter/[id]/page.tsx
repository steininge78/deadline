'use client';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { sb } from '@/lib/supabase';
import { lookupCode, resBusy, unitLabel, useAvailability, useStore } from '@/lib/store';
import { Empty, Head, Icon, Pill, Prog, Sheet, Stepper, useToast } from '@/components/ui';
import { Scanner, type ScanResult } from '@/components/Scanner';
import { Picker, ProjectSheet } from '@/components/sheets';
import { KTYPE, PSTATUS, STAGES, type StageK, daysBetween, fr, initials, projTotals } from '@/lib/util';

export default function Prosjekt() {
  const { id } = useParams<{ id: string }>();
  const store = useStore(); const toast = useToast();
  const p = store.P(id);
  const [tab, setTab] = useState<'pakk' | 'info' | 'res'>('pakk');
  const [stage, setStage] = useState<StageK>('pick');
  const [scanning, setScanning] = useState(false); const [picking, setPicking] = useState(false);
  const [editing, setEditing] = useState(false); const [lineEdit, setLineEdit] = useState<any>(null);
  const [scans, setScans] = useState<any[]>([]);
  const lines = useMemo(() => store.db.project_lines.filter(l => l.project_id === id).sort((a, b) => a.sort - b.sort || a.created_at.localeCompare(b.created_at)), [store.db.project_lines, id]);
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

  const setProgress = async (l: any, n: number, unitId?: string) => {
    n = Math.max(0, Math.min(l.qty, n));
    store.mutate('project_lines', rows => rows.map(r => r.id === l.id ? { ...r, [col]: n } : r));
    const { error } = await sb().rpc('set_progress', { p_line: l.id, p_stage: stage, p_n: n, p_unit: unitId || null });
    if (error) { toast(error.message, 'bad'); store.refresh('project_lines'); return false; }
    // Automatisk status
    const after = lines.map(r => r.id === l.id ? { ...r, [col]: n } : r); const tt = projTotals(after);
    if (stage === 'load' && p.status === 'Bekreftet' && tt.load === tt.qty) { await sb().from('projects').update({ status: 'Pågår' }).eq('id', p.id); store.refresh('projects'); toast('Alt er lastet. Prosjektet står nå som «Pågår».'); }
    if (stage === 'ret' && p.status !== 'Returnert' && tt.ret === tt.qty) { await sb().from('projects').update({ status: 'Returnert' }).eq('id', p.id); store.refresh('projects'); toast('Alt er returnert. Prosjektet er avsluttet.'); }
    return true;
  };

  const addLines = async (rows: { model_id: string; qty: number; kit_id?: string }[]) => {
    const base = lines.length;
    const { error } = await sb().from('project_lines').insert(rows.map((r, i) => ({ project_id: p.id, sort: base + i, ...r })));
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
    return { kind: 'ok', msg: `${unitLabel(store, u)} · ${l[col] + 1}/${l.qty}` };
  };

  // Grupper: pakker først, så kategori
  const groups: { key: string; kit: any; title: string; lines: any[] }[] = [];
  lines.forEach(l => {
    const key = l.kit_id || 'cat:' + (store.M(l.model_id)?.cat || '');
    let g = groups.find(x => x.key === key);
    if (!g) { const kit = l.kit_id ? store.K(l.kit_id) : null; g = { key, kit, title: kit ? store.M(kit.model_id)?.name : key.slice(4), lines: [] }; groups.push(g); }
    g.lines.push(l);
  });
  groups.sort((a, b) => (+!a.kit - +!b.kit) || a.title.localeCompare(b.title));
  const idx = STAGES.findIndex(s => s.k === stage);

  return <>
    <Head title={p.name} back={['/prosjekter', 'Prosjekter']} sub={<>{p.customer}{p.asana ? ` · Asana ${p.asana}` : ''} · <span className="tnum">{fr(p.start_date, p.end_date)}</span></>} />
    <div className="card"><div className="progs"><Prog label="Satt fram" a={t.pick} b={t.qty} /><Prog label="Lastet" a={t.load} b={t.qty} /><Prog label="Returnert" a={t.ret} b={t.qty} /></div></div>
    <div className="seg" role="group" aria-label="Visning">{([['pakk', 'Pakkliste'], ['info', 'Info'], ['res', 'Ressurser']] as const).map(([k, l]) => <button key={k} aria-pressed={tab === k} onClick={() => setTab(k)}>{l}</button>)}</div>

    {tab === 'pakk' && <>
      <div className="stagebar">
        <div className="seg" role="group" aria-label="Steg">{STAGES.map(s => <button key={s.k} aria-pressed={stage === s.k} onClick={() => setStage(s.k)}>{s.label}</button>)}</div>
        <div className="row-actions"><button className="btn accent" style={{ flex: 1 }} onClick={() => setScanning(true)}><Icon.scan /> Skann til «{st.label.toLowerCase()}»</button>
          {store.internal && <button className="btn" onClick={() => setPicking(true)}><Icon.plus /> Legg til</button>}</div>
      </div>
      {groups.map(g => {
        const gd = g.lines.reduce((a, l) => a + Math.min(l.qty, l[col]), 0), gq = g.lines.reduce((a, l) => a + l.qty, 0);
        return <div className="group" key={g.key}>
          <div className="group-h"><h3>{g.kit && (g.kit.type === 'case' ? <Icon.case size={18} /> : <Icon.layers size={18} />)}{g.title}{g.kit && <> <Pill c="vio">{KTYPE[g.kit.type]}</Pill></>}</h3><span className="small muted tnum">{gd}/{gq}</span></div>
          <div className="list">{g.lines.map(l => {
            const m = store.M(l.model_id) || { name: '?', cat: '' }; const d = l[col]; const full = d >= l.qty;
            const prevCol = idx > 0 ? STAGES[idx - 1].col : null; const prev = prevCol ? l[prevCol] : null;
            const a = av.get(l.model_id)?.available; const short = stage === 'pick' && p.status !== 'Returnert' && a != null ? Math.max(0, l.qty - Math.max(0, a)) : 0;
            const sc = scanned(l).map(s => store.U(s.unit_id)).filter(Boolean);
            return <div key={l.id} className={'pl' + (full ? ' done' : '')}>
              <div className="qty tnum">{l.qty}×</div>
              <div className="main" onClick={() => store.internal && setLineEdit(l)} style={{ cursor: store.internal ? 'pointer' : undefined }}>
                <div className="t">{m.name}</div>
                <div className="s">{m.sub || m.cat}{m.loc ? ` · ${m.loc}` : ''}{prev != null && prev < l.qty && <span style={{ color: 'var(--warn)' }}> · {STAGES[idx - 1].label} {prev}/{l.qty}</span>}{short > 0 && <> <Pill c="bad">Mangler {short}</Pill></>}</div>
                {sc.length > 0 && <div className="unitchips">{sc.map(u => <span key={u.id}>#{u.no}</span>)}</div>}
              </div>
              {l.qty > 1 && <Stepper value={d} max={l.qty} onChange={n => setProgress(l, n)} label={`${d}/${l.qty}`} />}
              <button className={'check' + (full ? ' full' : d ? ' part' : '')} onClick={() => setProgress(l, full ? 0 : l.qty)} aria-label={`${st.verb}: ${m.name}`} aria-pressed={full}><Icon.check size={24} /></button>
            </div>;
          })}</div>
        </div>;
      })}
      {!lines.length && <div className="card"><Empty>Pakklista er tom. {store.internal ? 'Trykk «Legg til» for å legge inn utstyr eller pakker.' : ''}</Empty></div>}
    </>}

    {tab === 'info' && <InfoTab p={p} onEdit={() => setEditing(true)} />}
    {tab === 'res' && <ResTab p={p} />}

    {scanning && <Scanner title={'Skann: ' + st.label} hint="Hold koden foran kameraet. Lista oppdateres fortløpende." continuous onClose={() => setScanning(false)} onCode={onScan} />}
    {picking && <Picker title="Legg til i pakkliste" start={p.start_date} end={p.end_date} exProject={p.id} onClose={() => setPicking(false)} onPick={async (sel, kit) => {
      if (kit) await addKit(kit); if (sel.length) await addLines(sel.map(([model_id, qty]) => ({ model_id, qty })));
      setPicking(false); toast(kit ? `${store.M(kit.model_id).name} er lagt til` : `${sel.length} linjer lagt til`);
    }} />}
    {editing && <ProjectSheet project={p} onClose={() => setEditing(false)} />}
    {lineEdit && <LineSheet line={lineEdit} onClose={() => setLineEdit(null)} />}
  </>;
}

function LineSheet({ line, onClose }: { line: any; onClose: () => void }) {
  const store = useStore(); const toast = useToast(); const [qty, setQty] = useState(line.qty);
  return <Sheet title={store.M(line.model_id)?.name || 'Linje'} onClose={onClose}>
    <div className="form">
      <div className="field"><label>Antall</label><Stepper value={qty} min={1} onChange={setQty} /></div>
      <button className="btn primary block" onClick={async () => { const { error } = await sb().from('project_lines').update({ qty, done_pick: Math.min(qty, line.done_pick), done_load: Math.min(qty, line.done_load), done_ret: Math.min(qty, line.done_ret) }).eq('id', line.id); if (error) return toast(error.message, 'bad'); await store.refresh('project_lines'); onClose(); }}>Lagre</button>
      <button className="btn ghost danger" onClick={async () => { const { error } = await sb().from('project_lines').delete().eq('id', line.id); if (error) return toast(error.message, 'bad'); await store.refresh('project_lines'); toast('Linjen er fjernet'); onClose(); }}><Icon.trash /> Fjern fra pakklista</button>
    </div>
  </Sheet>;
}

function InfoTab({ p, onEdit }: { p: any; onEdit: () => void }) {
  const store = useStore(); const toast = useToast();
  const [invites, setInvites] = useState<any[]>([]); const [email, setEmail] = useState('');
  const load = useCallback(async () => { if (!store.internal) return; const { data } = await sb().from('project_invites').select('*').eq('project_id', p.id); setInvites(data || []); }, [p.id, store.internal]);
  useEffect(() => { load(); }, [load]);
  const crew = store.db.project_crew.filter(c => c.project_id === p.id).map(c => store.db.profiles.find(u => u.id === c.user_id)).filter(Boolean);
  return <>
    <div className="card"><dl className="kv"><dt>Kunde</dt><dd>{p.customer}</dd><dt>Asana</dt><dd>{p.asana || '–'}</dd><dt>Periode</dt><dd className="tnum">{fr(p.start_date, p.end_date)} ({daysBetween(p.start_date, p.end_date) + 1} dager)</dd>
      <dt>Sted</dt><dd>{p.venue || '–'}</dd><dt>Kontakt</dt><dd>{p.contact || '–'}</dd><dt>Status</dt><dd><Pill c={PSTATUS[p.status]}>{p.status}</Pill></dd></dl>
      {store.internal && <button className="btn" onClick={onEdit}>Rediger prosjekt</button>}</div>
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
  return <div className="card"><h3>Kjøretøy og ressurser</h3><div className="list">
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
