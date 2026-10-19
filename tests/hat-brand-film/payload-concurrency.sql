-- DB-level interleave test for patch_job_result_payload. Always rolls back (ends in RAISE).
-- Run with any SQL client against the project; expected message:
-- ROLLBACK_TEST qa1=true asm_claim=true exec=true stale_qa=false qa2=true wrong_token=false steal=true default_if_absent=false | qa_rev=2 qa_shots=2 asm=assembling/C outputs=1
do $$
declare jid uuid := gen_random_uuid(); r boolean; p jsonb; log text := '';
begin
  insert into execution_jobs select (jsonb_populate_record(null::execution_jobs, to_jsonb(j) || jsonb_build_object('id', jid, 'result_payload', '{}'::jsonb))).* from execution_jobs j limit 1;
  r := patch_job_result_payload(jid, '{"hat_film_qa":{"rev":1,"shots":{"shot_01":{"status":"pass"}}}}', 'hat_film_qa', '[{"field":"rev","op":"null_or_eq","value":"0"}]'); log := log || 'qa1=' || r;
  r := patch_job_result_payload(jid, '{"hat_film_assembly":{"status":"assembling","lock_token":"A","lock_expires_at":"2026-10-19T12:15:00.000Z"}}', 'hat_film_assembly', '[{"field":"status","op":"not_eq_or_null","value":"ready"},{"field":"lock_token","op":"is_null"}]'); log := log || ' asm_claim=' || r;
  r := patch_job_result_payload(jid, '{"outputs":[{"type":"video"}],"telemetry":{}}'); log := log || ' exec=' || r;
  r := patch_job_result_payload(jid, '{"hat_film_qa":{"rev":1,"shots":{}}}', 'hat_film_qa', '[{"field":"rev","op":"null_or_eq","value":"0"}]'); log := log || ' stale_qa=' || r;
  r := patch_job_result_payload(jid, '{"hat_film_qa":{"rev":2,"shots":{"shot_01":{"status":"pass"},"shot_02":{"status":"pass"}}}}', 'hat_film_qa', '[{"field":"rev","op":"eq","value":"1"}]'); log := log || ' qa2=' || r;
  r := patch_job_result_payload(jid, '{"hat_film_assembly":{"status":"ready"}}', 'hat_film_assembly', '[{"field":"status","op":"not_eq_or_null","value":"ready"},{"field":"lock_token","op":"eq","value":"B"}]'); log := log || ' wrong_token=' || r;
  r := patch_job_result_payload(jid, '{"hat_film_assembly":{"status":"assembling","lock_token":"C","lock_expires_at":"2026-10-19T13:00:00.000Z"}}', 'hat_film_assembly', '[{"field":"status","op":"not_eq_or_null","value":"ready"},{"field":"lock_expires_at","op":"lt","value":"2026-10-19T12:30:00.000Z"}]'); log := log || ' steal=' || r;
  r := patch_job_result_payload(jid, '{"hat_film_assembly":{"status":"waiting"}}', 'hat_film_assembly', '[{"op":"key_absent"}]'); log := log || ' default_if_absent=' || r;
  select result_payload into p from execution_jobs where id = jid;
  raise exception 'ROLLBACK_TEST % | qa_rev=% qa_shots=% asm=%/% outputs=%', log, p->'hat_film_qa'->>'rev', (select count(*) from jsonb_object_keys(p->'hat_film_qa'->'shots')), p->'hat_film_assembly'->>'status', p->'hat_film_assembly'->>'lock_token', jsonb_array_length(p->'outputs');
end $$;
