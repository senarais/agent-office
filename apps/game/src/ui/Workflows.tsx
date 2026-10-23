import { useState } from 'react';
import type { Schedule } from '../../../../packages/shared/src/automation';
import { socialPlatforms } from '../../../../packages/shared/src/social';
import type { ScheduleWindow, WorkflowDefinition, WorkflowRun, WorkflowStep, WorkflowStepRun } from '../../../../packages/shared/src/workflow';
import { instantiatePreset, workflowPresets } from '../../../../packages/shared/src/workflow';
import { api, useGame } from '../state';
import { Empty, Field, PixelButton, PixelTabs, useAction } from './kit';

const summary = (schedule: Schedule | null) => !schedule ? 'Manual only' : schedule.type === 'interval' ? `Every ${schedule.intervalMinutes} min` : schedule.type === 'once' ? `Once · ${new Date(schedule.runAt).toLocaleString()}` : schedule.type === 'cron' ? schedule.cron : `${schedule.type} ${schedule.time}${schedule.type === 'weekly' ? ' · ' + schedule.weekdays.map(day => ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][day]).join(', ') : ''}`;
const statusTone = (status: string) => ['failed', 'cancelled', 'skipped'].includes(status) ? 'warning' : '';
const defaultScheduleWindow = (timeZone: string): ScheduleWindow => ({
  date: new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(Date.now() + 86400000)),
  start: '18:00', end: '20:00',
});

export function SocialPlanList({ runId, stepRunId, actions = true }: { runId?: string; stepRunId?: string; actions?: boolean }) {
  const world = useGame(s => s.world!); const { run, busy } = useAction();
  const plans = world.socialPostPlans.filter(plan => (!runId || plan.runId === runId) && (!stepRunId || plan.stepRunId === stepRunId)).slice().sort((a, b) => Date.parse(a.scheduledAt) - Date.parse(b.scheduledAt));
  if (!plans.length) return <Empty>No scheduled posts yet. Approve a social plan step to queue real posts.</Empty>;
  return <div className="plan-list">{plans.map(plan => <article className="plan-item" key={plan.id}>
    <div className="plan-time"><b>{new Date(plan.scheduledAt).toLocaleString()}</b><span className={`tag ${statusTone(plan.status)}`}>{plan.status.toUpperCase()}</span></div>
    <p>{plan.caption}</p>
    {!!plan.hashtags.length && <small>{plan.hashtags.join(' ')}</small>}
    <div className="plan-meta"><span>{plan.platform.toUpperCase()} · {plan.mediaType}</span>{plan.url && <a href={plan.url} target="_blank" rel="noreferrer">Open post ↗</a>}{plan.error && <span className="inline-error">{plan.error}</span>}</div>
    {actions && ['failed', 'cancelled'].includes(plan.status) && <PixelButton disabled={busy} onClick={() => void run(() => api(`/social/plans/${plan.id}/action`, { action: 'retry' }))}>Retry post</PixelButton>}
    {actions && !['published', 'cancelled'].includes(plan.status) && <PixelButton className="danger" disabled={busy} onClick={() => void run(() => api(`/social/plans/${plan.id}/action`, { action: 'cancel' }))}>Cancel post</PixelButton>}
  </article>)}</div>;
}

function PlanPreview({ step }: { step: WorkflowStepRun }) {
  if (step.kind !== 'social-plan') return null;
  return <div className="workflow-plan"><h4>Posting schedule</h4><SocialPlanList stepRunId={step.id} actions={false} /></div>;
}

const categoryOrder = ['TECH', 'TRENDS', 'MEME'];
const categoriesOf = (step: WorkflowStepRun) => [...new Set((step.options || []).map(option => option.category))].sort((a, b) => {
  const left = categoryOrder.indexOf(a); const right = categoryOrder.indexOf(b);
  return (left < 0 ? 99 : left) - (right < 0 ? 99 : right);
});

