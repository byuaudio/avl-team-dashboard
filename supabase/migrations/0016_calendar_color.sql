-- Self-service setter for a trainer's calendar color (profiles has no direct
-- update policy, so this goes through a security-definer RPC).
create function set_calendar_color(p_color text)
returns void language plpgsql security definer set search_path = public
as $$
begin
  if current_rank() < 40 then raise exception 'Only trainers set a calendar color.'; end if;
  update profiles set calendar_color = p_color where id = auth.uid();
end;
$$;

revoke execute on function set_calendar_color(text) from anon, public;
grant execute on function set_calendar_color(text) to authenticated;
