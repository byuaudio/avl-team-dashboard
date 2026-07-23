-- Role logic for the expanded model: a numeric rank ladder, capability helpers,
-- archiving, and role/archive changes gated by a per-role ceiling.
--
-- Access ladder (rank): audio_manager 100 > full_time 80 > three_quarter_time 60
-- > student_trainer 40 > student 20. Off-ladder: freelancer / non_audio_student
-- 20, office_student 10. Capabilities are derived from rank, so future features
-- compare ranks rather than hard-coding role lists.

-- Archiving: keep people indefinitely instead of deleting. Archived => inactive.
alter table profiles
  add column archived boolean not null default false,
  add column archived_at timestamptz;

create function role_rank(r employee_role)
returns int language sql immutable
as $$
  select case r
    when 'audio_manager'      then 100
    when 'full_time'          then 80
    when 'three_quarter_time' then 60
    when 'student_trainer'    then 40
    when 'student'            then 20
    when 'freelancer'         then 20
    when 'non_audio_student'  then 20
    when 'office_student'     then 10
    else 0
  end
$$;

-- Rank of the current signed-in, active employee (0 if none).
create function current_rank()
returns int language sql stable security definer set search_path = public
as $$
  select coalesce(role_rank(current_employee_role()), 0)
$$;

-- Grant pass-offs: student trainers and up. (Same name as before so existing
-- policies/RPCs keep calling it; body now rank-based.)
create or replace function is_trainer_or_manager()
returns boolean language sql stable security definer set search_path = public
as $$
  select current_rank() >= 40
$$;

create function can_edit_template()
returns boolean language sql stable security definer set search_path = public
as $$
  select current_rank() >= 60
$$;

create function can_see_pay()
returns boolean language sql stable security definer set search_path = public
as $$
  select current_rank() >= 80
$$;

create function is_audio_manager()
returns boolean language sql stable security definer set search_path = public
as $$
  select current_employee_role() = 'audio_manager'
$$;

-- Highest rank the caller may assign to others (0 = may not manage members):
--   audio_manager -> anyone (incl. audio_manager); full_time -> up to 3/4-time;
--   3/4-time -> up to student_trainer.
create function max_assignable_rank()
returns int language sql stable security definer set search_path = public
as $$
  select case current_employee_role()
    when 'audio_manager'      then 100
    when 'full_time'          then 60
    when 'three_quarter_time' then 40
    else 0
  end
$$;

-- ---------------------------------------------------------------------------
-- Template management: broaden from audio-manager-only to 3/4-time and up.
-- ---------------------------------------------------------------------------

drop policy "managers manage nodes" on training_nodes;
create policy "staff manage nodes"
  on training_nodes for all
  using (can_edit_template())
  with check (can_edit_template());

-- Profiles: role/archive changes now go through the RPCs below (which enforce
-- the ceiling), so drop the blanket manager UPDATE policy. SELECT is unchanged.
drop policy "managers manage profiles" on profiles;

-- Reset a pass-off: staff (3/4-time and up).
create or replace function reset_passoff(p_employee_id uuid, p_item_id uuid)
returns void language plpgsql security definer set search_path = public
as $$
begin
  if not can_edit_template() then
    raise exception 'Only staff (3/4-time and up) can reset a sign-off.';
  end if;
  update training_progress
  set status = 'not_started', requested_at = null, passed_off_by = null, passed_off_at = null
  where employee_id = p_employee_id and item_id = p_item_id;
end;
$$;

create or replace function reset_milestone(p_employee_id uuid, p_item_id uuid, p_milestone milestone_kind)
returns void language plpgsql security definer set search_path = public
as $$
begin
  if not can_edit_template() then
    raise exception 'Only staff (3/4-time and up) can reset a sign-off.';
  end if;
  update milestone_progress
  set status = 'not_started', requested_at = null, granted_by = null, granted_at = null
  where employee_id = p_employee_id and item_id = p_item_id and milestone = p_milestone;
end;
$$;

-- ---------------------------------------------------------------------------
-- Manage members: change a role or archive, gated by the ceiling.
-- ---------------------------------------------------------------------------

create function set_member_role(p_target uuid, p_role employee_role)
returns void language plpgsql security definer set search_path = public
as $$
declare cap int; target_rank int;
begin
  cap := max_assignable_rank();
  if cap = 0 then raise exception 'You are not allowed to assign roles.'; end if;
  if role_rank(p_role) > cap then
    raise exception 'That role is above what your permission level can assign.';
  end if;
  select role_rank(role) into target_rank from profiles where id = p_target;
  if target_rank is null then raise exception 'No such member.'; end if;
  if target_rank > cap and not is_audio_manager() then
    raise exception 'You cannot change the role of someone above your permission level.';
  end if;
  update profiles set role = p_role where id = p_target;
end;
$$;

create function set_member_archived(p_target uuid, p_archived boolean)
returns void language plpgsql security definer set search_path = public
as $$
declare cap int; target_rank int;
begin
  cap := max_assignable_rank();
  if cap = 0 then raise exception 'You are not allowed to archive members.'; end if;
  select role_rank(role) into target_rank from profiles where id = p_target;
  if target_rank is null then raise exception 'No such member.'; end if;
  if target_rank > cap and not is_audio_manager() then
    raise exception 'You cannot archive someone above your permission level.';
  end if;
  update profiles
  set archived = p_archived,
      archived_at = case when p_archived then now() else null end,
      is_active = not p_archived
  where id = p_target;
end;
$$;

-- Lock down the new functions (see AI_NOTES pitfall: post-0001 functions aren't
-- covered by the blanket revoke).
revoke execute on function
  role_rank(employee_role), current_rank(), can_edit_template(), can_see_pay(),
  is_audio_manager(), max_assignable_rank(),
  set_member_role(uuid, employee_role), set_member_archived(uuid, boolean)
  from anon, public;

grant execute on function
  role_rank(employee_role), current_rank(), can_edit_template(), can_see_pay(),
  is_audio_manager(), max_assignable_rank(),
  set_member_role(uuid, employee_role), set_member_archived(uuid, boolean)
  to authenticated;