function ResearchOptions({ step, chosen, onChange }: { step: WorkflowStepRun; chosen: string[]; onChange: (ids: string[]) => void }) {
  const options = step.options || [];
  const toggle = (optionId: string) => onChange(chosen.includes(optionId) ? chosen.filter(id => id !== optionId) : [...chosen, optionId]);
  return <fieldset className="research-options">
    <legend>Pilih tweet untuk dijadwalkan · {chosen.length}/12</legend>
    <div className="research-actions"><PixelButton type="button" onClick={() => onChange(options.slice(0, 12).map(option => option.id))}>Pilih 12 pertama</PixelButton><PixelButton type="button" onClick={() => onChange([])}>Kosongkan</PixelButton></div>
    {categoriesOf(step).map(category => {
      const items = options.filter(option => option.category === category);
      return <div className="research-group" key={category}><h5>{category}</h5>{items.map((option, index) => <label className={`research-option ${chosen.includes(option.id) ? 'chosen' : ''}`} key={option.id}>
        <input type="checkbox" checked={chosen.includes(option.id)} onChange={() => toggle(option.id)} />
        {option.imagePath ? <img src={`/api/media/${option.imagePath}`} alt="" loading="lazy" /> : <span className="research-noimage">NO IMG</span>}
        <span className="research-copy"><b>{category} #{index + 1}</b><span>{option.text}</span>{option.author && <small>{option.author}</small>}{option.sourceUrl && <a href={option.sourceUrl} target="_blank" rel="noreferrer" onClick={event => event.stopPropagation()}>source ↗</a>}</span>
      </label>)}</div>;
    })}
  </fieldset>;
}

