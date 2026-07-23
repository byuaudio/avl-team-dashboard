-- Phase 2 (pay, part 4): flexible pay adjustments, a payroll-cleared rate
-- (separate from the live tally), and pay history for payroll submissions.

-- The rate payroll has actually cleared, and when it was submitted. Distinct
-- from the live computed tally shown on the sheet.
alter table profiles
  add column submitted_rate numeric,
  add column submitted_at   date;

-- Free-form pay adjustments the Audio Manager adds (e.g. legacy raises), each
-- with a note. Amount may be negative. Replaces the old prior-semester credit.
create table pay_adjustments (
  id          uuid primary key default gen_random_uuid(),
  employee_id uuid not null references profiles (id) on delete cascade,
  amount      numeric not null,
  note        text not null default '',
  created_at  timestamptz not null default now()
);
create index pay_adjustments_emp_idx on pay_adjustments (employee_id);

-- One row each time a rate is submitted to payroll.
create table pay_history (
  id            uuid primary key default gen_random_uuid(),
  employee_id   uuid not null references profiles (id) on delete cascade,
  new_rate      numeric not null,
  previous_rate numeric,
  increase      numeric,
  submitted_at  date not null default current_date,
  note          text not null default '',
  created_by    uuid references profiles (id)
);
create index pay_history_emp_idx on pay_history (employee_id);

alter table pay_adjustments enable row level security;
alter table pay_history     enable row level security;

create policy "adjustments readable by owner and pay-viewers"
  on pay_adjustments for select using (employee_id = auth.uid() or current_rank() >= 80);
create policy "audio manager manages adjustments"
  on pay_adjustments for all using (is_audio_manager()) with check (is_audio_manager());

create policy "pay history readable by owner and pay-viewers"
  on pay_history for select using (employee_id = auth.uid() or current_rank() >= 80);
-- Inserts happen only through submit_pay (security definer).

create function submit_pay(p_target uuid, p_new_rate numeric, p_note text default '')
returns void language plpgsql security definer set search_path = public
as $$
declare prev numeric;
begin
  if not is_audio_manager() then
    raise exception 'Only the audio manager can submit pay to payroll.';
  end if;
  select submitted_rate into prev from profiles where id = p_target;
  insert into pay_history (employee_id, new_rate, previous_rate, increase, note, created_by)
  values (p_target, p_new_rate, prev,
          case when prev is null then null else p_new_rate - prev end,
          coalesce(p_note, ''), auth.uid());
  update profiles set submitted_rate = p_new_rate, submitted_at = current_date where id = p_target;
end;
$$;

revoke execute on function submit_pay(uuid, numeric, text) from anon, public;
grant execute on function submit_pay(uuid, numeric, text) to authenticated;
