-- Calendar redesign: one availability model (concrete dated blocks with event
-- type, capacity, booking duration, method, recurrence via series_id), trainer
-- colors, and capacity-aware booking. Additive — the old availability_rules /
-- availability_blocks tables remain until the calendar UI fully replaces them.

alter table profiles add column calendar_color text not null default '#2E5D8A';

create table availability (
  id              uuid primary key default gen_random_uuid(),
  trainer_id      uuid not null references profiles (id) on delete cascade,
  start_at        timestamptz not null,
  end_at          timestamptz not null,
  event_type      text not null default 'One-on-One Training',
  capacity        int not null default 1,
  booking_minutes int not null default 30,
  method          text,
  notes           text not null default '',
  kind            text not null default 'open', -- 'open' | 'blackout'
  series_id       uuid,
  created_at      timestamptz not null default now()
);
create index availability_trainer_idx on availability (trainer_id, start_at);
create index availability_time_idx on availability (start_at, end_at);

alter table bookings add column availability_id uuid references availability (id) on delete set null;

alter table availability enable row level security;

-- Readable by anyone signed in; a trainer creates/edits/deletes their own
-- (create, drag, resize, move, delete are direct writes under this policy).
create policy "availability readable by the team" on availability
  for select using (auth.uid() is not null);
create policy "trainers manage own availability" on availability
  for all using (trainer_id = auth.uid() and current_rank() >= 40)
  with check (trainer_id = auth.uid() and current_rank() >= 40);

-- Book a sub-slot of an availability block (capacity-aware). Group sessions
-- allow up to `capacity` bookings at the same start; 1:1 is capacity = 1.
create function book_slot(
  p_availability uuid, p_start timestamptz,
  p_topic text default '', p_method text default null, p_description text default ''
)
returns uuid language plpgsql security definer set search_path = public
as $$
declare a availability%rowtype; p_end timestamptz; bid uuid; taken int; student_name text;
begin
  if current_employee_role() is null then
    raise exception 'You must be an active employee to book.';
  end if;
  select * into a from availability where id = p_availability;
  if a.id is null then raise exception 'No such availability.'; end if;
  if a.kind <> 'open' then raise exception 'That time is not open for booking.'; end if;
  p_end := p_start + (a.booking_minutes || ' minutes')::interval;
  if p_start < a.start_at or p_end > a.end_at then
    raise exception 'That time is outside the availability window.';
  end if;
  if mod(cast(extract(epoch from (p_start - a.start_at)) as int), a.booking_minutes * 60) <> 0 then
    raise exception 'Please choose a valid appointment start time.';
  end if;
  select count(*) into taken from bookings
    where availability_id = a.id and start_at = p_start and status in ('pending', 'confirmed');
  if taken >= a.capacity then
    raise exception 'That time was just booked. Please choose another available time.';
  end if;

  insert into bookings (trainer_id, student_id, start_at, end_at, status, topic, method, description, availability_id)
  values (a.trainer_id, auth.uid(), p_start, p_end, 'pending', coalesce(p_topic, ''),
          coalesce(p_method, a.method), coalesce(p_description, ''), a.id)
  returning id into bid;

  select full_name into student_name from profiles where id = auth.uid();
  insert into notifications (user_id, body, link)
  values (a.trainer_id, coalesce(student_name, 'A student') || ' requested ' || a.event_type
            || ' on ' || to_char(p_start, 'Mon DD at HH12:MI AM'), '#/sessions');
  return bid;
end;
$$;

-- Privacy-safe booking counts per slot (for showing remaining capacity), no
-- student identities.
create function availability_counts(p_from timestamptz, p_to timestamptz)
returns table (availability_id uuid, start_at timestamptz, taken int)
language sql stable security definer set search_path = public
as $$
  select availability_id, start_at, count(*)::int
  from bookings
  where availability_id is not null and status in ('pending', 'confirmed')
    and start_at >= p_from and start_at < p_to
  group by availability_id, start_at
$$;

revoke execute on function book_slot(uuid, timestamptz, text, text, text),
  availability_counts(timestamptz, timestamptz) from anon, public;
grant execute on function book_slot(uuid, timestamptz, text, text, text),
  availability_counts(timestamptz, timestamptz) to authenticated;