function RunCard({ run }: { run: WorkflowRun }) {
  const world = useGame(s => s.world!); const { run: act, busy } = useAction();
  const [revision, setRevision] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<Record<string, string[]>>({});
  const [windows, setWindows] = useState<Record<string, ScheduleWindow>>({});
  const active = ['queued', 'running', 'waiting_approval', 'revision'].includes(run.status);
  const timezone = world.workflows.find(workflow => workflow.id === run.workflowId)?.timezone || 'UTC';
  const chosenFor = (step: WorkflowStepRun) => selected[step.id] ?? (step.options || []).slice(0, 8).map(option => option.id);
  const windowFor = (step: WorkflowStepRun) => windows[step.id] ?? defaultScheduleWindow(timezone);
  const approve = (step: WorkflowStepRun) => void act(async () => { await api(`/workflows/runs/${run.id}/approve`, { stepRunId: step.id, note: (notes[step.id] || '').trim() || undefined, selectedOptionIds: step.options?.length ? chosenFor(step) : undefined, scheduleWindow: step.kind === 'review' && step.options?.length ? windowFor(step) : undefined }); setNotes(current => ({ ...current, [step.id]: '' })); useGame.getState().toast(`Approved “${step.name}”.`); });
  const revise = (step: WorkflowStepRun) => void act(async () => { await api(`/workflows/runs/${run.id}/revise`, { stepRunId: step.id, instructions: revision[step.id] }); setRevision(current => ({ ...current, [step.id]: '' })); useGame.getState().toast('Revision requested.'); });
  return <article className="workflow-run">
    <header><div className="grow"><span className="eyebrow">WORKFLOW RUN · {new Date(run.scheduledAt).toLocaleString()}</span><h3>{run.workflowName} <span className={`tag ${statusTone(run.status)}`}>{run.status.replaceAll('_', ' ').toUpperCase()}</span></h3><p>{run.brief || 'No description.'}</p></div>{active && <PixelButton className="danger" disabled={busy} onClick={() => void act(() => api(`/workflows/runs/${run.id}/cancel`, {}))}>Cancel run</PixelButton>}</header>
    {run.errors.map((error, index) => <p className="inline-error" key={index}>{error}</p>)}
    <div className="workflow-steps">{run.steps.map((step, index) => {
      const employee = world.employees.find(item => item.id === step.employeeId);
      const canReview = step.status === 'awaiting_approval';
      const canRevise = step.status === 'awaiting_approval' || (run.status === 'failed' && step.status === 'failed');
      const chosen = chosenFor(step);
      return <section className={`workflow-step ${canReview ? 'awaiting' : ''}`} key={step.id}>
        <div className="workflow-step-head"><span className="step-number">{index + 1}</span><div className="grow"><b>{step.name}</b><small>{employee?.name || 'Missing employee'} · {step.kind === 'social-plan' ? `social plan · ${step.expectedPosts || 3} posts` : step.kind === 'review' ? `review · ${step.options?.length || 0} options` : 'agent step'}</small></div><span className={`tag ${statusTone(step.status)}`}>{step.status.replaceAll('_', ' ').toUpperCase()}</span></div>
        {step.error && <p className="inline-error">{step.error}</p>}
        {!!step.output && <details><summary>Report output</summary><pre className="document">{step.output}</pre></details>}
        <PlanPreview step={step} />
        {canReview && step.options?.length ? <ResearchOptions step={step} chosen={chosen} onChange={ids => setSelected(current => ({ ...current, [step.id]: ids }))} /> : null}
        {canReview && step.kind === 'review' && step.options?.length ? <div className="form-grid schedule-window"><Field label={`Tanggal publish (${timezone})`}><input type="date" required value={windowFor(step).date} onChange={event => setWindows(current => ({ ...current, [step.id]: { ...windowFor(step), date: event.target.value } }))} /></Field><Field label="Jam mulai"><input type="time" required value={windowFor(step).start} onChange={event => setWindows(current => ({ ...current, [step.id]: { ...windowFor(step), start: event.target.value } }))} /></Field><Field label="Jam selesai"><input type="time" required value={windowFor(step).end} onChange={event => setWindows(current => ({ ...current, [step.id]: { ...windowFor(step), end: event.target.value } }))} /></Field></div> : null}
        {canReview && step.kind === 'review' && step.options?.length ? <p className="note">{chosen.length} tweet akan disebar merata antara {windowFor(step).start} dan {windowFor(step).end} waktu {timezone}. Window harus mulai minimal 10 menit dari sekarang.</p> : null}
        {canReview && <div className="workflow-approval"><Field label={step.kind === 'social-plan' ? 'Final notes for the director (optional)' : 'Catatan tambahan untuk step berikutnya (optional)'}><textarea rows={3} maxLength={10000} value={notes[step.id] || ''} onChange={event => setNotes(current => ({ ...current, [step.id]: event.target.value }))} placeholder={step.kind === 'social-plan' ? 'Contoh: ganti caption nomor 3, jadwal 07:00 jadi 08:00.' : 'Contoh: prioritaskan yang lucu, hindari politik.'} /></Field><PixelButton className="primary" disabled={busy || (!!step.options?.length && (chosen.length < 1 || chosen.length > 12)) || (step.kind === 'review' && !!step.options?.length && (!windowFor(step).date || windowFor(step).start >= windowFor(step).end))} onClick={() => approve(step)}>Approve &amp; continue</PixelButton><PixelButton disabled={busy} onClick={() => useGame.getState().open('report', step.reportId!)}>Open report</PixelButton></div>}
        {canRevise && <form onSubmit={event => { event.preventDefault(); revise(step); }}><Field label={`Revision instructions for “${step.name}”`}><textarea required rows={2} maxLength={10000} value={revision[step.id] || ''} onChange={event => setRevision(current => ({ ...current, [step.id]: event.target.value }))} placeholder="Change the schedule, rewrite the captions, keep the same research." /></Field><div className="form-actions"><PixelButton disabled={busy || !(revision[step.id] || '').trim()}>Request revision</PixelButton>{step.reportId && <PixelButton type="button" onClick={() => useGame.getState().open('report', step.reportId!)}>Open report</PixelButton>}</div></form>}
      </section>;
    })}</div>
  </article>;
}

