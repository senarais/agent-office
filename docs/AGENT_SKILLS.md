# Agent skills

Skills are reusable `SKILL.md` playbooks that an employee can add to its agent connection. The office injects the selected skill instructions into the system prompt for tasks, chat and meetings.

## Where skills are discovered

Project:

1. `skills/` — the office’s canonical playbook folder.
2. `.agents/skills/`, `.claude/skills/`, `.commandcode/skills/`.

User home:

3. `~/.agents/skills/`, `~/.claude/skills/`, `~/.commandcode/skills/`.

Custom:

4. Every folder listed in `SKILLS_DIR` (colon-separated).

Each root is scanned recursively (up to six levels), skipping dependency and build folders, so a skill can live at `engineering/research/SKILL.md` as well as directly under the root. A folder must contain `SKILL.md` (case-insensitive filename). The path below the root becomes the stable ID suffix with `/` replaced by `-` (`project:my-skill`, `project:engineering-research`, `user:apple-design`, `custom:team-skill`). If the same ID appears in multiple roots, the first root wins.

## Format

```markdown
---
name: research-brief
description: >
  Produce a concise, source-backed research brief.
---

# Research brief

1. Read the supplied sources.
2. Separate facts from assumptions.
3. Return a short brief with links.
```

`description: >` and `description: |` are supported. The body is the playbook; supporting files can sit next to `SKILL.md` and be referenced by relative path.

## Assign a skill

1. Open **HR → Edit employee**.
2. Go to **Agent connection**.
3. Check one or more **Agent skills**.
4. Save the employee file.

The skill body is added to that employee's system prompt for every task, chat turn and meeting contribution. For a **similar replacement**, the skill list is copied. A completely new replacement starts with no skills.

## Browse and preview

Open **Boss laptop → Agent skills** (or **IT terminal → Browse agent skills**). The catalog shows:

- name and source (`PROJECT`, `USER`, `CUSTOM`)
- description
- which active employees use it
- full content preview

**Refresh skills** clears the five-second discovery cache and immediately rescans every root, including newly installed folders and nested playbooks.

## Limits and security

- The skill block is bounded to 20,000 characters. Very long playbooks are truncated in the prompt; use the preview to inspect the full file.
- Skills are **instructions**, not executable plugins. The agent still needs the relevant tools (`read`, `bash`, `webfetch`, …) to use supporting files or run commands.
- Only add skills from folders you trust. A skill can influence agent behavior, just like a system prompt.
- Skill files are read from local disk; the browser catalog exposes only summaries until you press Preview.
- The catalog is not sent to external providers by itself. Only the selected skill text is included in that employee's provider request.

## Verification

`npm test` includes skill frontmatter parsing, discovery, prompt bounding, and an end-to-end assertion that a selected skill reaches the real task system prompt.
