'use client';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { sb } from './supabase';

// Laster hele datasettet én gang (noen tusen rader) og holder det i minnet.
// Endringer skrives rett til Supabase og lastes inn på nytt for berørte tabeller.
const TABLES = ['models', 'units', 'kits', 'kit_items', 'resources', 'projects', 'project_lines', 'project_resources', 'project_crew', 'requests', 'request_lines', 'request_resources', 'tickets', 'consumables', 'profiles'] as const;
export type Table = typeof TABLES[number];
export type DB = Record<Table, any[]>;

async function fetchAll(table: string) {
  const out: any[] = []; const size = 1000;
  for (let from = 0; ; from += size) {
    const { data, error } = await sb().from(table).select('*').range(from, from + size - 1);
    if (error) throw error;
    out.push(...data);
    if (data.length < size) break;
  }
  return out;
}

type Ctx = {
  db: DB; me: any; loading: boolean; error: string | null; version: number;
  refresh: (...t: Table[]) => Promise<void>;
  mutate: (t: Table, fn: (rows: any[]) => any[]) => void;
  M: (id: string) => any; U: (id: string) => any; K: (id: string) => any; P: (id: string) => any; R: (id: string) => any; kitOfModel: (mid: string) => any;
  unitsOf: (mid: string) => any[]; kitItems: (kid: string) => any[];
  internal: boolean; admin: boolean;
};
const C = createContext<Ctx>(null as any);
export const useStore = () => useContext(C);

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [db, setDb] = useState<DB>(() => Object.fromEntries(TABLES.map(t => [t, []])) as DB);
  const [me, setMe] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const dbRef = useRef(db); dbRef.current = db;

  const refresh = useCallback(async (...tables: Table[]) => {
    const list = tables.length ? tables : [...TABLES];
    try {
      const res = await Promise.all(list.map(t => fetchAll(t)));
      setDb(prev => { const n = { ...prev }; list.forEach((t, i) => { n[t] = res[i]; }); return n; });
      setVersion(v => v + 1);
    } catch (e: any) { setError(e.message || String(e)); }
  }, []);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await sb().auth.getUser();
      if (!user) { setLoading(false); return; }
      const { data: prof } = await sb().from('profiles').select('*').eq('id', user.id).single();
      setMe(prof || { id: user.id, email: user.email, role: 'ingen' });
      if (prof && prof.role !== 'ingen') await refresh();
      setLoading(false);
    })();
  }, [refresh]);

  // Sanntid: når noen haker av i en pakkliste, oppdateres den for alle
  useEffect(() => {
    if (!me || me.role === 'ingen') return;
    let t: any;
    const ch = sb().channel('lines').on('postgres_changes', { event: '*', schema: 'public', table: 'project_lines' }, () => {
      clearTimeout(t); t = setTimeout(() => refresh('project_lines'), 300);
    }).subscribe();
    return () => { sb().removeChannel(ch); };
  }, [me, refresh]);

  const idx = useMemo(() => {
    const by = (t: Table) => new Map(db[t].map((r: any) => [r.id, r]));
    const unitsBy = new Map<string, any[]>();
    db.units.forEach(u => { if (!unitsBy.has(u.model_id)) unitsBy.set(u.model_id, []); unitsBy.get(u.model_id)!.push(u); });
    unitsBy.forEach(l => l.sort((a, b) => a.no - b.no));
    const kitByModel = new Map(db.kits.map(k => [k.model_id, k]));
    return { m: by('models'), u: by('units'), k: by('kits'), p: by('projects'), r: by('resources'), unitsBy, kitByModel };
  }, [db]);

  const value: Ctx = {
    db, me, loading, error, version, refresh,
    mutate: (t, fn) => setDb(prev => ({ ...prev, [t]: fn(prev[t]) })),
    M: id => idx.m.get(id), U: id => idx.u.get(id), K: id => idx.k.get(id), P: id => idx.p.get(id), R: id => idx.r.get(id),
    kitOfModel: mid => idx.kitByModel.get(mid),
    unitsOf: mid => idx.unitsBy.get(mid) || [],
    kitItems: kid => db.kit_items.filter(i => i.kit_id === kid),
    internal: ['admin', 'lager', 'prosjektleder'].includes(me?.role), admin: me?.role === 'admin'
  };
  return <C.Provider value={value}>{children}</C.Provider>;
}

// Ledighet fra databasen (samme beregning som nettsiden bruker)
export function useAvailability(start: string, end: string, exProject?: string | null, exRequest?: string | null) {
  const { version } = useStore();
  const [map, setMap] = useState<Map<string, { usable: number; available: number }>>(new Map());
  useEffect(() => {
    if (!start || !end) return;
    let alive = true;
    sb().rpc('availability', { p_start: start, p_end: end, p_ex_project: exProject || null, p_ex_request: exRequest || null }).then(({ data }) => {
      if (alive && data) setMap(new Map(data.map((r: any) => [r.model_id, { usable: r.usable, available: r.available }])));
    });
    return () => { alive = false; };
  }, [start, end, exProject, exRequest, version]);
  return map;
}

export const unitLabel = (store: Ctx, u: any) => `${store.M(u.model_id)?.name || '?'} #${u.no}`;
export const intervalOf = (store: Ctx, u: any) => u.inspect_interval ?? store.M(u.model_id)?.inspect_interval ?? 0;
export const kitQR = (store: Ctx, k: any) => (store.unitsOf(k.model_id).find(u => u.qr) || {}).qr || null;

export function lookupCode(store: Ctx, raw: string) {
  const code = raw.trim().toUpperCase();
  const u = store.db.units.find(x => (x.qr || '').toUpperCase() === code);
  if (u) { const k = store.kitOfModel(u.model_id); return k ? { type: 'kit' as const, kit: k, unit: u } : { type: 'unit' as const, unit: u }; }
  const m = store.db.models.find(x => (x.qr || '').toUpperCase() === code);
  if (m) return { type: 'model' as const, model: m };
  return { type: 'none' as const, code };
}

export function resBusy(store: Ctx, rid: string, start: string, end: string, ex: { project?: string; request?: string } = {}) {
  const { db } = store;
  const ps = db.project_resources.filter(x => x.resource_id === rid).map(x => store.P(x.project_id)).filter(p => p && p.id !== ex.project && p.status !== 'Avlyst' && p.status !== 'Returnert' && p.start_date <= end && p.end_date >= start);
  const rs = db.request_resources.filter(x => x.resource_id === rid).map(x => db.requests.find(r => r.id === x.request_id)).filter(r => r && r.id !== ex.request && ['Reservert', 'Tilbud sendt'].includes(r.status) && r.start_date <= end && r.end_date >= start);
  return [...ps.map(p => ({ name: p.name })), ...rs.map(r => ({ name: r.title }))];
}
