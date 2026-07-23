-- Phase 2 (pay, part 1): per-student base rate, a retired flag on template
-- nodes, and Audio-Manager-only setters for pay rates/amounts.
--
-- Pay model: rate = base_rate + Σ over categories of
--   category.dollar_value × (completed items in category ÷ ACTIVE items in category)
-- where "completed" = the item's final milestone is granted, "active" = not
-- retired. Completed-but-retired items stay in the numerator (not the
-- denominator), so training on now-retired gear keeps paying and a category can
-- exceed 100%.

alter table training_nodes add column retired boolean not null default false;
alter table profiles add column base_rate numeric(6, 2) not null default 14.00;

-- Only the Audio Manager adjusts pay (rates + category amounts).
create function set_base_rate(p_target uuid, p_rate numeric)
returns void language plpgsql security definer set search_path = public
as $$
begin
  if not is_audio_manager() then
    raise exception 'Only the audio manager can set pay rates.';
  end if;
  update profiles set base_rate = p_rate where id = p_target;
end;
$$;

create function set_category_amount(p_node uuid, p_amount numeric)
returns void language plpgsql security definer set search_path = public
as $$
begin
  if not is_audio_manager() then
    raise exception 'Only the audio manager can set pay amounts.';
  end if;
  update training_nodes set dollar_value = p_amount where id = p_node;
end;
$$;

revoke execute on function set_base_rate(uuid, numeric), set_category_amount(uuid, numeric)
  from anon, public;
grant execute on function set_base_rate(uuid, numeric), set_category_amount(uuid, numeric)
  to authenticated;
