-- Busy-time lookup for the booking calendar (returns only trainer + interval,
-- never who booked or the topic — students shouldn't see others' bookings), and
-- a self-service setter for a trainer's meeting methods.

create function trainer_busy(p_from timestamptz, p_to timestamptz)
returns table (trainer_id uuid, start_at timestamptz, end_at timestamptz)
language sql stable security definer set search_path = public
as $$
  select trainer_id, start_at, end_at from bookings
  where status in ('pending', 'confirmed') and start_at < p_to and end_at > p_from
$$;

create function set_meeting_methods(p_methods text[])
returns void language plpgsql security definer set search_path = public
as $$
begin
  if current_rank() < 40 then raise exception 'Only trainers set meeting methods.'; end if;
  update profiles set meeting_methods = coalesce(p_methods, '{}') where id = auth.uid();
end;
$$;

revoke execute on function trainer_busy(timestamptz, timestamptz), set_meeting_methods(text[])
  from anon, public;
grant execute on function trainer_busy(timestamptz, timestamptz), set_meeting_methods(text[])
  to authenticated;
