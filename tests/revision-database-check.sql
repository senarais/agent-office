-- Disposable DB only; run both migrations first. This script rolls sample rows back.
begin;
set local role service_role;
do $$
declare cid uuid := gen_random_uuid(); eid uuid := gen_random_uuid(); sid uuid := gen_random_uuid(); tid uuid := gen_random_uuid(); rid uuid := gen_random_uuid(); machine_id uuid := gen_random_uuid(); n int;
begin
  insert into public.companies(id,name,payload) values (cid,'Revision 2 verification','{}');
  insert into public.employees(id,company_id,payload) values (eid,cid,jsonb_build_object('name','Test','employmentStatus','active','maxHp',100,'currentHp',100,'corpsePresent',false));
  update public.employees set payload = payload || '{"employmentStatus":"deceased","currentHp":0,"corpsePresent":true}' where id=eid;
  select current_hp into n from public.employees where id=eid;
  if n <> 0 then raise exception 'HP/death persistence failed'; end if;
  update public.employees set payload = payload || '{"employmentStatus":"active","currentHp":100,"corpsePresent":false}' where id=eid;
  insert into public.recurring_tasks(id,company_id,payload) values (sid,cid,jsonb_build_object('employeeId',eid,'schedule',jsonb_build_object('type','daily','timezone','Asia/Jakarta'),'enabled',true,'nextRunAt','2026-10-08T02:00:00.000Z','outputDestination','both'));
  insert into public.tasks(id,company_id,payload) values (tid,cid,jsonb_build_object('employeeId',eid,'status','QUEUED','scheduled',jsonb_build_object('scheduleId',sid)));
  insert into public.scheduled_task_runs(id,company_id,payload) values (rid,cid,jsonb_build_object('employeeId',eid,'recurringTaskId',sid,'taskId',tid,'scheduledAt','2026-10-08T02:00:00.000Z','status','queued'));
  begin
    insert into public.scheduled_task_runs(company_id,payload) select company_id,payload from public.scheduled_task_runs where id=rid;
    raise exception 'Duplicate occurrence accepted';
  exception when unique_violation then null;
  end;
  insert into public.torture_sessions(id,company_id,payload) values (machine_id,cid,jsonb_build_object('employeeId',eid,'method','meeting','status','paused','intensity',1));
  insert into public.incidents(company_id,payload) values (cid,jsonb_build_object('employeeId',eid,'tortureSessionId',machine_id,'text','Test incident'));
  begin
    update public.employees set payload = payload || '{"currentHp":-1}' where id=eid;
    raise exception 'Negative HP accepted';
  exception when check_violation then null;
  end;
  begin
    update public.employees set payload = payload || '{"corpsePresent":true}' where id=eid;
    raise exception 'Living corpse accepted';
  exception when check_violation then null;
  end;
end;
$$;
reset role;
do $$
declare t text;
begin
  foreach t in array array['recurring_tasks','scheduled_task_runs','torture_sessions'] loop
    if not (select rowsecurity from pg_tables where schemaname='public' and tablename=t) then raise exception 'Missing RLS on %',t; end if;
    if has_table_privilege('anon','public.'||t,'select') or has_table_privilege('authenticated','public.'||t,'select') then raise exception 'Public access leaked on %',t; end if;
  end loop;
end;
$$;
rollback;
select 'PASS: HP, corpse/resurrection, schedule FK, occurrence deduplication, machines, incidents and private RLS' as verification;
