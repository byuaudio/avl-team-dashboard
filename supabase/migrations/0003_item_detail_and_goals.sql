-- Phase 1.5: item detail (photo + explanation) and student goals.
-- (Section progress bars are a UI-only change over the existing counts.)

-- Per-item detail shown when you click a skill.
alter table training_nodes
  add column description text not null default '',
  add column image_url  text;

-- Skills a student wants to learn ("add to goals"). Low-stakes and student-
-- owned, so these writes go directly through RLS rather than an RPC (unlike
-- training_progress, whose cross-role sign-off rules must live in functions).
create table training_goals (
  id          uuid primary key default gen_random_uuid(),
  employee_id uuid not null references profiles (id) on delete cascade,
  item_id     uuid not null references training_nodes (id) on delete cascade,
  created_at  timestamptz not null default now(),
  unique (employee_id, item_id)
);

create index training_goals_employee_idx on training_goals (employee_id);

alter table training_goals enable row level security;

-- Students see/manage their own goals; trainers & managers can see everyone's
-- (to know what people want to work on).
create policy "goals readable by owner and trainers"
  on training_goals for select
  using (employee_id = auth.uid() or is_trainer_or_manager());

create policy "employees add their own goals"
  on training_goals for insert
  with check (employee_id = auth.uid() and current_employee_role() is not null);

create policy "employees remove their own goals"
  on training_goals for delete
  using (employee_id = auth.uid());
