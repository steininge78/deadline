-- Deadline Lager – databaseskjema
-- Kjør hele filen i Supabase → SQL Editor (eller med `supabase db push`).


-- ============ Brukere og roller ============
-- Roller: admin, lager, prosjektleder (interne @deadline.no), ekstern (invitert), ingen (ikke godkjent)
create table if not exists profiles (
  id uuid primary key references auth.users on delete cascade,
  email text not null,
  name text,
  role text not null default 'ingen' check (role in ('admin','lager','prosjektleder','ekstern','ingen')),
  created_at timestamptz default now()
);

create table if not exists settings (
  key text primary key,
  value jsonb not null
);
-- Første admin. Endre e-post her om nødvendig før du kjører.
insert into settings(key, value) values ('first_admin', '"stein.inge@deadline.no"'), ('internal_domain', '"deadline.no"')
on conflict (key) do nothing;

create or replace function my_role() returns text
language sql stable security definer set search_path = public as $$
  select coalesce((select role from profiles where id = auth.uid()), 'ingen')
$$;
create or replace function is_internal() returns boolean
language sql stable security definer set search_path = public as $$
  select my_role() in ('admin','lager','prosjektleder')
$$;
create or replace function is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select my_role() = 'admin'
$$;

-- ============ Lager ============
create table if not exists models (
  id uuid primary key default gen_random_uuid(),
  code text unique,                 -- Utstyrskode (Rentman)
  rentman_id integer,
  name text not null,
  cat text not null default 'Uten kategori',
  sub text,
  price numeric,                    -- dagpris eks. mva, null = uten pris
  price_status text,
  price_basis text,
  control_note text,
  loc text,                         -- lagerplass
  description text,
  notes text,
  inspect_interval integer not null default 0,   -- dager, 0 = ingen
  track text not null default 'unit' check (track in ('unit','qty')),
  stock integer not null default 0, -- brukes når track = 'qty'
  qr text unique,                   -- felles kode når track = 'qty'
  web boolean not null default false,
  web_description text,
  photos text[] not null default '{}',  -- stier i storage-bucket 'photos'
  is_kit boolean not null default false,
  active boolean not null default true,
  created_at timestamptz default now()
);
create index if not exists models_cat on models(cat, sub);

create table if not exists units (
  id uuid primary key default gen_random_uuid(),
  model_id uuid not null references models on delete cascade,
  no integer not null,
  serial text,
  qr text unique,
  status text not null default 'ok' check (status in ('ok','service','utrangert')),
  last_inspection date,
  inspect_interval integer,         -- overstyrer modellens intervall
  created_at timestamptz default now(),
  unique (model_id, no)
);

create table if not exists kits (
  id uuid primary key default gen_random_uuid(),
  model_id uuid not null unique references models on delete cascade,
  type text not null check (type in ('case','pakke')),  -- case = fysisk pakke, pakke = virtuell pakke
  inferred boolean not null default false
);
create table if not exists kit_items (
  kit_id uuid references kits on delete cascade,
  model_id uuid references models on delete cascade,
  qty integer not null default 1,
  primary key (kit_id, model_id)
);

create table if not exists consumables (
  id uuid primary key default gen_random_uuid(),
  code text unique,
  name text not null,
  unit text not null default 'stk',
  stock integer not null default 0,
  min integer not null default 0,
  price numeric,
  created_at timestamptz default now()
);

create table if not exists resources (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  sub text,                         -- reg.nr / detaljer
  type text not null default 'Kjøretøy',
  price numeric,
  active boolean not null default true,
  created_at timestamptz default now()
);

-- ============ Prosjekter ============
create table if not exists projects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  customer text,
  asana text,
  start_date date not null,
  end_date date not null,
  status text not null default 'Planlagt' check (status in ('Planlagt','Bekreftet','Pågår','Returnert','Avlyst')),
  venue text,
  contact text,
  created_by uuid references profiles,
  created_at timestamptz default now(),
  check (end_date >= start_date)
);
create table if not exists project_resources (
  project_id uuid references projects on delete cascade,
  resource_id uuid references resources on delete cascade,
  primary key (project_id, resource_id)
);
create table if not exists project_crew (
  project_id uuid references projects on delete cascade,
  user_id uuid references profiles on delete cascade,
  primary key (project_id, user_id)
);
create table if not exists project_invites (
  project_id uuid references projects on delete cascade,
  email text not null,
  created_at timestamptz default now(),
  primary key (project_id, email)
);
create table if not exists project_lines (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects on delete cascade,
  model_id uuid not null references models,
  qty integer not null check (qty > 0),
  kit_id uuid references kits on delete set null,
  sort integer not null default 0,
  done_pick integer not null default 0,
  done_load integer not null default 0,
  done_ret integer not null default 0,
  created_at timestamptz default now()
);
create index if not exists project_lines_p on project_lines(project_id);
create table if not exists scans (
  id bigint generated always as identity primary key,
  line_id uuid not null references project_lines on delete cascade,
  unit_id uuid references units on delete cascade,
  stage text not null check (stage in ('pick','load','ret')),
  user_id uuid references profiles,
  created_at timestamptz default now(),
  unique (line_id, unit_id, stage)
);

