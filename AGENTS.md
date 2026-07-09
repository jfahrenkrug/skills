# Agents

This repository contains reusable AI coding agent skills.

## Structure

- `skills/` — each subdirectory is a self-contained skill with a `SKILL.md` entrypoint
- `skills/agentic-legibility/` — the main skill; see its [SKILL.md](skills/agentic-legibility/SKILL.md) for instructions

## Commands

The `packages/legibility/` workspace hosts the TypeScript source for the `agentic-legibility` skill's bundled script:

```
npm -w legibility run build     # rebuild skills/agentic-legibility/scripts/legibility.js
npm -w legibility test          # run Vitest unit tests
npm -w legibility run typecheck # tsc --noEmit
```

The bundled script is the entrypoint the skill exposes:

```
node skills/agentic-legibility/scripts/legibility.js score /path/to/repo
node skills/agentic-legibility/scripts/legibility.js audit --check-all /path/to/repo
```

## Conventions

- Keep skill `SKILL.md` files under 100 lines; push detail into referenced sub-files.
- Each skill should work across agent platforms, not just Claude Code.
- Within each skill, reference files live in a `references` subdirectory and scripts in a `scripts` subdirectory.
