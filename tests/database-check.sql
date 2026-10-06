-- Run against a disposable database AFTER the migration. All inserted data rolls back.
begin;
set local role service_role;
do $$
declare cid uuid := gen_random_uuid(); eid uuid := gen_random_uuid(); actual text;
begin
  insert into public.companies(id, name, payload) values (cid, 'Migration check', '{}');
  insert into public.employees(id, company_id, payload) values
    (eid, cid, jsonb_build_object('name','Nisa','role','Research Analyst','department','Research','employmentStatus','active'));
  update public.employees set payload = jsonb_set(payload, '{employmentStatus}', '"deceased"') where id = eid;
  select employment_status into actual from public.employees where id = eid;
  if actual <> 'deceased' then raise exception 'Employment status did not persist'; end if;
  begin
    insert into public.provider_connections(company_id,payload) values (cid, '{"kind":"openai","apiKey":"forbidden"}');
    raise exception 'Raw secret constraint did not reject the row';
  exception when check_violation then null;
  end;
  begin
    insert into public.tasks(company_id,payload) values (cid, jsonb_build_object('employeeId',eid,'status','FAKE_SUCCESS'));
    raise exception 'Invalid task status was accepted';
  exception when check_violation then null;
  end;
end;
$$;
reset role;
do $$
declare n int;
begin
  select count(*) into n from pg_tables where schemaname='public' and tablename in
    ('companies','employees','employee_appearance','employee_provider_config','employment_history','tasks','task_events','conversations','messages','reports','meetings','meeting_participants','meeting_messages','provider_connections','game_settings','company_settings','office_state','player_state','inventory','incidents') and rowsecurity;
  if n <> 20 then raise exception 'Expected 20 RLS-enabled tables, got %', n; end if;
  if has_table_privilege('anon','public.office_state','select') then raise exception 'Anonymous save access leaked'; end if;
  if has_table_privilege('authenticated','public.provider_connections','select') then raise exception 'Authenticated provider access leaked'; end if;
end;
$$;
rollback;
select 'PASS: migration, generated columns, service-role writes, secret/status constraints and RLS' as verification;
