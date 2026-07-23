-- Phase 2 (pay, part 5): performance stars and audio-crew-policy penalties.
-- See COMPENSATION.md.

alter table comp_settings
  add column star_value          numeric not null default 0.10,
  add column penalty_per_offense numeric not null default 0.10;

create type star_status as enum ('nominated', 'awarded');

-- One row per star. 6 metrics, up to 5 AWARDED per metric (cap enforced in UI).
-- 3/4-time & full-time may NOMINATE; the Audio Manager awards (or approves).
create table performance_stars (
  id          uuid primary key default gen_random_uuid(),
  employee_id uuid not null references profiles (id) on delete cascade,
  metric      text not null,
  note        text not null default '',
  status      star_status not null default 'awarded',
  created_by  uuid references profiles (id),
  created_at  timestamptz not null default now()
);
create index performance_stars_emp_idx on performance_stars (employee_id);

-- Editable line items: offenses (penalize pay) and termination reasons (display).
create table policy_items (
  id         uuid primary key default gen_random_uuid(),
  kind       text not null, -- 'offense' | 'termination'
  label      text not null,
  sort_order int not null default 0
);

-- One row per applied penalty (an offense charged to an employee, with a note).
create table policy_penalties (
  id             uuid primary key default gen_random_uuid(),
  employee_id    uuid not null references profiles (id) on delete cascade,
  policy_item_id uuid references policy_items (id) on delete set null,
  note           text not null default '',
  created_by     uuid references profiles (id),
  created_at     timestamptz not null default now()
);
create index policy_penalties_emp_idx on policy_penalties (employee_id);

alter table performance_stars enable row level security;
alter table policy_items      enable row level security;
alter table policy_penalties  enable row level security;

-- Stars: owner + staff read; staff nominate, AM awards; AM (or the nominator)
-- deletes; AM updates (approve a nomination).
create policy "stars readable by owner and staff"
  on performance_stars for select using (employee_id = auth.uid() or current_rank() >= 60);
create policy "staff nominate, AM awards"
  on performance_stars for insert
  with check (created_by = auth.uid() and current_rank() >= 60
              and (status = 'nominated' or is_audio_manager()));
create policy "AM updates stars"
  on performance_stars for update using (is_audio_manager()) with check (is_audio_manager());
create policy "AM or nominator deletes stars"
  on performance_stars for delete
  using (is_audio_manager() or (created_by = auth.uid() and status = 'nominated'));

create policy "policy items readable by the team"
  on policy_items for select using (auth.uid() is not null);
create policy "AM manages policy items"
  on policy_items for all using (is_audio_manager()) with check (is_audio_manager());

create policy "penalties readable by owner and staff"
  on policy_penalties for select using (employee_id = auth.uid() or current_rank() >= 60);
create policy "AM manages penalties"
  on policy_penalties for all using (is_audio_manager()) with check (is_audio_manager());

-- Default policy line items (from the training sheet).
insert into policy_items (kind, label, sort_order) values
  ('offense', 'Repeated failure to provide adequate notice for changes in work availability.', 1),
  ('offense', 'Consistently neglecting to sign up for work or frequently canceling confirmed assignments.', 2),
  ('offense', 'Avoiding work on projects or events', 3),
  ('offense', 'Habitual tardiness or failure to remain for the full duration of scheduled shifts.', 4),
  ('offense', 'Causing damage to equipment due to irresponsibility or negligence.', 5),
  ('offense', 'Inappropriate conduct toward colleagues, clients, or patrons.', 6),
  ('offense', 'Failure to resolve misreported work hours within three weeks of the work date.', 7),
  ('termination', 'Repetitive offenses from the policies above', 1),
  ('termination', 'Not registered for classes (may work Spring/Summer when registered for Fall)', 2),
  ('termination', 'Not clocking in for 6 months', 3),
  ('termination', 'Misusing Game Pass', 4),
  ('termination', 'Significant unprofessionalism', 5),
  ('termination', 'Significant or recurring mistreatment of equipment or coworkers', 6);
