-- Dayflow: personal planner schema.
-- All objects are prefixed with df_ so they coexist with other apps in this project.
-- Access model: closed app. Only users listed in df_members can read/write, and only their own rows.

-- ---------- helpers ----------
create or replace function public.df_set_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- ---------- members (allowlist of who may use Dayflow) ----------
create table if not exists public.df_members (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  username   text not null unique check (char_length(btrim(username)) between 1 and 40),
  created_at timestamptz not null default now()
);

create or replace function public.df_is_member()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.df_members m where m.user_id = auth.uid());
$$;

-- ---------- profiles ----------
create table if not exists public.df_profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  display_name text check (display_name is null or char_length(display_name) <= 60),
  theme        text not null default 'system' check (theme in ('system','light','dark')),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- ---------- categories ----------
create table if not exists public.df_categories (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name       text not null check (char_length(btrim(name)) between 1 and 40),
  color      text not null check (color in ('slate','blue','indigo','violet','rose','orange','amber','green','teal')),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, name),
  unique (id, user_id)
);
create index if not exists df_categories_user_idx on public.df_categories (user_id, sort_order);

-- ---------- activities ----------
create table if not exists public.df_activities (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null default auth.uid() references auth.users(id) on delete cascade,
  category_id     uuid,
  title           text not null check (char_length(btrim(title)) between 1 and 200),
  description     text check (description is null or char_length(description) <= 4000),
  start_date      date not null,
  end_date        date,
  period          text check (period in ('morning','late_morning','noon','afternoon','evening','night')),
  all_day         boolean not null default false,
  start_time      time,
  end_time        time,
  color           text check (color is null or color in ('slate','blue','indigo','violet','rose','orange','amber','green','teal')),
  location        text check (location is null or char_length(location) <= 200),
  priority        smallint check (priority between 1 and 3),
  completed       boolean not null default false,
  completed_at    timestamptz,
  repeat_freq     text check (repeat_freq in ('daily','weekly','monthly','yearly')),
  repeat_interval smallint not null default 1 check (repeat_interval between 1 and 365),
  repeat_weekdays smallint[] check (repeat_weekdays is null or repeat_weekdays <@ array[0,1,2,3,4,5,6]::smallint[]),
  repeat_until    date,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (id, user_id),
  constraint df_activities_category_fk foreign key (category_id, user_id)
    references public.df_categories (id, user_id) on delete set null (category_id),
  constraint df_activities_end_date_chk check (end_date is null or end_date >= start_date),
  constraint df_activities_end_time_chk check (end_time is null or start_time is not null),
  constraint df_activities_slot_chk check (all_day or period is not null),
  constraint df_activities_until_chk check (repeat_until is null or repeat_until >= start_date),
  constraint df_activities_repeat_single_day_chk check (repeat_freq is null or end_date is null or end_date = start_date)
);
create index if not exists df_activities_user_start_idx on public.df_activities (user_id, start_date);
create index if not exists df_activities_user_repeat_idx on public.df_activities (user_id) where repeat_freq is not null;
create index if not exists df_activities_category_idx on public.df_activities (category_id);

-- Per-occurrence state for recurring activities (done / removed on one date).
create table if not exists public.df_occurrence_overrides (
  activity_id     uuid not null,
  user_id         uuid not null default auth.uid() references auth.users(id) on delete cascade,
  occurrence_date date not null,
  completed       boolean not null default false,
  cancelled       boolean not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  primary key (activity_id, occurrence_date),
  constraint df_overrides_activity_fk foreign key (activity_id, user_id)
    references public.df_activities (id, user_id) on delete cascade
);
create index if not exists df_overrides_user_idx on public.df_occurrence_overrides (user_id);

-- ---------- tasks ----------
create table if not exists public.df_tasks (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null default auth.uid() references auth.users(id) on delete cascade,
  category_id    uuid,
  title          text not null check (char_length(btrim(title)) between 1 and 200),
  description    text check (description is null or char_length(description) <= 4000),
  due_date       date,
  scheduled_date date,
  period         text check (period in ('morning','late_morning','noon','afternoon','evening','night')),
  priority       smallint check (priority between 1 and 3),
  completed      boolean not null default false,
  completed_at   timestamptz,
  sort_order     integer not null default 0,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint df_tasks_category_fk foreign key (category_id, user_id)
    references public.df_categories (id, user_id) on delete set null (category_id),
  constraint df_tasks_period_chk check (period is null or scheduled_date is not null)
);
create index if not exists df_tasks_user_open_idx on public.df_tasks (user_id, completed, due_date);
create index if not exists df_tasks_user_scheduled_idx on public.df_tasks (user_id, scheduled_date) where scheduled_date is not null;
create index if not exists df_tasks_category_idx on public.df_tasks (category_id);

-- ---------- updated_at triggers ----------
do $$
declare t text;
begin
  foreach t in array array['df_profiles','df_categories','df_activities','df_occurrence_overrides','df_tasks'] loop
    execute format('create trigger %I before update on public.%I for each row execute function public.df_set_updated_at()', t || '_updated_at', t);
  end loop;
end $$;

-- ---------- RLS ----------
alter table public.df_members              enable row level security;
alter table public.df_profiles             enable row level security;
alter table public.df_categories           enable row level security;
alter table public.df_activities           enable row level security;
alter table public.df_occurrence_overrides enable row level security;
alter table public.df_tasks                enable row level security;

create policy df_members_self on public.df_members for select to authenticated
  using (user_id = (select auth.uid()));

create policy df_profiles_own on public.df_profiles for all to authenticated
  using (id = (select auth.uid()) and (select public.df_is_member()))
  with check (id = (select auth.uid()) and (select public.df_is_member()));

do $$
declare t text;
begin
  foreach t in array array['df_categories','df_activities','df_occurrence_overrides','df_tasks'] loop
    execute format($p$create policy %I on public.%I for all to authenticated
      using (user_id = (select auth.uid()) and (select public.df_is_member()))
      with check (user_id = (select auth.uid()) and (select public.df_is_member()))$p$, t || '_own', t);
  end loop;
end $$;

-- ---------- bootstrap: profile + default categories (idempotent) ----------
create or replace function public.df_bootstrap()
returns void language plpgsql security invoker set search_path = '' as $$
declare uid uuid := auth.uid();
begin
  if uid is null or not public.df_is_member() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  insert into public.df_profiles (id) values (uid) on conflict (id) do nothing;
  if not exists (select 1 from public.df_categories where user_id = uid) then
    insert into public.df_categories (user_id, name, color, sort_order) values
      (uid, 'עבודה',  'blue',   1),
      (uid, 'צבא',    'green',  2),
      (uid, 'כושר',   'orange', 3),
      (uid, 'חברים',  'violet', 4),
      (uid, 'משפחה',  'rose',   5),
      (uid, 'אישי',   'teal',   6),
      (uid, 'בילויים','amber',  7),
      (uid, 'אחר',    'slate',  8)
    on conflict (user_id, name) do nothing;
  end if;
end $$;
