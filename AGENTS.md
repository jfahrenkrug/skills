# Agents

This repository contains reusable AI coding agent skills.

## Structure

- `skills/` — each subdirectory is a self-contained skill with a `SKILL.md` entrypoint
- `skills/agentic-legibility/` — the main skill; see its [SKILL.md](skills/agentic-legibility/SKILL.md) for instructions

## Commands

No build or test commands. The repository is documentation and scripts only.

The agentic-legibility skill includes a scoring script:

```
node skills/agentic-legibility/scripts/score_repo.js /path/to/repo
```

## Conventions

- Keep skill `SKILL.md` files under 100 lines; push detail into referenced sub-files.
- Each skill should work across agent platforms, not just Claude Code.
- Reference files go in `references/`, scripts in `scripts/`.
