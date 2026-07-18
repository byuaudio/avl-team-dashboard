-- AVL Team Dashboard — initial schema
-- Run this in the Supabase SQL editor (or via `supabase db push`).
--
-- Security model summary (see ARCHITECTURE.md):
--   * Every table has row-level security (RLS) enabled.
--   * Clients NEVER write training_progress directly — all writes go through
--     the RPC functions at the bottom of this file, which enforce the
--     pass-off rules no matter what the UI does.
--   * Roles: student < student_trainer < manager (stored on profiles.role).

-- ---------------------------------------------------------------------------
-- Types
-- ---------------------------------------------------------------------------

create type employee_role as enum ('student', 'student_trainer', 'manager');

create type training_status as enum ('not_started', 'passoff_requested', 'passed_off');

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

-- One row per employee, linked 1:1 to a Supabase auth user.
create table profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  full_name  text not null,
  role       employee_role not null default 'student',
  is_active  boolean not null default true,
  created_at timestamptz not null default now()
);

-- Training sheet template structure (one shared template for the whole team).
create table training_sections (
  id         uuid primary key default gen_random_uuid(),
  title      text not null,
  sort_order integer not null default 0
);

create table training_items (
  id          uuid primary key default gen_random_uuid(),
  section_id  uuid not null references training_sections (id) on delete cascade,
  title       text not null,
  description text not null default '',
  sort_order  integer not null default 0
);

-- Per-employee progress on each training item. A missing row means
-- 'not_started'; rows are created lazily by the RPC functions below.
create table training_progress (
  id            uuid primary key default gen_random_uuid(),
  employee_id   uuid not null references profiles (id) on delete cascade,
  item_id       uuid not null references training_items (id) on delete cascade,
  status        training_status not null default 'not_started',
  requested_at  timestamptz,
  passed_off_by uuid references profiles (id),
  passed_off_at timestamptz,
  notes         text not null default '',
  unique (employee_id, item_id)
);

