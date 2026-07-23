-- Scheduling Phase B: meeting methods, richer booking fields, and the RPCs the
-- booking UI needs (reschedule, outcome, notes, reassign, delete, edit).

alter table profiles add column meeting_methods text[] not null default '{"In Person"}';

alter table bookings
  add column method      text,
  add column description text not null default '',
  add column staff_notes text not null default '',
  add column attended    text; -- null | 'completed' | 'no_show'

-- request_booking gains method + description (drop+recreate: signature changes).
drop function request_booking(uuid, timestamptz, timestamptz, text, uuid);
create function request_booking(
  p_trainer uuid, p_start timestamptz, p_end timestamptz,
  p_topic text default '', p_item uuid default null,
  p_method text default null, p_description text default ''
)
returns uuid language plpgsql security definer set search_path = public
as $$
declare bid uuid; student_name text;
begin
  if current_employee_role() is null then
    raise exception 'You must be an active employee to book.';
  end if;
  if coalesce((select role_rank(role) from profiles where id = p_trainer), 0) < 40 then
    raise exception 'That person is not a trainer.';
  end if;
  if p_end <= p_start then raise exception 'Invalid time range.'; end if;
  if exists (
    select 1 from bookings
    where trainer_id = p_trainer and status in ('pending', 'confirmed')
      and tstzrange(start_at, end_at) && tstzrange(p_start, p_end)
  ) then
    raise exception 'That time was just booked. Please choose another available time.';
  end if;

  insert into bookings (trainer_id, student_id, start_at, end_at, topic, item_id, method, description)
  values (p_trainer, auth.uid(), p_start, p_end, coalesce(p_topic, ''), p_item, p_method,
          coalesce(p_description, ''))
  returning id into bid;

  select full_name into student_name from profiles where id = auth.uid();
  insert into notifications (user_id, body, link)
  values (p_trainer,
          coalesce(student_name, 'A student') || ' requested a training session on '
            || to_char(p_start, 'Mon DD at HH12:MI AM'), '#/sessions');
  return bid;
end;
$$;

-- Reschedule (student or trainer): new time, overlap-checked, back to pending.
create function reschedule_booking(p_booking uuid, p_start timestamptz, p_end timestamptz)
returns void language plpgsql security definer set search_path = public
as $$
declare b bookings%rowtype; me uuid; other uuid;
begin
  select * into b from bookings where id = p_booking;
  if b.id is null then raise exception 'No such booking.'; end if;
  me := auth.uid();
  if me <> b.student_id and me <> b.trainer_id then raise exception 'That is not your booking.'; end if;
  if p_end <= p_start then raise exception 'Invalid time range.'; end if;
  if exists (
    select 1 from bookings where trainer_id = b.trainer_id and id <> p_booking
      and status in ('pending', 'confirmed')
      and tstzrange(start_at, end_at) && tstzrange(p_start, p_end)
  ) then
    raise exception 'That time was just booked. Please choose another available time.';
  end if;
  update bookings set start_at = p_start, end_at = p_end, status = 'pending', decided_at = null
  where id = p_booking;
  other := case when me = b.student_id then b.trainer_id else b.student_id end;
  insert into notifications (user_id, body, link)
  values (other, 'A training session was rescheduled to ' || to_char(p_start, 'Mon DD at HH12:MI AM'),
          '#/sessions');
end;
$$;

-- Edit topic/description/method (student or trainer).
create function update_booking_details(p_booking uuid, p_topic text, p_description text, p_method text)
returns void language plpgsql security definer set search_path = public
as $$
declare b bookings%rowtype;
begin
  select * into b from bookings where id = p_booking;
  if b.id is null then raise exception 'No such booking.'; end if;
  if auth.uid() <> b.student_id and auth.uid() <> b.trainer_id then
    raise exception 'That is not your booking.';
  end if;
  update bookings set topic = coalesce(p_topic, ''), description = coalesce(p_description, ''),
                      method = p_method
  where id = p_booking;
end;
$$;

-- Mark completed / no-show (the trainer or staff >=60).
create function set_booking_outcome(p_booking uuid, p_outcome text)
returns void language plpgsql security definer set search_path = public
as $$
declare b bookings%rowtype;
begin
  select * into b from bookings where id = p_booking;
  if b.id is null then raise exception 'No such booking.'; end if;
  if auth.uid() <> b.trainer_id and current_rank() < 60 then
    raise exception 'Only the trainer or staff can set the outcome.';
  end if;
  if p_outcome not in ('completed', 'no_show') then raise exception 'Invalid outcome.'; end if;
  update bookings set attended = p_outcome where id = p_booking;
end;
$$;

create function set_booking_notes(p_booking uuid, p_notes text)
returns void language plpgsql security definer set search_path = public
as $$
declare b bookings%rowtype;
begin
  select * into b from bookings where id = p_booking;
  if b.id is null then raise exception 'No such booking.'; end if;
  if auth.uid() <> b.trainer_id and current_rank() < 60 then
    raise exception 'Only the trainer or staff can add notes.';
  end if;
  update bookings set staff_notes = coalesce(p_notes, '') where id = p_booking;
end;
$$;

-- Reassign to another trainer (Audio Manager); back to pending.
create function reassign_booking(p_booking uuid, p_trainer uuid)
returns void language plpgsql security definer set search_path = public
as $$
declare b bookings%rowtype;
begin
  if not is_audio_manager() then raise exception 'Only the audio manager can reassign.'; end if;
  select * into b from bookings where id = p_booking;
  if b.id is null then raise exception 'No such booking.'; end if;
  if exists (
    select 1 from bookings where trainer_id = p_trainer and id <> p_booking
      and status in ('pending', 'confirmed')
      and tstzrange(start_at, end_at) && tstzrange(b.start_at, b.end_at)
  ) then
    raise exception 'That trainer is not free then.';
  end if;
  update bookings set trainer_id = p_trainer, status = 'pending', decided_at = null where id = p_booking;
  insert into notifications (user_id, body, link)
  values (p_trainer, 'You were assigned a training session on '
            || to_char(b.start_at, 'Mon DD at HH12:MI AM'), '#/sessions');
end;
$$;

create function delete_booking(p_booking uuid)
returns void language plpgsql security definer set search_path = public
as $$
begin
  if not is_audio_manager() then raise exception 'Only the audio manager can delete.'; end if;
  delete from bookings where id = p_booking;
end;
$$;

revoke execute on function
  request_booking(uuid, timestamptz, timestamptz, text, uuid, text, text),
  reschedule_booking(uuid, timestamptz, timestamptz),
  update_booking_details(uuid, text, text, text),
  set_booking_outcome(uuid, text), set_booking_notes(uuid, text),
  reassign_booking(uuid, uuid), delete_booking(uuid)
  from anon, public;
grant execute on function
  request_booking(uuid, timestamptz, timestamptz, text, uuid, text, text),
  reschedule_booking(uuid, timestamptz, timestamptz),
  update_booking_details(uuid, text, text, text),
  set_booking_outcome(uuid, text), set_booking_notes(uuid, text),
  reassign_booking(uuid, uuid), delete_booking(uuid)
  to authenticated;
