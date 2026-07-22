-- Refine the sign-off rules per product-owner feedback:
--   1. Students may NOT request the 'introduced' milestone (a trainer marks it).
--   2. On event items (those tracking 'guided'/'supervised'), students may
--      request Guided/Supervised but NOT the final 'passed_off' (a trainer
--      signs that off).
--   3. When every milestone on an item has been granted for an employee, remove
--      that item from the employee's goals ("un-star" once fully passed off).
--
-- create or replace keeps the existing execute grants (signatures unchanged).

create or replace function request_milestone(p_item_id uuid, p_milestone milestone_kind)
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
  if p_milestone = 'introduced' then
    raise exception 'Introduced is marked by a trainer and cannot be requested.';
  end if;
  if p_milestone = 'passed_off' and exists (
    select 1 from training_nodes where id = p_item_id and 'guided' = any (milestones)
  ) then
    raise exception 'For events, request Guided or Supervised; a trainer signs off Passed Off.';
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

create or replace function grant_milestone(
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

  -- Once every milestone on this item is granted, un-star it for the employee.
  if not exists (
    select 1
    from training_nodes tn
    cross join lateral unnest(tn.milestones) as m(kind)
    where tn.id = p_item_id
      and not exists (
        select 1 from milestone_progress mp
        where mp.employee_id = p_employee_id
          and mp.item_id = p_item_id
          and mp.milestone = m.kind
          and mp.status = 'granted'
      )
  ) then
    delete from training_goals
    where employee_id = p_employee_id and item_id = p_item_id;
  end if;
end;
$$;
