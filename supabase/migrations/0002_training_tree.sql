-- Phase 1 of the real-template redesign: a hierarchical training tree with
-- per-milestone sign-off.
--
-- ADDITIVE on purpose: this creates NEW tables (training_nodes,
-- milestone_progress) beside the old placeholder tables (training_sections,
-- training_items, training_progress) so the currently-deployed site keeps
-- working. A later migration drops the old tables once the UI is switched over.
--
-- Model (from "Template New Training Sheet"):
--   * The template is a tree: Level -> Category -> Group -> Item (skill).
--     Depth is irregular (some categories hold items directly, venues nest
--     events), so we use an adjacency list (parent_id) rather than fixed tables.
--   * Each ITEM tracks an ordered set of milestones. Most skills are
--     {introduced, passed_off}; venue skills add {guided, supervised, ...};
--     certifications are {submitted, tested}.
--   * Sign-off flow (chosen by the product owner): a student REQUESTS a
--     milestone on their own sheet; a trainer/manager GRANTS it. No one grants
--     their own; managers can reset. Same shape as the original RPCs, per
--     milestone. Business rules stay in the database (see CLAUDE.md).

-- ---------------------------------------------------------------------------
-- Types
-- ---------------------------------------------------------------------------

create type node_kind as enum ('level', 'category', 'group', 'item');

create type milestone_kind as enum (
  'introduced', 'guided', 'supervised', 'passed_off', 'submitted', 'tested'
);

create type milestone_status as enum ('not_started', 'requested', 'granted');

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

-- The shared template, as an ordered tree.
create table training_nodes (
  id           uuid primary key default gen_random_uuid(),
  parent_id    uuid references training_nodes (id) on delete cascade,
  kind         node_kind not null,
  title        text not null,
  sort_order   integer not null default 0,
  -- ITEM only: the ordered milestones this skill is signed off on
  -- (left-to-right as on the sheet). Empty for non-item nodes.
  milestones   milestone_kind[] not null default '{}',
  -- CATEGORY only (Phase 2 pay math): raise contribution and who does the
  -- final check ("Gabe" / "FTE"). Null elsewhere.
  dollar_value numeric(6, 2),
  approver     text,
  -- Optional footnote / helper text shown under an item.
  note         text not null default ''
);

create index training_nodes_parent_idx on training_nodes (parent_id, sort_order);

-- Per-employee, per-milestone progress. A missing row means 'not_started'.
create table milestone_progress (
  id           uuid primary key default gen_random_uuid(),
  employee_id  uuid not null references profiles (id) on delete cascade,
  item_id      uuid not null references training_nodes (id) on delete cascade,
  milestone    milestone_kind not null,
  status       milestone_status not null default 'not_started',
  requested_at timestamptz,
  granted_by   uuid references profiles (id),
  granted_at   timestamptz,
  notes        text not null default '',
  unique (employee_id, item_id, milestone)
);

create index milestone_progress_employee_idx on milestone_progress (employee_id);

-- ---------------------------------------------------------------------------
-- Row-level security (mirrors the 0001 pattern)
-- ---------------------------------------------------------------------------

alter table training_nodes      enable row level security;
alter table milestone_progress  enable row level security;

create policy "nodes readable by the team"
  on training_nodes for select using (auth.uid() is not null);
create policy "managers manage nodes"
  on training_nodes for all
  using (current_employee_role() = 'manager')
  with check (current_employee_role() = 'manager');

-- Students see their own milestones; trainers/managers see everyone's.
-- No insert/update/delete policies: writes go only through the RPCs below.
create policy "students see own milestones, trainers see all"
  on milestone_progress for select
  using (employee_id = auth.uid() or is_trainer_or_manager());

-- ---------------------------------------------------------------------------
-- Sign-off RPCs (business rules live here)
-- ---------------------------------------------------------------------------

-- Guard: a milestone must be one that the item actually tracks.
create function milestone_is_tracked(p_item_id uuid, p_milestone milestone_kind)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from training_nodes
    where id = p_item_id and kind = 'item' and p_milestone = any (milestones)
  )
$$;

create function request_milestone(p_item_id uuid, p_milestone milestone_kind)
returns void
language plpgsql security definer
set search_path = public
as $$
begin
  if current_employee_role() is null then
    raise exception 'You must be an active employee to request a pass-off.';
  end if;
  if not milestone_is_tracked(p_item_id, p_milestone) then
    raise exception 'That milestone is not tracked for this item.';
  end if;
  if exists (
    select 1 from milestone_progress
    where employee_id = auth.uid() and item_id = p_item_id
      and milestone = p_milestone and status = 'granted'
  ) then
    raise exception 'That milestone is already signed off.';
  end if;

  insert into milestone_progress (employee_id, item_id, milestone, status, requested_at)
  values (auth.uid(), p_item_id, p_milestone, 'requested', now())
  on conflict (employee_id, item_id, milestone) do update
    set status = 'requested', requested_at = now();
end;
$$;

create function cancel_milestone_request(p_item_id uuid, p_milestone milestone_kind)
returns void
language plpgsql security definer
set search_path = public
as $$
begin
  update milestone_progress
  set status = 'not_started', requested_at = null
  where employee_id = auth.uid()
    and item_id = p_item_id
    and milestone = p_milestone
    and status = 'requested';
end;
$$;

create function grant_milestone(
  p_employee_id uuid,
  p_item_id uuid,
  p_milestone milestone_kind,
  p_notes text default null
)
returns void
language plpgsql security definer
set search_path = public
as $$
begin
  if not is_trainer_or_manager() then
    raise exception 'Only student trainers and managers can grant sign-offs.';
  end if;
  if p_employee_id = auth.uid() then
    raise exception 'You cannot sign off on your own training sheet.';
  end if;
  if not milestone_is_tracked(p_item_id, p_milestone) then
    raise exception 'That milestone is not tracked for this item.';
  end if;

  insert into milestone_progress
    (employee_id, item_id, milestone, status, granted_by, granted_at, notes)
  values
    (p_employee_id, p_item_id, p_milestone, 'granted', auth.uid(), now(), coalesce(p_notes, ''))
  on conflict (employee_id, item_id, milestone) do update
    set status = 'granted',
        granted_by = auth.uid(),
        granted_at = now(),
        notes = coalesce(p_notes, milestone_progress.notes);
end;
$$;

create function reset_milestone(p_employee_id uuid, p_item_id uuid, p_milestone milestone_kind)
returns void
language plpgsql security definer
set search_path = public
as $$
begin
  if current_employee_role() <> 'manager' then
    raise exception 'Only managers can reset a sign-off.';
  end if;

  update milestone_progress
  set status = 'not_started', requested_at = null, granted_by = null, granted_at = null
  where employee_id = p_employee_id and item_id = p_item_id and milestone = p_milestone;
end;
$$;

-- Functions created after 0001 are NOT covered by that migration's blanket
-- revoke, so lock them down explicitly here (see AI_NOTES.md pitfall).
revoke execute on function
  milestone_is_tracked(uuid, milestone_kind),
  request_milestone(uuid, milestone_kind),
  cancel_milestone_request(uuid, milestone_kind),
  grant_milestone(uuid, uuid, milestone_kind, text),
  reset_milestone(uuid, uuid, milestone_kind)
  from anon, public;

grant execute on function
  milestone_is_tracked(uuid, milestone_kind),
  request_milestone(uuid, milestone_kind),
  cancel_milestone_request(uuid, milestone_kind),
  grant_milestone(uuid, uuid, milestone_kind, text),
  reset_milestone(uuid, uuid, milestone_kind)
  to authenticated;