-- ============ Forespørsler og tilbud ============
create table if not exists requests (
  id uuid primary key default gen_random_uuid(),
  source text not null default 'Intern',  -- Intern / Nettside
  title text not null,
  customer text,
  contact text,
  email text,
  phone text,
  start_date date not null,
  end_date date not null,
  status text not null default 'Ny' check (status in ('Ny','Reservert','Tilbud sendt','Akseptert','Avslått')),
  hold_until timestamptz,             -- nettreservasjoner holdes av til dette tidspunktet
  note text,
  discount numeric not null default 0,
  project_id uuid references projects on delete set null,
  created_at timestamptz default now(),
  check (end_date >= start_date)
);
create table if not exists request_lines (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references requests on delete cascade,
  model_id uuid not null references models,
  qty integer not null check (qty > 0)
);
create table if not exists request_resources (
  request_id uuid references requests on delete cascade,
  resource_id uuid references resources on delete cascade,
  primary key (request_id, resource_id)
);

-- ============ Vedlikehold ============
create table if not exists tickets (
  id uuid primary key default gen_random_uuid(),
  unit_id uuid not null references units on delete cascade,
  issue text not null,
  status text not null default 'Åpen' check (status in ('Åpen','Sendt til reparasjon','Ferdig')),
  created_by uuid references profiles,
  created_at timestamptz default now()
);
create table if not exists inspections (
  id bigint generated always as identity primary key,
  unit_id uuid not null references units on delete cascade,
  date date not null default current_date,
  note text,
  user_id uuid references profiles
);

