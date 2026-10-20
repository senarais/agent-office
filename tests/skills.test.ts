import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Engine } from '../apps/server/src/engine';
import { Store } from '../apps/server/src/database';
import { defaultAppearance } from '../packages/shared/src/types';
import { buildSkillPrompt, discoverSkillsFromRoots, invalidateSkills, parseSkillMarkdown } from '../apps/server/src/skills';

test('SKILL.md frontmatter supports block descriptions and markdown bodies', () => {
  const parsed = parseSkillMarkdown('---\nname: research\ndescription: >\n  A careful\n  research playbook.\n---\n\n# Steps\n\nSearch first.\n');
  assert.equal(parsed.meta.name, 'research');
  assert.equal(parsed.meta.description, 'A careful research playbook.');
  assert.match(parsed.body, /Search first/);
});

test('skill discovery reads project folders and builds a bounded employee prompt', () => {
  const root = mkdtempSync(join(tmpdir(), 'pt-skills-'));
  try {
    mkdirSync(join(root, 'research'));
    writeFileSync(join(root, 'research', 'SKILL.md'), '---\nname: Deep Research\ndescription: Verify sources and cite evidence.\n---\n\n# Deep Research\n\nAlways cross-check two sources.\n');
    const skills = discoverSkillsFromRoots([{ path: root, source: 'project' }]);
    assert.equal(skills.length, 1);
    assert.equal(skills[0].id, 'project:research');
    assert.equal(skills[0].name, 'Deep Research');
    assert.equal(skills[0].description, 'Verify sources and cite evidence.');
    const prompt = buildSkillPrompt(skills, ['project:research']);
    assert.match(prompt, /SKILL: Deep Research/);
    assert.match(prompt, /Always cross-check two sources/);
    assert.match(prompt, /Directory:/);
    assert.equal(buildSkillPrompt(skills, ['missing']), '');
  } finally { rmSync(root, { recursive: true, force: true }); }
});

async function eventually(check: () => boolean) { for (let i = 0; i < 400; i++) { if (check()) return; await new Promise(resolve => setTimeout(resolve, 10)); } assert.fail('Timed out waiting for skill prompt'); }

test('selected skills are injected into the real task system prompt', async (t: TestContext) => {
  const root = mkdtempSync(join(tmpdir(), 'pt-skills-agent-')); const data = mkdtempSync(join(tmpdir(), 'pt-skills-data-'));
  const previous = process.env.SKILLS_DIR;
  mkdirSync(join(root, 'alpha')); writeFileSync(join(root, 'alpha', 'SKILL.md'), '---\nname: Alpha Playbook\ndescription: Use the alpha checklist.\n---\n\nUSE THE ALPHA CHECKLIST before answering.\n');
  process.env.SKILLS_DIR = root; invalidateSkills();
  const engine = new Engine(new Store(data));
  t.after(() => { engine.stop(); rmSync(root, { recursive: true, force: true }); rmSync(data, { recursive: true, force: true }); if (previous) process.env.SKILLS_DIR = previous; else delete process.env.SKILLS_DIR; invalidateSkills(); });
  const provider = await engine.configureProvider({ name: 'Skill fixture', kind: 'generic', baseUrl: 'http://127.0.0.1:1/v1', model: 'skill-test' });
  let system = '';
  engine.providerFactory = () => ({ listModels: async () => ['skill-test'], execute: async request => { system = request.system; request.onText('done'); return { text: 'done' }; } });
  const employee = engine.hire({ name: 'Skilled', role: 'Research Analyst', department: 'Research', appearance: defaultAppearance, providerId: provider.id, model: 'skill-test', skills: ['custom:alpha'] });
  engine.task({ employeeId: employee.id, title: 'Use the skill', instructions: 'Do the task' });
  for (let i = 0; i < 220; i++) engine.tick(.1);
  await eventually(() => system.includes('Alpha Playbook'));
  assert.match(system, /USE THE ALPHA CHECKLIST before answering/);
  assert.match(system, /Directory:/);
});