function DefinitionRow({ definition }: { definition: WorkflowDefinition }) {
  const world = useGame(s => s.world!); const { run, busy } = useAction(); const [confirm, setConfirm] = useState(false);
  return <article className="schedule-row"><div className="grow"><h3>{definition.name} <span className="tag">{definition.deletedAt ? 'DELETED' : definition.enabled ? definition.nextRunAt ? 'ENABLED' : 'MANUAL' : 'PAUSED'}</span></h3><p>{definition.steps.length} steps · {summary(definition.schedule)} · {definition.timezone}</p><small>{definition.steps.map(step => `${step.name} (${world.employees.find(employee => employee.id === step.employeeId)?.name || 'unassigned'})`).join(' → ')}</small><small>Next: {definition.nextRunAt ? new Date(definition.nextRunAt).toLocaleString() : '—'} {definition.pausedReason && `· ${definition.pausedReason}`} · Telegram on</small></div><div className="row-actions"><PixelButton disabled={!!definition.deletedAt} onClick={() => useGame.getState().open('workflow-edit', definition.id)}>Edit flow</PixelButton><PixelButton disabled={busy || !!definition.deletedAt} onClick={() => void run(() => api(`/workflows/${definition.id}/action`, { action: definition.enabled ? 'pause' : 'resume' }))}>{definition.enabled ? 'Pause' : 'Resume'}</PixelButton><PixelButton disabled={busy || !!definition.deletedAt} onClick={() => void run(() => api(`/workflows/${definition.id}/action`, { action: 'run' }))}>Run now</PixelButton><PixelButton className="danger" disabled={busy || !!definition.deletedAt} onClick={() => setConfirm(true)}>Delete</PixelButton></div>{confirm && <div className="inline-confirm"><p>Delete this workflow? Runs, reports and analyzed posts stay. Active work is cancelled.</p><PixelButton className="danger" disabled={busy} onClick={() => void run(async () => { await api(`/workflows/${definition.id}/action`, { action: 'delete' }); setConfirm(false); })}>Delete workflow</PixelButton><PixelButton onClick={() => setConfirm(false)}>Keep workflow</PixelButton></div>}</article>;
}

export function Workflows({ runId }: { runId?: string }) {
  const world = useGame(s => s.world!); const [tab, setTab] = useState('Runs');
  const runs = world.workflowRuns.filter(run => tab !== 'Approvals' || run.status === 'waiting_approval').slice().sort((a, b) => (a.id === runId ? -1 : b.id === runId ? 1 : 0));
  const definitions = world.workflows;
  return <>
    <div className="section-heading"><div><span className="eyebrow">ABISENA OS / WORKFLOWS</span><h2>One flow. Many agents.</h2><p>Research → hand off → build → your approval. Every step is a real agent task and every report goes to Telegram.</p></div><PixelButton className="primary" onClick={() => useGame.getState().open('workflow-edit')}>+ New workflow</PixelButton></div>
    <div className="social-summary"><span className={`tag ${world.integrations.telegram.configured ? '' : 'warning'}`}>TELEGRAM {world.integrations.telegram.configured ? 'ON' : 'OFF'}</span><span className="tag">{world.workflows.filter(definition => !definition.deletedAt && definition.enabled).length} ENABLED</span><span className="tag">{runs.filter(run => run.status === 'waiting_approval').length} WAITING</span><span className="tag">{world.socialPostPlans.filter(plan => ['approved', 'proposed'].includes(plan.status)).length} SCHEDULED POSTS</span></div>
    <PixelTabs values={['Runs', 'Approvals', 'Definitions']} current={tab} onChange={setTab} />
    {tab !== 'Definitions' && (!runs.length ? <Empty>No workflow runs yet. Create a flow or load the daily social preset.</Empty> : runs.map(run => <RunCard key={run.id} run={run} />))}
    {tab === 'Definitions' && (!definitions.length ? <Empty>No workflows yet. Load a preset to start with Research → Social Media or Research → Program.</Empty> : definitions.slice().reverse().map(definition => <DefinitionRow key={definition.id} definition={definition} />))}
    <p className="note">Flow steps are snapshotted per run, so editing a definition never rewrites work already in flight. Dependent steps start only after their parent step is approved. Social plan steps queue real posts and publish them at the approved times through the local browser worker.</p>
  </>;
}

