-- Applied to production (ykrrwgkxgidoavtzcumk) on 2026-10-19 as migration "patch_job_result_payload".
-- Atomic, key-scoped edits to execution_jobs.result_payload.
-- Locks the row, evaluates optional guards against result_payload->p_guard_key,
-- then MERGES p_patch into the CURRENT payload (never a stale client copy).
-- Guards: [{"field": "...", "op": "eq|null_or_eq|is_null|not_eq_or_null|lt|key_absent", "value": "..."}]
create or replace function public.patch_job_result_payload(
  p_job_id uuid,
  p_patch jsonb,
  p_guard_key text default null,
  p_guards jsonb default '[]'::jsonb
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  cur jsonb;
  obj jsonb;
  g jsonb;
  v text;
begin
  select coalesce(result_payload, '{}'::jsonb) into cur
  from execution_jobs where id = p_job_id for update;
  if not found then return false; end if;

  obj := case when p_guard_key is null then cur else coalesce(cur -> p_guard_key, '{}'::jsonb) end;
  for g in select * from jsonb_array_elements(coalesce(p_guards, '[]'::jsonb)) loop
    v := obj ->> (g ->> 'field');
    case g ->> 'op'
      when 'eq' then if v is distinct from (g ->> 'value') then return false; end if;
      when 'null_or_eq' then if v is not null and v <> (g ->> 'value') then return false; end if;
      when 'is_null' then if v is not null then return false; end if;
      when 'not_eq_or_null' then if v is not null and v = (g ->> 'value') then return false; end if;
      when 'lt' then if v is null or not (v < (g ->> 'value')) then return false; end if;
      when 'key_absent' then if p_guard_key is not null and cur ? p_guard_key then return false; end if;
      else raise exception 'patch_job_result_payload: unknown guard op %', g ->> 'op';
    end case;
  end loop;

  update execution_jobs set result_payload = cur || coalesce(p_patch, '{}'::jsonb) where id = p_job_id;
  return true;
end;
$$;

revoke all on function public.patch_job_result_payload(uuid, jsonb, text, jsonb) from public, anon, authenticated;
grant execute on function public.patch_job_result_payload(uuid, jsonb, text, jsonb) to service_role;
