# legibility

TypeScript source for the `agentic-legibility` skill's bundled script. The Vite
build emits a single self-contained file to
`skills/agentic-legibility/scripts/legibility.js`, which is the artifact that
ships with the skill.

## Commands

```
npm -w legibility run build     # rebuild skills/agentic-legibility/scripts/legibility.js
npm -w legibility test          # run Vitest unit tests
npm -w legibility run typecheck # tsc --noEmit
```

## Adding a Language Adapter

Language-specific task-runner parsing lives in `src/languages/`. Each file
exports one adapter that implements `LanguageAdapter` from
`src/languages/types.ts`.

The package ships adapters for `javascript` (npm/pnpm/yarn/bun), `make`,
`just`, `task` (Taskfile), `cargo`, `python` (pyproject.toml + tox.ini),
`gradle`, `maven`, `dotnet` (MSBuild), `cmake`, `composer` (PHP), `rake`
(Ruby/Rails), `xcode` (xcschemes + Fastlane), `nx`, `turbo`, `mise`, and `mix`
(Elixir).

To add support for a new ecosystem (e.g. `bazel`, `pants`):

1. Create `src/languages/<ecosystem>.ts`:
   - Set `id` to the runner name (used as key in `collectTaskSurfaceByRunner`
     output).
   - Set `patterns` to the filenames/glob patterns that contain task
     definitions.
   - Implement `detect(files)` — return `true` if any of `files` matches the
     ecosystem.
   - Implement `collectTaskSurface(root, files)` — parse the task files and
     return `{ names, sourceFiles }`.

2. Register the adapter in `src/languages/index.ts` — add it to `ALL_ADAPTERS`.

3. If docs commonly reference the runner's tasks in prose (`foo run bar`), add
   a matching entry to `TASK_REFERENCE_PATTERNS` in `src/lib/markdown.ts`,
   including a `builtins` set for the runner's built-in commands so
   `--check-commands` doesn't flag canonical invocations.

4. Add unit tests in `tests/languages/adapters.test.ts`.

5. Rebuild the bundle: `npm -w legibility run build`. Commit the rebuilt
   `skills/agentic-legibility/scripts/legibility.js` alongside the TypeScript
   source change.
