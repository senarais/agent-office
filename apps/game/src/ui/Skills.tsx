import { useState } from 'react';
import type { SkillPreview } from '../../../../packages/shared/src/skills';
import { api, useGame } from '../state';
import { Empty, Field, PixelButton, useAction } from './kit';

const sourceName = (source: string) => source === 'project' ? 'PROJECT' : source === 'user' ? 'USER' : 'CUSTOM';

export function Skills() {
  const world = useGame(s => s.world!); const { run, busy } = useAction();
  const [query, setQuery] = useState(''); const [preview, setPreview] = useState<SkillPreview | null>(null);
  const skills = world.skills.filter(skill => `${skill.name} ${skill.description} ${skill.id}`.toLowerCase().includes(query.toLowerCase()));
  const refresh = () => void run(async () => { await api('/skills/refresh', {}); useGame.getState().toast('Agent skills refreshed.'); });
  const show = (id: string) => void run(async () => { setPreview(await api<SkillPreview>('/skills/preview', { id })); });
  return <>
    <div className="section-heading"><div><span className="eyebrow">AGENT SKILLS / PLAYBOOKS</span><h2>Give your agents a craft.</h2><p>Selected skills are added to that employee’s system prompt for tasks, chat and meetings.</p></div><PixelButton className="primary" disabled={busy} onClick={refresh}>Refresh skills</PixelButton></div>
    <p className="note">Skills are discovered from <code>skills/&lt;name&gt;/SKILL.md</code> in this project and <code>~/.agents/skills/&lt;name&gt;/SKILL.md</code>. Add a folder with YAML frontmatter (<code>name</code>, <code>description</code>) to make it available. <code>SKILLS_DIR</code> can point at extra folders.</p>
    <Field label="Search skills"><input value={query} onChange={event => setQuery(event.target.value)} placeholder="design, research, writing…" /></Field>
    {!skills.length ? <Empty>No skills found. Add a <code>SKILL.md</code> in <code>skills/</code> or <code>~/.agents/skills/</code>, then refresh.</Empty> : <div className="skill-list">{skills.map(skill => {
      const users = world.employees.filter(employee => employee.employmentStatus === 'active' && (employee.skills || []).includes(skill.id));
      return <article className="skill-row" key={skill.id}><div className="skill-mark">SK</div><div className="grow"><h3>{skill.name} <span className="tag">{sourceName(skill.source)}</span></h3><p>{skill.description}</p><small>{skill.id}{users.length ? ` · used by ${users.map(employee => employee.name).join(', ')}` : ' · not assigned yet'}</small></div><PixelButton disabled={busy} onClick={() => show(skill.id)}>Preview</PixelButton></article>;
    })}</div>}
    {preview && <section className="skill-preview"><div className="section-heading"><div><span className="eyebrow">SKILL PREVIEW / {sourceName(preview.source)}</span><h3>{preview.name}</h3><p>{preview.description}</p></div><PixelButton onClick={() => setPreview(null)}>Close preview</PixelButton></div><pre className="document">{preview.content}</pre></section>}
  </>;
}
