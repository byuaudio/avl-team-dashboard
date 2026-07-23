-- Phase 2 (pay, part 3): per-semester records + team-wide comp settings, for
-- loyalty and soft-skills pay. See COMPENSATION.md.

create type semester_term as enum ('winter', 'summer', 'fall');

-- Team-wide, Audio-Manager-editable metrics (singleton row).
create table comp_settings (
  id                         boolean primary key default true,
  expected_maintenance_hours numeric not null default 0,
  expected_other_hours       numeric not null default 240,
  weight_maintenance         numeric not null default 0.60,
  weight_other               numeric not null default 0.40,
  loyalty_avg_value          numeric not null default 0.10,
  soft_benchmark             numeric not null default 280,
  soft_max                   numeric not null default 420,
  soft_bench_raise           numeric not null default 0.10,
  soft_additional_at_max     numeric not null default 0.20,
  prior_semester_value       numeric not null default 0.25,
  constraint comp_settings_singleton check (id)
);
insert into comp_settings default values;

-- Grandfathered credit for semesters worked before detailed tracking began.
alter table profiles add column prior_semesters int not null default 0;

-- One row per employee per semester they worked.
create table employee_semesters (
  id                uuid primary key default gen_random_uuid(),
  employee_id       uuid not null references profiles (id) on delete cascade,
  year              int not null,
  term              semester_term not null,
  maintenance_hours numeric not null default 0,
  other_hours       numeric not null default 0,
  self_eval_score   numeric,
  supervisor_score  numeric,
  unique (employee_id, year, term)
);
create index employee_semesters_emp_idx on employee_semesters (employee_id);

alter table comp_settings      enable row level security;
alter table employee_semesters enable row level security;

create policy "comp settings readable by the team"
  on comp_settings for select using (auth.uid() is not null);
create policy "audio manager edits comp settings"
  on comp_settings for update using (is_audio_manager()) with check (is_audio_manager());

-- Owner can read their own; pay-viewers (full-time+) read all and manage.
create policy "semesters readable by owner and pay-viewers"
  on employee_semesters for select
  using (employee_id = auth.uid() or current_rank() >= 80);
create policy "pay-viewers manage semesters"
  on employee_semesters for all
  using (current_rank() >= 80) with check (current_rank() >= 80);

create function set_prior_semesters(p_target uuid, p_count int)
returns void language plpgsql security definer set search_path = public
as $$
begin
  if not is_audio_manager() then
    raise exception 'Only the audio manager can set prior semesters.';
  end if;
  update profiles set prior_semesters = greatest(p_count, 0) where id = p_target;
end;
$$;

revoke execute on function set_prior_semesters(uuid, int) from anon, public;
grant execute on function set_prior_semesters(uuid, int) to authenticated;
