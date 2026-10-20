# Project agent skills

Put reusable playbooks here so employees can select them in **HR → employee → Agent connection**.

```text
skills/
  my-skill/
    SKILL.md
    references/
      ...
```

`SKILL.md` format:

```markdown
---
name: my-skill
description: >
  Short explanation of when this skill should be used.
---

# My skill

Instructions the agent should follow. Reference supporting files by relative path.
```

Discovery also reads `~/.agents/skills/<name>/SKILL.md`. `SKILLS_DIR` can point at extra folders (colon-separated).

The office injects selected skill bodies into the employee’s system prompt for tasks, chat and meetings. The prompt is bounded to 20,000 characters, so keep each `SKILL.md` focused. Skills are instructions only; agents still need the relevant tools (read/bash/web) to access supporting files or run scripts.