-- ============ Ny bruker → profil og rolle ============
create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  r text := 'ingen';
  em text := lower(new.email);
  dom text := (select value #>> '{}' from settings where key = 'internal_domain');
  adm text := (select value #>> '{}' from settings where key = 'first_admin');
begin
  if em = lower(adm) then r := 'admin';
  elsif em like '%@' || dom then r := 'prosjektleder';
  elsif exists (select 1 from project_invites where lower(email) = em) then r := 'ekstern';
  end if;
  insert into profiles(id, email, name, role)
  values (new.id, em, coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', split_part(em,'@',1)), r)
  on conflict (id) do nothing;
  insert into project_crew(project_id, user_id)
    select project_id, new.id from project_invites where lower(email) = em
  on conflict do nothing;
  delete from project_invites where lower(email) = em;
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function handle_new_user();

-- Inviter ekstern til et prosjekt (internt)
create or replace function invite_external(p_project uuid, p_email text) returns text
language plpgsql security definer set search_path = public as $$
declare uid uuid;
begin
  if not is_internal() then raise exception 'Ingen tilgang'; end if;
  select id into uid from profiles where lower(email) = lower(p_email);
  if uid is not null then
    update profiles set role = 'ekstern' where id = uid and role = 'ingen';
    insert into project_crew values (p_project, uid) on conflict do nothing;
    return 'lagt_til';
  end if;
  insert into project_invites(project_id, email) values (p_project, lower(p_email)) on conflict do nothing;
  return 'invitert';
end $$;

-- ============ Tilgjengelighet ============
-- Brukbare enheter minus alt som er booket i overlappende prosjekter og aktive reservasjoner/tilbud.
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
     where p.status not in ('Avlyst','Returnert')
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

create or replace function availability_days(p_model uuid, p_from date, p_to date)
returns table(day date, available integer, usable integer)
language sql stable security definer set search_path = public as $$
  select d::date, a.available, a.usable
    from generate_series(p_from, p_to, interval '1 day') d
    cross join lateral (select * from availability(d::date, d::date) x where x.model_id = p_model) a
$$;

-- ============ Fremdrift i pakkliste (også for eksterne) ============
create or replace function can_see_project(p uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select is_internal() or exists (select 1 from project_crew c where c.project_id = p and c.user_id = auth.uid())
$$;

create or replace function set_progress(p_line uuid, p_stage text, p_n integer, p_unit uuid default null)
returns project_lines
language plpgsql security definer set search_path = public as $$
declare l project_lines; n integer;
begin
  select * into l from project_lines where id = p_line;
  if l.id is null or not can_see_project(l.project_id) then raise exception 'Ingen tilgang'; end if;
  n := greatest(0, least(l.qty, p_n));
  if p_unit is not null then
    insert into scans(line_id, unit_id, stage, user_id) values (p_line, p_unit, p_stage, auth.uid()) on conflict do nothing;
  end if;
  if p_stage = 'pick' then update project_lines set done_pick = n where id = p_line returning * into l;
  elsif p_stage = 'load' then update project_lines set done_load = n where id = p_line returning * into l;
  elsif p_stage = 'ret' then update project_lines set done_ret = n where id = p_line returning * into l;
  else raise exception 'Ukjent steg'; end if;
  -- fjern skann over nytt antall
  delete from scans s where s.line_id = p_line and s.stage = p_stage and s.id in (
    select id from scans where line_id = p_line and stage = p_stage order by id desc offset n);
  return l;
end $$;

-- ============ Radnivå-sikkerhet ============
do $$ declare t text; begin
  foreach t in array array['profiles','settings','models','units','kits','kit_items','consumables','resources','projects','project_resources','project_crew','project_invites','project_lines','scans','requests','request_lines','request_resources','tickets','inspections']
  loop execute format('alter table %I enable row level security', t); end loop;
end $$;

-- Interne har full tilgang til alt (unntatt roller, som bare admin endrer)
do $$ declare t text; begin
  foreach t in array array['models','units','kits','kit_items','consumables','resources','projects','project_resources','project_crew','project_invites','project_lines','scans','requests','request_lines','request_resources','tickets','inspections']
  loop
    execute format('drop policy if exists internal_all on %I', t);
    execute format('create policy internal_all on %I for all using (is_internal()) with check (is_internal())', t);
  end loop;
end $$;

drop policy if exists settings_read on settings;
create policy settings_read on settings for select using (is_internal());
drop policy if exists settings_admin on settings;
create policy settings_admin on settings for all using (is_admin()) with check (is_admin());

drop policy if exists profiles_read on profiles;
create policy profiles_read on profiles for select using (id = auth.uid() or is_internal());
drop policy if exists profiles_admin on profiles;
create policy profiles_admin on profiles for update using (is_admin()) with check (is_admin());
drop policy if exists profiles_self on profiles;
create policy profiles_self on profiles for update using (id = auth.uid()) with check (id = auth.uid() and role = my_role());

-- Eksterne: lesetilgang til egne prosjekter og utstyrsnavn
drop policy if exists ext_projects on projects;
create policy ext_projects on projects for select using (can_see_project(id));
drop policy if exists ext_lines on project_lines;
create policy ext_lines on project_lines for select using (can_see_project(project_id));
drop policy if exists ext_scans on scans;
create policy ext_scans on scans for select using (exists (select 1 from project_lines l where l.id = line_id and can_see_project(l.project_id)));
drop policy if exists ext_models on models;
create policy ext_models on models for select using (my_role() = 'ekstern');
drop policy if exists ext_units on units;
create policy ext_units on units for select using (my_role() = 'ekstern');
drop policy if exists ext_kits on kits;
create policy ext_kits on kits for select using (my_role() = 'ekstern');
drop policy if exists ext_crew on project_crew;
create policy ext_crew on project_crew for select using (user_id = auth.uid());

-- ============ Bilder ============
insert into storage.buckets (id, name, public) values ('photos', 'photos', true) on conflict (id) do nothing;
drop policy if exists photos_read on storage.objects;
create policy photos_read on storage.objects for select using (bucket_id = 'photos');
drop policy if exists photos_write on storage.objects;
create policy photos_write on storage.objects for insert with check (bucket_id = 'photos' and is_internal());
drop policy if exists photos_delete on storage.objects;
create policy photos_delete on storage.objects for delete using (bucket_id = 'photos' and is_internal());

-- ============ Sanntid for pakklister ============
do $$ begin
  begin alter publication supabase_realtime add table project_lines; exception when others then null; end;
  begin alter publication supabase_realtime add table scans; exception when others then null; end;
end $$;
