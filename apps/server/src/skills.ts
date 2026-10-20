import { readdirSync, readFileSync, realpathSync } from 'node:fs';
import type { Dirent } from 'node:fs';
import { homedir } from 'node:os';
import { basename, delimiter, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { SkillPreview, SkillSource, SkillSummary } from '../../../packages/shared/src/skills';

export interface SkillRoot { path: string; source: SkillSource }
export interface DiscoveredSkill extends SkillSummary { directory: string; file: string; body: string }

const projectRoot = fileURLToPath(new URL('../../../', import.meta.url));
const CACHE_MS = 5000;
const MAX_SCAN_DEPTH = 6;
const MAX_SCAN_DIRS = 2000;
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', '.venv', 'venv', '__pycache__', '.next', 'coverage', '.cache']);
let cache: { at: number; skills: DiscoveredSkill[] } | undefined;

/** Frontmatter parser for SKILL.md: supports plain, quoted, `>` and `|` values. */
export function parseSkillMarkdown(text: string) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)([\s\S]*)$/.exec(text);
  if (!match) return { meta: {} as Record<string, string>, body: text.trim() };
  const lines = match[1].split(/\r?\n/); const meta: Record<string, string> = {};
  for (let index = 0; index < lines.length; index++) {
    const entry = /^([A-Za-z0-9_.-]+):\s*(.*)$/.exec(lines[index]);
    if (!entry) continue;
    const key = entry[1]; let value = entry[2].trim();
    if (value === '>' || value === '|' || value === '') {
      const block: string[] = [];
      while (index + 1 < lines.length) {
        const next = lines[index + 1];
        if (/^\s+/.test(next) || next.trim() === '') { block.push(next.replace(/^\s{1,6}/, '')); index++; }
        else break;
      }
      value = value === '|' ? block.join('\n').trim() : block.join(' ').replace(/\s+/g, ' ').trim();
    }
    meta[key] = value.replace(/^["']|["']$/g, '').trim();
  }
  return { meta, body: match[2].trim() };
}

function readSkill(file: string, source: SkillSource, directory: string, dirName: string, idName = dirName): DiscoveredSkill {
  const raw = readFileSync(file, 'utf8').slice(0, 200_000);
  const { meta, body } = parseSkillMarkdown(raw);
  const name = (meta.name || dirName).trim().slice(0, 160);
  const description = (meta.description || body.split('\n').find(line => line.trim()) || `${dirName} skill`).replace(/\s+/g, ' ').trim().slice(0, 500);
  return { id: `${source}:${idName.replace(/[^a-zA-Z0-9._-]/g, '-').slice(0, 120)}`, name, description, source, directory, file, body: body.slice(0, 200_000) };
}

function uniqueRoots(roots: SkillRoot[]) {
  const seen = new Set<string>();
  return roots.filter(root => {
    try { const path = realpathSync(root.path); if (seen.has(path)) return false; seen.add(path); return true; }
    catch { return false; }
  });
}

export function defaultSkillRoots(): SkillRoot[] {
  const roots: SkillRoot[] = [];
  const custom = (process.env.SKILLS_DIR || '').split(delimiter).flatMap(value => value.split(',')).map(value => value.trim()).filter(Boolean);
  for (const path of custom) roots.push({ path, source: 'custom' });
  for (const path of ['skills', join('.agents', 'skills'), join('.claude', 'skills'), join('.commandcode', 'skills')]) roots.push({ path: join(projectRoot, path), source: 'project' });
  for (const path of [join('.agents', 'skills'), join('.claude', 'skills'), join('.commandcode', 'skills')]) roots.push({ path: join(homedir(), path), source: 'user' });
  return uniqueRoots(roots);
}

interface SkillCandidate { dirName: string; idName: string; directory: string; file: string }

/** Recursively scan a root so nested playbooks and all agent skill folders are picked up. */
function collectSkillCandidates(rootPath: string): SkillCandidate[] {
  const candidates: SkillCandidate[] = [];
  let scanned = 0;
  const walk = (directory: string, relative: string, depth: number) => {
    if (scanned++ >= MAX_SCAN_DIRS || depth > MAX_SCAN_DEPTH) return;
    let entries: Dirent[];
    try { entries = readdirSync(directory, { withFileTypes: true }); } catch { return; }
    const doc = entries.find(entry => entry.isFile() && entry.name.toLowerCase() === 'skill.md');
    if (doc) candidates.push({ dirName: relative ? basename(relative) : basename(rootPath), idName: relative || basename(rootPath), directory, file: join(directory, doc.name) });
    for (const entry of entries) {
      if (!entry.isDirectory() || SKIP_DIRS.has(entry.name)) continue;
      walk(join(directory, entry.name), relative ? `${relative}/${entry.name}` : entry.name, depth + 1);
    }
  };
  walk(rootPath, '', 0);
  return candidates;
}

export function discoverSkillsFromRoots(roots: SkillRoot[]): DiscoveredSkill[] {
  const skills: DiscoveredSkill[] = []; const seen = new Set<string>();
  for (const root of uniqueRoots(roots)) {
    for (const candidate of collectSkillCandidates(root.path)) {
      try {
        const skill = readSkill(candidate.file, root.source, candidate.directory, candidate.dirName, candidate.idName);
        if (seen.has(skill.id)) continue;
        seen.add(skill.id); skills.push(skill);
      } catch { /* skip unreadable skill */ }
      if (skills.length >= 500) break;
    }
    if (skills.length >= 500) break;
  }
  return skills.sort((a, b) => a.source.localeCompare(b.source) || a.name.localeCompare(b.name));
}

export function discoverSkills(force = false): DiscoveredSkill[] {
  if (!force && cache && Date.now() - cache.at < CACHE_MS) return cache.skills;
  cache = { at: Date.now(), skills: discoverSkillsFromRoots(defaultSkillRoots()) };
  return cache.skills;
}

export function invalidateSkills() { cache = undefined; }
export const skillCatalog = (): SkillSummary[] => discoverSkills().map(({ id, name, description, source }) => ({ id, name, description, source }));

export function skillPreview(id: string): SkillPreview {
  const skill = discoverSkills().find(item => item.id === id);
  if (!skill) throw new Error('Skill not found');
  return { id: skill.id, name: skill.name, description: skill.description, source: skill.source, content: `# ${skill.name}\n\n${skill.description}\n\n${skill.body}` };
}

/** Build a bounded system-prompt block for the skills selected on an agent connection. */
export function buildSkillPrompt(skills: DiscoveredSkill[], ids: string[], maxChars = 20_000) {
  const selected = new Set(ids); const chosen = skills.filter(skill => selected.has(skill.id));
  if (!chosen.length) return '';
  const parts = ['Selected agent skills. Use these playbooks when relevant. If a skill references resource files, read them from the listed directory when your tools allow it.'];
  let remaining = maxChars;
  for (const skill of chosen) {
    if (remaining <= 0) break;
    const header = `\n--- SKILL: ${skill.name} (${skill.id}) ---\n${skill.description}\nDirectory: ${skill.directory}\n`;
    const body = skill.body.slice(0, Math.max(0, remaining - header.length));
    parts.push(header + body);
    remaining -= header.length + body.length;
  }
  return parts.join('\n');
}