type EditorForm = {
  name: string; description: string; preset: string; timezone: string;
  scheduleEnabled: boolean; schedule: Schedule; enabled: boolean; steps: WorkflowStep[];
};
const defaultSchedule = (): Schedule => ({ type: 'daily', timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC', time: '09:00', weekdays: [1, 2, 3, 4, 5], intervalMinutes: 60, cron: '0 9 * * 1-5', runAt: new Date(Date.now() + 60000).toISOString() });

export function WorkflowEditor({ editId }: { editId?: string }) {
  const world = useGame(s => s.world!);
  const preset = editId?.startsWith('preset:') ? instantiatePreset(editId.slice(7)) : undefined;
  const old = world.workflows.find(workflow => workflow.id === editId);
  const active = world.employees.filter(employee => employee.employmentStatus === 'active');
  const initial = old
    ? { name: old.name, description: old.description, preset: old.preset || '', timezone: old.timezone, schedule: old.schedule as Schedule | null, enabled: old.enabled, steps: old.steps }
    : preset
      ? { name: preset.name, description: preset.description, preset: preset.preset, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC', schedule: null as Schedule | null, enabled: true, steps: preset.steps }
      : undefined;
  const [form, setForm] = useState<EditorForm>({
    name: initial?.name || '', description: initial?.description || '', preset: initial?.preset || '',
    timezone: initial?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
    scheduleEnabled: !!initial?.schedule, schedule: initial?.schedule || defaultSchedule(),
    enabled: initial?.enabled ?? true,
    steps: initial?.steps ? structuredClone(initial.steps) : [],
  });
  const { run, busy } = useAction();
  const set = (key: keyof EditorForm, value: unknown) => setForm(current => ({ ...current, [key]: value }));
  const setSchedule = (key: keyof Schedule, value: unknown) => setForm(current => ({ ...current, schedule: { ...current.schedule, [key]: value } }));
  const updateStep = (index: number, patch: Partial<WorkflowStep>) => setForm(current => ({ ...current, steps: current.steps.map((step, position) => position === index ? { ...step, ...patch } : step) }));
  const addStep = () => setForm(current => {
    const previous = current.steps.at(-1)?.id;
    return { ...current, steps: [...current.steps, { id: crypto.randomUUID(), name: `Step ${current.steps.length + 1}`, employeeId: '', instructions: '', expectedOutput: '', tools: [], dependsOn: previous ? [previous] : [], requiresApproval: false, kind: 'agent', expectedPosts: 3 }] };
  });
  const removeStep = (index: number) => setForm(current => {
    const removed = current.steps[index].id;
    return { ...current, steps: current.steps.filter((_, position) => position !== index).map(step => ({ ...step, dependsOn: step.dependsOn.filter(id => id !== removed) })) };
  });
  const loadPreset = (presetId: string) => {
    if (!presetId) { set('preset', ''); return; }
    const loaded = instantiatePreset(presetId);
    if (!loaded) return;
    setForm(current => ({ ...current, name: loaded.name, description: loaded.description, preset: loaded.preset, steps: loaded.steps }));
  };
  const submit = () => void run(async () => {
    const payload = {
      name: form.name, description: form.description, preset: form.preset || undefined,
      timezone: form.timezone, schedule: form.scheduleEnabled ? form.schedule : null,
      enabled: form.enabled, telegramNotify: true,
      steps: form.steps.map(step => ({ id: step.id, name: step.name, employeeId: step.employeeId, instructions: step.instructions, expectedOutput: step.expectedOutput, tools: step.tools, dependsOn: step.dependsOn, requiresApproval: step.requiresApproval, kind: step.kind, platform: step.platform, expectedPosts: step.expectedPosts })),
    };
    await api(old ? `/workflows/${old.id}` : '/workflows', payload, old ? 'PUT' : 'POST');
    useGame.getState().open('workflows');
  });
  const invalid = !form.name.trim() || !form.steps.length || form.steps.some(step => !step.employeeId || !step.name.trim() || !step.instructions.trim());
  return <form onSubmit={event => { event.preventDefault(); submit(); }}>
    <div className="section-heading"><div><span className="eyebrow">WORKFLOW EDITOR / DAG</span><h2>{old ? 'Edit the flow' : 'A repeatable way to work.'}</h2><p>Each step is a real employee task. Approval pauses the flow; revisions return the work to the same agent with your feedback.</p></div>{!old && <Field label="Load a preset"><select value={form.preset} onChange={event => loadPreset(event.target.value)}><option value="">Start from scratch</option>{workflowPresets.map(preset => <option key={preset.id} value={preset.id}>{preset.name}</option>)}</select></Field>}</div>
    <div className="form-grid"><Field label="Workflow name"><input required maxLength={140} value={form.name} onChange={event => set('name', event.target.value)} placeholder="Daily X posting" /></Field><Field label="Timezone"><input required maxLength={80} value={form.timezone} onChange={event => set('timezone', event.target.value)} list="workflow-timezones" /><datalist id="workflow-timezones">{['Asia/Jakarta', 'Asia/Singapore', 'UTC', 'Europe/London', 'America/New_York', 'America/Los_Angeles'].map(zone => <option key={zone}>{zone}</option>)}</datalist></Field></div>
    <Field label="Description / standing brief"><textarea rows={2} maxLength={4000} value={form.description} onChange={event => set('description', event.target.value)} placeholder="What should this flow accomplish every day?" /></Field>
    <div className="check-grid"><label><input type="checkbox" checked={form.scheduleEnabled} onChange={event => set('scheduleEnabled', event.target.checked)} /> Run on a schedule</label><label><input type="checkbox" checked={form.enabled} onChange={event => set('enabled', event.target.checked)} /> Enabled</label></div>
    {form.scheduleEnabled && <>
      <div className="form-grid"><Field label="Schedule type"><select value={form.schedule.type} onChange={event => setSchedule('type', event.target.value)}><option value="daily">Daily</option><option value="weekly">Weekly / weekdays</option><option value="interval">Interval</option><option value="cron">Cron (five fields)</option><option value="once">One-time</option></select></Field><Field label="Schedule timezone"><input required value={form.schedule.timezone} onChange={event => setSchedule('timezone', event.target.value)} /></Field>{['daily', 'weekly'].includes(form.schedule.type) && <Field label="Time of day"><input type="time" required value={form.schedule.time} onChange={event => setSchedule('time', event.target.value)} /></Field>}{form.schedule.type === 'interval' && <Field label="Interval (minutes)"><input type="number" min="1" max="525600" value={form.schedule.intervalMinutes} onChange={event => setSchedule('intervalMinutes', Number(event.target.value))} /></Field>}{form.schedule.type === 'cron' && <Field label="Cron expression"><input required value={form.schedule.cron} onChange={event => setSchedule('cron', event.target.value)} placeholder="0 8 * * *" /></Field>}{form.schedule.type === 'once' && <Field label="Run once at"><input type="datetime-local" required value={new Date(new Date(form.schedule.runAt).getTime() - new Date(form.schedule.runAt).getTimezoneOffset() * 60000).toISOString().slice(0, 16)} onChange={event => { if (event.target.value) setSchedule('runAt', new Date(event.target.value).toISOString()); }} /></Field>}</div>
      {form.schedule.type === 'weekly' && <fieldset><legend>Days</legend><div className="check-grid">{['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].map((day, index) => <label key={day}><input type="checkbox" checked={form.schedule.weekdays.includes(index)} onChange={event => setSchedule('weekdays', event.target.checked ? [...form.schedule.weekdays, index] : form.schedule.weekdays.filter(value => value !== index))} />{day}</label>)}</div></fieldset>}
    </>}
    <h3>Steps</h3>
    {!form.steps.length && <p className="note">No steps yet. Load a preset above or add a step manually.</p>}
    {form.steps.map((step, index) => <article className="workflow-step editor-step" key={step.id}>
      <div className="workflow-step-head"><span className="step-number">{index + 1}</span><div className="grow"><b>{step.name || 'Untitled step'}</b><small>{active.find(employee => employee.id === step.employeeId)?.name || 'Choose an employee'}</small></div><PixelButton type="button" className="danger" onClick={() => removeStep(index)}>Remove</PixelButton></div>
      <div className="form-grid"><Field label="Step name"><input required maxLength={140} value={step.name} onChange={event => updateStep(index, { name: event.target.value })} /></Field><Field label="Assigned employee"><select required value={step.employeeId} onChange={event => updateStep(index, { employeeId: event.target.value, tools: [] })}><option value="">Choose employee</option>{active.map(employee => <option key={employee.id} value={employee.id}>{employee.name} · {employee.role} · {employee.department}</option>)}</select></Field><Field label="Step type"><select value={step.kind} onChange={event => updateStep(index, { kind: event.target.value as WorkflowStep['kind'] })}><option value="agent">Agent step</option><option value="review">Research review &amp; selection</option><option value="social-plan">Social posting schedule</option></select></Field>{step.kind === 'social-plan' && <><Field label="Platform"><select value={step.platform || 'x'} onChange={event => updateStep(index, { platform: event.target.value as WorkflowStep['platform'] })}>{socialPlatforms.filter(platform => ['x', 'instagram'].includes(platform)).map(platform => <option key={platform} value={platform}>{platform.toUpperCase()}</option>)}</select></Field><Field label="Expected posts"><input type="number" min="1" max="12" value={step.expectedPosts || 3} onChange={event => updateStep(index, { expectedPosts: Number(event.target.value) })} /></Field></>}</div>
      <Field label="Step instructions"><textarea required rows={3} maxLength={30000} value={step.instructions} onChange={event => updateStep(index, { instructions: event.target.value })} placeholder="What should this employee do, and what must they hand to the next step?" /></Field>
      <Field label="Expected output"><input maxLength={3000} value={step.expectedOutput} onChange={event => updateStep(index, { expectedOutput: event.target.value })} /></Field>
      <div className="check-grid"><label><input type="checkbox" checked={step.requiresApproval} onChange={event => updateStep(index, { requiresApproval: event.target.checked })} /> Pause for my approval after this step</label></div>
      {index > 0 && <fieldset><legend>Runs after</legend><div className="check-grid">{form.steps.slice(0, index).map(previous => <label key={previous.id}><input type="checkbox" checked={step.dependsOn.includes(previous.id)} onChange={event => updateStep(index, { dependsOn: event.target.checked ? [...step.dependsOn, previous.id] : step.dependsOn.filter(id => id !== previous.id) })} />{previous.name || previous.id}</label>)}</div></fieldset>}
      {!!world.employees.find(employee => employee.id === step.employeeId)?.tools.length && <fieldset><legend>Allowed tools</legend><div className="check-grid">{world.employees.find(employee => employee.id === step.employeeId)!.tools.map(tool => <label key={tool}><input type="checkbox" checked={step.tools.includes(tool)} onChange={event => updateStep(index, { tools: event.target.checked ? [...step.tools, tool] : step.tools.filter(value => value !== tool) })} />{tool}</label>)}</div></fieldset>}
    </article>)}
    <div className="form-actions"><PixelButton type="button" onClick={addStep}>+ Add step</PixelButton><PixelButton type="button" onClick={() => useGame.getState().open('workflows')}>Back to workflows</PixelButton><PixelButton className="primary" disabled={busy || invalid}>Save workflow</PixelButton></div>
  </form>;
}
