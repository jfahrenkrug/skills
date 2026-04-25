import { PLANS_TEMPLATE } from './plans_template.js';

export interface TemplateFile {
   path: string;
   contents: string;
}

const AGENTS_MD = [
   '# Agents',
   '',
   'This file is the canonical entry point for AI coding agents working in',
   'this repository. Keep it short — under one screen — and link out to',
   'detail rather than inlining it. Other agent tools (Claude, Cursor,',
   'Copilot, Gemini, Aider, Windsurf) read this file by convention; alias',
   'files like `CLAUDE.md` should include or symlink to it rather than',
   'duplicate its content.',
   '',
   '## Orientation',
   '',
   '- See [docs/README.md](docs/README.md) for a map of the docs tree.',
   '- See [.agents/PLANS.md](.agents/PLANS.md) for ExecPlan conventions.',
   '- Active execution plans live under `docs/exec-plans/active/`.',
   '- Completed plans live under `docs/exec-plans/completed/`.',
   '',
   '## Primary commands',
   '',
   'Replace this list with the actual commands a fresh agent needs to',
   'install dependencies, run tests, and start the project.',
   '',
   '- Install: _TODO_',
   '- Test:    _TODO_',
   '- Lint:    _TODO_',
   '- Run:     _TODO_',
   '',
   '## Architecture',
   '',
   'Describe module boundaries and where each subsystem lives, or link to',
   'a `docs/repo-map.md` / `ARCHITECTURE.md` file that does.',
   '',
   '## Working agreements',
   '',
   '- Follow the ExecPlan format described in `.agents/PLANS.md` for any',
   '  non-trivial change.',
   '- Keep this file updated as commands and architecture evolve — agents',
   '  read it cold.',
   '',
].join('\n');

const CLAUDE_MD = '@AGENTS.md\n';

const DOCS_README = [
   '# Documentation',
   '',
   'This directory holds long-form project documentation. Two conventions',
   'matter most for AI coding agents:',
   '',
   '- `exec-plans/active/` — execution plans currently being worked on.',
   '- `exec-plans/completed/` — finished plans, kept for posterity.',
   '',
   'The format and lifecycle of an ExecPlan is defined in',
   '[../.agents/PLANS.md](../.agents/PLANS.md).',
   '',
   '## Suggested layout',
   '',
   '- `docs/repo-map.md` or `ARCHITECTURE.md` — one-screen architecture',
   '  index covering module boundaries and allowed dependency directions.',
   '- `docs/adr/` — architecture decision records, with a directory-local',
   '  `README.md` index and consistent supersession links.',
   '',
].join('\n');

export function getTemplates(): TemplateFile[] {
   return [
      { path: 'AGENTS.md', contents: AGENTS_MD },
      { path: 'CLAUDE.md', contents: CLAUDE_MD },
      { path: '.agents/PLANS.md', contents: PLANS_TEMPLATE },
      { path: 'docs/README.md', contents: DOCS_README },
      { path: 'docs/exec-plans/active/.gitkeep', contents: '' },
      { path: 'docs/exec-plans/completed/.gitkeep', contents: '' },
   ];
}
