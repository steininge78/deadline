-- Deadline Lager – oppdatering 2
-- Pakkliste: uoppført utstyr, hentested, kjøretøy, stjerne. Filer og spesifikasjoner på produkter.
-- Mangler, kameraer, posisjon på ressurser, delbar pakkliste.
-- Kjør hele filen i Supabase → SQL Editor. Trygg å kjøre flere ganger.

-- ===== Pakkliste =====
alter table project_lines alter column model_id drop not null;
alter table project_lines add column if not exists custom_name text;      -- uoppført utstyr (fritekst)
alter table project_lines add column if not exists note text;
alter table project_lines add column if not exists pickup text;            -- hentested: Kontoret, Lageret, Tomta …
alter table project_lines add column if not exists vehicle_id uuid references resources on delete set null;
alter table project_lines add column if not exists starred boolean not null default false;
alter table project_lines add column if not exists external boolean not null default false; -- lånes/leies eksternt
do $$ begin
  alter table project_lines add constraint project_lines_item check (model_id is not null or coalesce(custom_name,'') <> '');
exception when duplicate_object then null; end $$;

alter table projects add column if not exists share_token text unique;    -- delbar lenke (lesetilgang)

-- Delt pakkliste uten innlogging (bare lesing, bare når lenken er aktiv)
create or replace function shared_packlist(p_token text)
returns jsonb language sql stable security definer set search_path = public as $$
  select case when p.id is null then null else jsonb_build_object(
    'project', jsonb_build_object('name', p.name, 'customer', p.customer, 'start_date', p.start_date, 'end_date', p.end_date, 'venue', p.venue, 'status', p.status),
    'lines', coalesce((select jsonb_agg(jsonb_build_object(
        'name', coalesce(m.name, l.custom_name), 'qty', l.qty, 'pickup', l.pickup, 'vehicle', r.name, 'starred', l.starred,
        'kit', km.name, 'loc', m.loc, 'note', l.note, 'external', l.external, 'custom', l.model_id is null,
        'done_pick', l.done_pick, 'done_load', l.done_load, 'done_ret', l.done_ret) order by l.starred desc, l.sort, l.created_at)
      from project_lines l
      left join models m on m.id = l.model_id
      left join resources r on r.id = l.vehicle_id
      left join kits k on k.id = l.kit_id left join models km on km.id = k.model_id
      where l.project_id = p.id), '[]'::jsonb)
  ) end
  from (select * from projects where share_token = p_token and p_token is not null and length(p_token) >= 16) p
$$;
grant execute on function shared_packlist(text) to anon, authenticated;

-- Ledighet: ignorer linjer uten artikkel (uoppført utstyr)
create or replace function availability(p_start date, p_end date, p_ex_project uuid default null, p_ex_request uuid default null)
returns table(model_id uuid, usable integer, booked integer, available integer)
language sql stable security definer set search_path = public as $$
  with u as (
    select m.id,
      (case when m.track = 'qty' then m.stock
            else (select count(*) from units x where x.model_id = m.id and x.status = 'ok') end)::int as usable
    from models m where m.active
  ), b as (
    select pl.model_id, sum(pl.qty)::int q
      from project_lines pl join projects p on p.id = pl.project_id
     where pl.model_id is not null and not pl.external
       and p.status not in ('Avlyst','Returnert')
       and p.start_date <= p_end and p.end_date >= p_start
       and (p_ex_project is null or p.id <> p_ex_project)
     group by pl.model_id
    union all
    select rl.model_id, sum(rl.qty)::int
      from request_lines rl join requests r on r.id = rl.request_id
     where (r.status = 'Tilbud sendt' or (r.status = 'Reservert' and (r.hold_until is null or r.hold_until > now())))
       and r.start_date <= p_end and r.end_date >= p_start
       and (p_ex_request is null or r.id <> p_ex_request)
     group by rl.model_id
  )
  select u.id, u.usable, coalesce(sum(b.q),0)::int, (u.usable - coalesce(sum(b.q),0))::int
    from u left join b on b.model_id = u.id
   group by u.id, u.usable
$$;

-- ===== Produkter: spesifikasjoner og filer =====
alter table models add column if not exists specs jsonb not null default '{}'::jsonb;
alter table models add column if not exists specs_source text;

create table if not exists model_files (
  id uuid primary key default gen_random_uuid(),
  model_id uuid not null references models on delete cascade,
  name text not null,
  kind text not null default 'Annet',   -- Manual, Driver, Fixture-fil, Kalibrering, Annet
  path text not null,
  size bigint,
  created_by uuid references profiles,
  created_at timestamptz default now()
);
alter table model_files enable row level security;
drop policy if exists internal_all on model_files;
create policy internal_all on model_files for all using (is_internal()) with check (is_internal());

insert into storage.buckets (id, name, public) values ('files', 'files', false) on conflict (id) do nothing;
drop policy if exists files_read on storage.objects;
create policy files_read on storage.objects for select using (bucket_id = 'files' and is_internal());
drop policy if exists files_write on storage.objects;
create policy files_write on storage.objects for insert with check (bucket_id = 'files' and is_internal());
drop policy if exists files_delete on storage.objects;
create policy files_delete on storage.objects for delete using (bucket_id = 'files' and is_internal());

-- ===== Mangler =====
create table if not exists shortages (
  id uuid primary key default gen_random_uuid(),
  comment text,
  url text,
  model_id uuid references models on delete set null,
  qty integer,
  status text not null default 'Åpen' check (status in ('Åpen','Bestilt','Løst')),
  created_by uuid references profiles,
  created_at timestamptz default now()
);
alter table shortages enable row level security;
drop policy if exists internal_all on shortages;
create policy internal_all on shortages for all using (is_internal()) with check (is_internal());

-- ===== Kameraer =====
create table if not exists cameras (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  url text not null,          -- bilde-/strømadresse eller nettside for kameraet
  kind text not null default 'bilde' check (kind in ('bilde','side','lenke')),
  sort integer not null default 0,
  created_at timestamptz default now()
);
alter table cameras enable row level security;
drop policy if exists internal_all on cameras;
create policy internal_all on cameras for all using (is_internal()) with check (is_internal());

-- ===== Posisjon på ressurser (AirTag o.l.) =====
alter table resources add column if not exists tracker text;         -- f.eks. «AirTag Lastebil»
alter table resources add column if not exists tracker_url text;     -- lenke til sporingstjeneste
alter table resources add column if not exists last_lat double precision;
alter table resources add column if not exists last_lng double precision;
alter table resources add column if not exists last_pos_at timestamptz;
alter table resources add column if not exists last_pos_by uuid references profiles;

do $$ begin
  begin alter publication supabase_realtime add table shortages; exception when others then null; end;
end $$;
