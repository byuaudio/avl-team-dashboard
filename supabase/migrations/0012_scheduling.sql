-- Training scheduling: trainer availability (recurring + one-off), 1:1 booking
-- requests with trainer approval, and in-app notifications.

create type booking_status as enum ('pending', 'confirmed', 'declined', 'cancelled');

-- Recurring weekly availability (weekday 0=Sunday .. 6=Saturday).
create table availability_rules (
  id           uuid primary key default gen_random_uuid(),
  trainer_id   uuid not null references profiles (id) on delete cascade,
  weekday      int not null check (weekday between 0 and 6),
  start_time   time not null,
  end_time     time not null,
  slot_minutes int not null default 30,
  created_at   timestamptz not null default now()
);
create index availability_rules_trainer_idx on availability_rules (trainer_id);

-- One-off availability: extra open time, or a blackout that removes time.
create table availability_blocks (
  id           uuid primary key default gen_random_uuid(),
  trainer_id   uuid not null references profiles (id) on delete cascade,
  on_date      date not null,
  start_time   time not null,
  end_time     time not null,
  slot_minutes int not null default 30,
  kind         text not null default 'open', -- 'open' | 'blackout'
  created_at   timestamptz not null default now()
);
create index availability_blocks_trainer_idx on availability_blocks (trainer_id, on_date);

create table bookings (
  id         uuid primary key default gen_random_uuid(),
  trainer_id uuid not null references profiles (id) on delete cascade,
  student_id uuid not null references profiles (id) on delete cascade,
  start_at   timestamptz not null,
  end_at     timestamptz not null,
  status     booking_status not null default 'pending',
  topic      text not null default '',
  item_id    uuid references training_nodes (id) on delete set null,
  created_at timestamptz not null default now(),
  decided_at timestamptz
);
create index bookings_trainer_idx on bookings (trainer_id, start_at);
create index bookings_student_idx on bookings (student_id, start_at);

create table notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references profiles (id) on delete cascade,
  body       text not null,
  link       text,
  read       boolean not null default false,
  created_at timestamptz not null default now()
);
create index notifications_user_idx on notifications (user_id, read);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table availability_rules  enable row level security;
alter table availability_blocks enable row level security;
alter table bookings            enable row level security;
alter table notifications       enable row level security;

-- Availability: everyone signed in can read (to see open slots); a trainer
-- manages only their own, and must actually be a trainer (rank >= 40).
create policy "availability rules readable" on availability_rules
  for select using (auth.uid() is not null);
create policy "trainers manage own rules" on availability_rules
  for all using (trainer_id = auth.uid() and current_rank() >= 40)
  with check (trainer_id = auth.uid() and current_rank() >= 40);

create policy "availability blocks readable" on availability_blocks
  for select using (auth.uid() is not null);
create policy "trainers manage own blocks" on availability_blocks
  for all using (trainer_id = auth.uid() and current_rank() >= 40)
  with check (trainer_id = auth.uid() and current_rank() >= 40);

-- Bookings: the student, the trainer, and staff (>=60) can see them. Writes go
-- through the RPCs below (no direct write policy).
create policy "bookings readable by parties and staff" on bookings
  for select using (student_id = auth.uid() or trainer_id = auth.uid() or current_rank() >= 60);

create policy "own notifications" on notifications
  for select using (user_id = auth.uid());
create policy "mark own notifications read" on notifications
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Booking RPCs (business rules live here)
-- ---------------------------------------------------------------------------

-- Student requests a session. Rejects overlaps with the trainer's existing
-- pending/confirmed bookings, then notifies the trainer.
create function request_booking(
  p_trainer uuid, p_start timestamptz, p_end timestamptz,
  p_topic text default '', p_item uuid default null
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
    raise exception 'That time is no longer available.';
  end if;

  insert into bookings (trainer_id, student_id, start_at, end_at, topic, item_id)
  values (p_trainer, auth.uid(), p_start, p_end, coalesce(p_topic, ''), p_item)
  returning id into bid;

  select full_name into student_name from profiles where id = auth.uid();
  insert into notifications (user_id, body, link)
  values (p_trainer,
          coalesce(student_name, 'A student') || ' requested a training session on '
            || to_char(p_start, 'Mon DD at HH12:MI AM'),
          '#/sessions');
  return bid;
end;
$$;

-- Trainer confirms or declines a pending request; notifies the student.
create function decide_booking(p_booking uuid, p_confirm boolean)
returns void language plpgsql security definer set search_path = public
as $$
declare b bookings%rowtype; trainer_name text;
begin
  select * into b from bookings where id = p_booking;
  if b.id is null then raise exception 'No such booking.'; end if;
  if b.trainer_id <> auth.uid() then
    raise exception 'Only the trainer can decide this booking.';
  end if;
  if b.status <> 'pending' then raise exception 'This booking is not pending.'; end if;

  update bookings set status = case when p_confirm then 'confirmed' else 'declined' end,
                      decided_at = now()
  where id = p_booking;

  select full_name into trainer_name from profiles where id = b.trainer_id;
  insert into notifications (user_id, body, link)
  values (b.student_id,
          coalesce(trainer_name, 'Your trainer') ||
            (case when p_confirm then ' confirmed' else ' declined' end) ||
            ' your session on ' || to_char(b.start_at, 'Mon DD at HH12:MI AM'),
          '#/sessions');
end;
$$;

-- Either party cancels; notifies the other.
create function cancel_booking(p_booking uuid)
returns void language plpgsql security definer set search_path = public
as $$
declare b bookings%rowtype; me uuid; other uuid; my_name text;
begin
  select * into b from bookings where id = p_booking;
  if b.id is null then raise exception 'No such booking.'; end if;
  me := auth.uid();
  if me <> b.student_id and me <> b.trainer_id then
    raise exception 'That is not your booking.';
  end if;
  if b.status = 'cancelled' then return; end if;

  update bookings set status = 'cancelled', decided_at = now() where id = p_booking;
  other := case when me = b.student_id then b.trainer_id else b.student_id end;
  select full_name into my_name from profiles where id = me;
  insert into notifications (user_id, body, link)
  values (other,
          coalesce(my_name, 'Someone') || ' cancelled the session on '
            || to_char(b.start_at, 'Mon DD at HH12:MI AM'),
          '#/sessions');
end;
$$;

revoke execute on function
  request_booking(uuid, timestamptz, timestamptz, text, uuid),
  decide_booking(uuid, boolean),
  cancel_booking(uuid)
  from anon, public;
grant execute on function
  request_booking(uuid, timestamptz, timestamptz, text, uuid),
  decide_booking(uuid, boolean),
  cancel_booking(uuid)
  to authenticated;