-- Dashboard announcements, written by managers.
create table announcements (
  id         uuid primary key default gen_random_uuid(),
  title      text not null,
  body       text not null default '',
  created_by uuid references profiles (id),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Role helper (security definer so it can read profiles without RLS recursion)
-- ---------------------------------------------------------------------------

create function current_employee_role()
returns employee_role
language sql stable security definer
set search_path = public
as $$
  select role from profiles where id = auth.uid() and is_active
$$;

create function is_trainer_or_manager()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select coalesce(current_employee_role() in ('student_trainer', 'manager'), false)
$$;

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------

alter table profiles          enable row level security;
alter table training_sections enable row level security;
alter table training_items    enable row level security;
alter table training_progress enable row level security;
alter table announcements     enable row level security;

-- Profiles: whole team roster is visible to any signed-in employee.
-- Only managers can edit (role changes, deactivation, name fixes).
-- Rows are created automatically by the on_auth_user_created trigger.
create policy "profiles are readable by the team"
  on profiles for select using (auth.uid() is not null);

create policy "managers manage profiles"
  on profiles for update
  using (current_employee_role() = 'manager')
  with check (current_employee_role() = 'manager');

-- Template structure: readable by the team, editable by managers.
create policy "sections readable by the team"
  on training_sections for select using (auth.uid() is not null);
create policy "managers manage sections"
  on training_sections for all
  using (current_employee_role() = 'manager')
  with check (current_employee_role() = 'manager');

create policy "items readable by the team"
  on training_items for select using (auth.uid() is not null);
create policy "managers manage items"
  on training_items for all
  using (current_employee_role() = 'manager')
  with check (current_employee_role() = 'manager');

-- Progress: students see their own sheet; trainers and managers see everyone.
-- NO insert/update/delete policies — writes only happen through the RPC
-- functions below, which run as security definer.
create policy "students see own progress, trainers see all"
  on training_progress for select
  using (employee_id = auth.uid() or is_trainer_or_manager());

-- Announcements: readable by the team, managed by managers.
create policy "announcements readable by the team"
  on announcements for select using (auth.uid() is not null);
create policy "managers manage announcements"
  on announcements for all
  using (current_employee_role() = 'manager')
  with check (current_employee_role() = 'manager');

-- ---------------------------------------------------------------------------
-- Auto-create a profile when a new auth user is created
-- ---------------------------------------------------------------------------

create function handle_new_user()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  insert into profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', new.email));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ---------------------------------------------------------------------------
-- Pass-off RPC functions — the business rules live HERE.
--
--   request_passoff : any active employee, own sheet only
--   cancel_passoff_request : own sheet, only while still requested
--   grant_passoff   : trainers/managers only, NEVER on their own sheet
--   reset_passoff   : managers only (corrections)
-- ---------------------------------------------------------------------------

create function request_passoff(p_item_id uuid)
returns void
language plpgsql security definer
set search_path = public
as $$
begin
  if current_employee_role() is null then
    raise exception 'You must be an active employee to request a pass-off.';
  end if;

  insert into training_progress (employee_id, item_id, status, requested_at)
  values (auth.uid(), p_item_id, 'passoff_requested', now())
  on conflict (employee_id, item_id) do update
    set status = 'passoff_requested', requested_at = now()
    where training_progress.status = 'not_started';

  if exists (
    select 1 from training_progress
    where employee_id = auth.uid() and item_id = p_item_id and status = 'passed_off'
  ) then
    raise exception 'This item is already passed off.';
  end if;
end;
$$;

create function cancel_passoff_request(p_item_id uuid)
returns void
language plpgsql security definer
set search_path = public
as $$
begin
  update training_progress
  set status = 'not_started', requested_at = null
  where employee_id = auth.uid()
    and item_id = p_item_id
    and status = 'passoff_requested';
end;
$$;

create function grant_passoff(p_employee_id uuid, p_item_id uuid, p_notes text default null)
returns void
language plpgsql security definer
set search_path = public
as $$
begin
  if not is_trainer_or_manager() then
    raise exception 'Only student trainers and managers can grant pass-offs.';
  end if;

  if p_employee_id = auth.uid() then
    raise exception 'You cannot grant a pass-off on your own training sheet.';
  end if;

  insert into training_progress (employee_id, item_id, status, passed_off_by, passed_off_at, notes)
  values (p_employee_id, p_item_id, 'passed_off', auth.uid(), now(), coalesce(p_notes, ''))
  on conflict (employee_id, item_id) do update
    set status        = 'passed_off',
        passed_off_by = auth.uid(),
        passed_off_at = now(),
        notes         = coalesce(p_notes, training_progress.notes);
end;
$$;

create function reset_passoff(p_employee_id uuid, p_item_id uuid)
returns void
language plpgsql security definer
set search_path = public
as $$
begin
  if current_employee_role() <> 'manager' then
    raise exception 'Only managers can reset a pass-off.';
  end if;

  update training_progress
  set status = 'not_started', requested_at = null,
      passed_off_by = null, passed_off_at = null
  where employee_id = p_employee_id and item_id = p_item_id;
end;
$$;

-- Lock the RPC surface down to signed-in users only. The blanket revoke
-- removes the default PUBLIC grant, so everything callable must be granted
-- back explicitly below.
revoke execute on all functions in schema public from anon, public;

-- RLS policies evaluate the helper functions as the querying user, so
-- authenticated needs execute on them.
grant execute on function current_employee_role(),
                          is_trainer_or_manager(),
                          request_passoff(uuid),
                          cancel_passoff_request(uuid),
                          grant_passoff(uuid, uuid, text),
                          reset_passoff(uuid, uuid)
  to authenticated;

-- The signup trigger runs as Supabase's internal auth role.
grant execute on function handle_new_user() to supabase_auth_admin;
