# Language adapter expansion for TIOBE top 20 plus Ruby/Rails and Objective-C/Xcode

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds. This plan is governed by [PLANS.md](../../../skills/agentic-legibility/PLANS.md) at the repository root of the `agentic-legibility` skill; the present document must be maintained in accordance with it.


## Purpose / Big Picture

The `agentic-legibility` skill ships a Node script at `skills/agentic-legibility/scripts/legibility.js` that scores repositories and runs mechanical audit checks. Part of its behavior depends on per-language "adapters" that know how to detect a language or framework in a repository and, where the ecosystem has a declarative task runner, to enumerate the runnable task names defined there. Adapters are used by three consumer paths: (1) the `list-scopes` command that proposes candidate sub-projects in a monorepo, (2) the score report's "task entrypoints" dimension, and (3) the `audit --check-commands` and `audit --check-agents-md` checks that flag Markdown references to tasks not defined in the task surface.

Today the skill ships five adapters: `javascript` (package.json), `make` (Makefile), `just` (justfile), `task` (Taskfile.yml), and `cargo` (.cargo/config.toml). That leaves every other ecosystem on the TIOBE index unrepresented, along with Ruby and the Apple toolchain. For a user with a Python, Java, Kotlin, C#, C++, PHP, Ruby/Rails, or iOS project, the skill is silent about task entrypoints and cannot raise `--check-commands` findings when a doc references a task that no longer exists. This plan closes that gap by adding adapters for the following eight ecosystems:

- Python — `pyproject.toml` (PEP 621 `[project.scripts]`, Poetry `[tool.poetry.scripts]`, PDM `[tool.pdm.scripts]`, Hatch environment scripts), `tox.ini` environments, and `setup.py` detection.
- JVM via Gradle — `build.gradle` and `build.gradle.kts` (Groovy and Kotlin DSL task declarations).
- JVM via Maven — `pom.xml` profile ids and plugin goals.
- .NET — MSBuild `*.csproj`, `*.fsproj`, and `*.vbproj` `<Target Name="..." />` elements.
- CMake — `CMakeLists.txt` `add_custom_target` and `add_executable` declarations.
- PHP — `composer.json` `scripts` map.
- Ruby / Rails — `Rakefile` (and `lib/tasks/*.rake`) `task :name` declarations with `namespace :ns do` prefixes.
- Apple (Swift + Objective-C) — Xcode scheme files under `*.xcodeproj/xcshareddata/xcschemes/*.xcscheme` and Fastlane `Fastfile` `lane :name` blocks.

User-visible behavior after the change: running `node skills/agentic-legibility/scripts/legibility.js score /path/to/repo` on a repository in any of the above ecosystems will populate the `task_surface` and `task_surface_files` fields of the score report with runnable task names parsed from the repo's own files. Running `audit --check-commands /path/to/repo` on a Ruby repo whose `README.md` mentions `rake db:migrate` will surface a warning if `db:migrate` is not actually defined in the `Rakefile` or in any file under `lib/tasks/`. Running `list-scopes` on a monorepo that contains a `client/` directory with its own `build.gradle.kts` and a `server/` directory with its own `pom.xml` will propose both as distinct scopes. None of this is possible on `main` today.


## Progress

Use the following checklist to track granular progress. Every stopping point should be documented here. Timestamps use `YYYY-MM-DD HH:MMZ` (UTC).

- [x] (2026-04-25 00:00Z) ExecPlan drafted with milestones M1–M9 and placed under `docs/exec-plans/active/`.
- [x] (2026-04-25 00:17Z) M1 — Python adapter (`python.ts`) implemented with parser for `[project.scripts]`, `[tool.poetry.scripts]`, `[tool.pdm.scripts]`, `[tool.hatch.envs.*.scripts]`, plus `tox.ini` `envlist` detection; unit tests added; `ALL_ADAPTERS` updated. 65/65 tests pass.
- [x] (2026-04-25 00:19Z) M2 — Gradle adapter (`gradle.ts`) implemented with parser for Groovy `task foo {`, Kotlin DSL `tasks.register("foo")` / `tasks.create(...)`, and `val foo by tasks.registering/creating`; unit tests added; registered. 70/70 tests pass.
- [x] (2026-04-25 00:20Z) M3 — Maven adapter (`maven.ts`) implemented with parser for `<profile><id>NAME</id>` and `<goal>NAME</goal>` elements; unit tests added; registered. 74/74 tests pass.
- [x] (2026-04-25 00:21Z) M4 — .NET adapter (`dotnet.ts`) implemented with parser for `<Target Name="NAME">` elements in MSBuild project files; unit tests added; registered. 77/77 tests pass.
- [x] (2026-04-25 07:43Z) M5 — CMake adapter (`cmake.ts`) implemented with parser for `add_custom_target`, `add_executable`, and `add_library`; unit tests added; registered.
- [x] (2026-04-25 07:43Z) M6 — Composer adapter (`composer.ts`) for PHP implemented with parser for `composer.json` `scripts` map; unit tests added; registered.
- [x] (2026-04-25 07:43Z) M7 — Rake adapter (`rake.ts`) for Ruby/Rails implemented with parser for `task :NAME` plus `namespace :NS do` (string and symbol forms), with nested-namespace prefix resolution and a stack that distinguishes namespace blocks from generic `do/end` blocks; unit tests added; registered.
- [x] (2026-04-25 07:43Z) M8 — Xcode adapter (`xcode.ts`) implemented with parser for `*.xcscheme` filenames (stem == scheme name) and Fastlane `lane :NAME do` declarations; unit tests added; registered. 91/91 tests pass.
- [x] (2026-04-25 07:44Z) M9 — Wire-up complete: `TASK_FILE_NAMES` and `MANIFEST_FILE_NAMES` extended in `index.ts`; `RUNNER_LABEL` extended in `audit_repo.ts` for all eight new ids; `TASK_REFERENCE_PATTERNS` in `lib/markdown.ts` extended with `gradle`/`./gradlew`, `mvn`/`mvnw`, `composer [run]`, and `rake` / `bundle exec rake` patterns; SKILL.md adapter list refreshed; bundle rebuilt (92.01 kB); `npm -w legibility run verify-bundle` reports 6 passed / 0 failed; `npm -w legibility test` reports 91 passed; `tsc --noEmit` clean.


## Surprises & Discoveries

Document unexpected behaviors, bugs, optimizations, or insights as they surface during implementation. Provide concise evidence.

- Observation: The existing skill ships a minimal TOML-subset parser in `rust.ts` (`parseCargoAliases`) that handles flat `[section]` tables with `key = "value"` lines. Evidence: `packages/legibility/src/languages/rust.ts` lines 6–27. This sets the precedent that full TOML compliance is unnecessary for task-surface extraction; the Python adapter follows the same "handle common cases by line-based parsing" approach rather than pulling in a TOML dependency. The skill's zero-runtime-dependency posture (enforced by the Vite bundle externalizing Node built-ins and nothing else) means introducing `@iarna/toml` or similar would break that invariant.

- Observation: There is a pre-existing mismatch between adapter ids and markdown-prose runner ids for JavaScript. Evidence: `packages/legibility/src/lib/markdown.ts` line 243 uses `runner: 'npm'` in `TASK_REFERENCE_PATTERNS`, while the adapter id in `packages/legibility/src/languages/javascript.ts` is `'javascript'`, so the lookup `surfaceByRunner[ref.runner]` on `audit_repo.ts:269` returns `undefined` for npm-prefixed references and they are silently skipped. This ExecPlan intentionally does not fix that bug; it follows the established convention by aligning new adapter ids with their prose runner names (e.g., adapter id `gradle` matches the `gradle` / `./gradlew` prose pattern) so no further mismatch is introduced.

- Observation: The `extractTaskReferences` regex family in `lib/markdown.ts` uses `[A-Za-z0-9_.:-]+` for task tokens, which already supports colon-prefixed names like `db:migrate` and `test:unit`. Evidence: line 243–247 of `lib/markdown.ts`. Rake's `namespace :db do; task :migrate do end end` produces a fully-qualified token `db:migrate` in prose ("`rake db:migrate`") and the same form in the parser's output, so matching is natural.

- Observation: Xcode scheme files contain the scheme name only as XML content under `<BuildAction>...<BuildActionEntries>`, but the _shared_ scheme filename itself is the canonical scheme name used on the command line (`xcodebuild -scheme <filename-minus-extension>`). Evidence: running `ls MyApp.xcodeproj/xcshareddata/xcschemes/` on a working Xcode project shows files named after the schemes. The adapter uses filename stem as the scheme name to avoid XML parsing.


## Decision Log

Record every decision made while working on the plan in the form `Decision: … Rationale: … Date/Author: …`.

- Decision: Add adapters for eight new ecosystems (Python, Gradle, Maven, .NET, CMake, Composer/PHP, Rake/Ruby, Xcode/Apple) and skip the remaining TIOBE top-20 languages (SQL, R, Delphi/Object Pascal, Scratch, Perl, Fortran, MATLAB, Assembly, Ada). Rationale: adapters are only valuable when the ecosystem has a declarative task-runner file the script can parse. SQL has no project-level task runner. Scratch is a block-based GUI language with no CLI artifacts. MATLAB, Assembly, Fortran, Delphi, and Ada either have no canonical task runner or route through Make/CMake which are already supported. R's `DESCRIPTION` is package metadata, not a task list. Perl's `Makefile.PL` generates a `Makefile` already covered by the `make` adapter. Go has no first-class task runner and almost always uses `Makefile` or `Taskfile.yml`, both already supported. Date/Author: 2026-04-25 / Claude.

- Decision: Merge Swift and Objective-C under a single `xcode` adapter rather than splitting them. Rationale: both languages are built with the same toolchain (`xcodebuild`) and share project structure (`*.xcodeproj`, `*.xcworkspace`, Fastlane). The runnable "tasks" for both are Xcode schemes and Fastlane lanes, parsed from identical filesystem locations. A split would duplicate every file pattern. Date/Author: 2026-04-25 / Claude.

- Decision: Split JVM languages into two adapters, `gradle` and `maven`, rather than one unified `jvm`. Rationale: Gradle and Maven have entirely different file formats (Groovy/Kotlin DSL vs. XML) and different task discovery rules. Combining them would force a single parser to branch on filename, hurting clarity. Kotlin, Java, Scala, and Groovy all use one of the two build tools, so two adapters cover all JVM projects without duplication. Date/Author: 2026-04-25 / Claude.

- Decision: Use line-based and regex-based parsers rather than bundling proper TOML, XML, or JSON-schema libraries. Rationale: the skill's zero-runtime-dependency invariant is a load-bearing property of its portability claim. The existing `cargo` and `javascript` adapters already set the precedent. False negatives (an exotic nested structure the parser misses) are acceptable because the parsers are best-effort task-surface discovery, not compilers. Date/Author: 2026-04-25 / Claude.

- Decision: Only extend `TASK_REFERENCE_PATTERNS` in `lib/markdown.ts` for adapters whose prose form is a plain `<runner> <task>` command (Gradle, Maven, Composer, Rake). Skip Python, CMake, .NET, and Xcode for prose detection because their invocation grammar is heterogeneous (`poetry run`, `tox -e`, `nox -s`, `cmake --build . --target`, `dotnet build -t:Target`, `xcodebuild -scheme`) and false positives would outweigh the signal. Date/Author: 2026-04-25 / Claude.

- Decision: Add `bundle exec rake` as a second regex for Rake prose detection, since `bundle exec` is the canonical way to run rake in a Bundler-managed Ruby project. Rationale: skipping it would miss the majority of real-world Rails docs. Date/Author: 2026-04-25 / Claude.

- Decision: Use `./gradlew` and `gradle` both as prose runner prefixes for the `gradle` adapter. Rationale: the wrapper (`gradlew`) is the officially recommended invocation in Gradle docs, and most real-world READMEs use it. Date/Author: 2026-04-25 / Claude.


## Outcomes & Retrospective

Summarize outcomes, gaps, and lessons learned at completion of the plan.

Outcome: The skill now ships thirteen language adapters (five original plus eight new: `python`, `gradle`, `maven`, `dotnet`, `cmake`, `composer`, `rake`, `xcode`). `ALL_ADAPTERS` went from five to thirteen entries. `collectTaskSurfaceByRunner` now returns thirteen keys. Unit tests cover all new parsers and `detect()` methods; the `collectAllTaskSurfaces` integration test was expanded to verify the new adapters cooperate on a mixed-language temp directory. The Vite bundle rebuild produced an updated `skills/agentic-legibility/scripts/legibility.js` that passes all six `verify-bundle` smoke tests.

Measured impact: on the skills repo itself, `node skills/agentic-legibility/scripts/legibility.js list-metrics` and `audit --check-artifacts` continue to work unchanged; on a fresh scratch repo with a single `pyproject.toml` containing `[tool.poetry.scripts] hello = "pkg:main"`, the score report's `task_surface` now includes `hello` where previously it was empty.

Gaps: prose-detection in `--check-commands` is only extended for Gradle, Maven, Composer, and Rake. Python, .NET, CMake, and Xcode task-surface entries are visible in the scorecard and in `audit --check-agents-md` path resolution, but Markdown prose that mentions a missing Python/tox/CMake/dotnet/xcode task is not flagged. Addressing that would require per-runner prose grammars, which were out of scope for this plan per the Decision Log.

Lessons: the adapter pattern scales cleanly — each new adapter is ~40–70 lines and a self-contained unit test suite. The zero-dependency constraint was not a blocker for any of the eight ecosystems. The Vite bundle rebuild remains idempotent: a second `npm -w legibility run build` produces a byte-identical `legibility.js`.


## Context and Orientation

The repository is a monorepo with two top-level code locations. Agent-facing skills live under `skills/`, and the `agentic-legibility` skill under `skills/agentic-legibility/` exposes a single bundled Node script at `skills/agentic-legibility/scripts/legibility.js`. That script is generated, not hand-edited. Its TypeScript source lives in the `packages/legibility/` npm workspace (see `packages/legibility/package.json` and the root `package.json` `"workspaces": ["packages/*"]` field). A Vite config at `packages/legibility/vite.config.ts` bundles the TypeScript into the committed `legibility.js` and runs the Vitest test runner on the same tree.

Language adapters live at `packages/legibility/src/languages/`. Each adapter is a single file that exports (1) a named parser function for unit testing and (2) an `adapter` object that conforms to the `LanguageAdapter` interface defined in `packages/legibility/src/languages/types.ts`:

    export interface LanguageAdapter {
       readonly id: string;
       readonly displayName: string;
       readonly patterns: string[];
       detect(files: string[]): boolean;
       collectTaskSurface(root: string, files: string[]): Promise<TaskSurfaceResult>;
    }

The `id` is the key used in `collectTaskSurfaceByRunner`'s output and must align with the runner prefix used in Markdown prose (e.g., `make` matches `make foo`, `cargo` matches `cargo foo`). The `patterns` field is a list of filenames or glob-style patterns that contain task definitions; those paths are passed to `readCandidates(files, root, patterns)` in `packages/legibility/src/lib/fs_walk.ts` which reads them with a size cap.

Adapters are registered in a single module: `packages/legibility/src/languages/index.ts`. That module exports `ALL_ADAPTERS: LanguageAdapter[]`, a `TASK_FILE_NAMES` set (lowercase filenames that count as task-definition files for scoring), a `MANIFEST_FILE_NAMES` set (lowercase filenames that indicate a language is present regardless of whether they define tasks), and three async helpers: `collectAllTaskSurfaces`, `collectTaskSurfaceByRunner`, and `categorizeTaskSurface`.

Unit tests for all adapters live in a single file at `packages/legibility/tests/languages/adapters.test.ts`. The test file uses Vitest and follows a consistent pattern: one `describe` block for each parser function testing a few happy-path inputs and edge cases, one `describe` block for adapter `detect()` behavior, and an integration `describe` that writes task files to a temp directory and asserts that `collectAllTaskSurfaces` merges them correctly.

Two consumer modules depend on adapters but are not themselves adapters. `packages/legibility/src/audit_repo.ts` consumes `collectTaskSurfaceByRunner` (line 260) and holds a `RUNNER_LABEL` map (line 246) that translates adapter ids into human-readable strings for finding messages. `packages/legibility/src/lib/markdown.ts` holds `TASK_REFERENCE_PATTERNS` (lines 243–247), a list of `{ runner, regex }` entries that scan prose for commands like `make foo` or `cargo test` and produce `TaskReference { runner, token, line }` records.

The bundle rebuild command is `npm -w legibility run build` from the repository root. The test command is `npm -w legibility test`. The bundle smoke test is `npm -w legibility run verify-bundle`, which runs the committed `legibility.js` against the repo itself to check shebang, banner, `--help`, `list-metrics`, `score`, and `audit --check-artifacts`.


## Plan of Work

The work proceeds in nine milestones. Milestones one through eight each add one adapter by creating a new file at `packages/legibility/src/languages/<name>.ts`, appending unit tests to `packages/legibility/tests/languages/adapters.test.ts`, and registering the adapter in `packages/legibility/src/languages/index.ts`. Milestone nine handles cross-cutting wire-up: extending `MANIFEST_FILE_NAMES`, `TASK_FILE_NAMES`, `RUNNER_LABEL`, and `TASK_REFERENCE_PATTERNS`; refreshing SKILL.md's adapter guide; rebuilding the bundle; and running verify-bundle plus a smoke run on the skills repo itself.

For each adapter the parser function takes the file text as a string and returns a `Set<string>` of task names. The adapter object wires that parser into the interface. The `detect` method returns `true` if the candidate filename is present in the `files` array; most adapters use a simple `endsWith` or `split('/').pop()` check following the existing conventions.

The Python adapter recognizes three signals. `pyproject.toml` is scanned for the following flat TOML tables: `[project.scripts]`, `[tool.poetry.scripts]`, `[tool.pdm.scripts]`, and any `[tool.hatch.envs.<name>.scripts]` environment table. Keys in those tables become task names. `tox.ini` is scanned for `envlist = env1, env2, env3` (continuation-line-aware); each env name becomes a task with a `tox:` prefix. `setup.py` is scanned only for presence; it does not contribute task names but its file in `sourceFiles` indicates Python presence for downstream consumers.

The Gradle adapter recognizes both Groovy (`build.gradle`) and Kotlin DSL (`build.gradle.kts`) file variants. The parser accepts four common task-declaration syntaxes: Groovy `task foo {`, Groovy `task foo(type: X) {`, Kotlin `tasks.register("foo") {`, and Kotlin `val foo by tasks.registering`. It returns task names from all four.

The Maven adapter parses `pom.xml` for `<profile><id>NAME</id>` elements and for `<execution><goals><goal>NAME</goal></goals></execution>` entries. XML parsing is done line-based with regex; full XML compliance is not required because Maven tooling writes these tags in predictable shapes.

The .NET adapter parses MSBuild project files (`*.csproj`, `*.fsproj`, `*.vbproj`) for `<Target Name="NAME">` elements. Target names become task surface entries.

The CMake adapter parses `CMakeLists.txt` for `add_custom_target(NAME ...)` and `add_executable(NAME ...)` calls. The first identifier inside the parentheses is the target name.

The Composer adapter parses `composer.json` (JSON) and reads the `scripts` map, identically to `package.json`. Script names become task surface entries.

The Rake adapter parses `Rakefile`, `rakefile`, and any file under `lib/tasks/` with a `.rake` extension. It recognizes `task :NAME` declarations at the top level and `namespace :NS do ... task :INNER ... end` nested declarations. Namespace prefixes are joined with colons (`NS:INNER`) to match the `rake NS:INNER` invocation form.

The Xcode adapter parses two sources. Scheme filenames under `*.xcodeproj/xcshareddata/xcschemes/*.xcscheme` are reported by stem (the scheme name equals the filename without the `.xcscheme` extension). Fastlane `Fastfile` (or `fastlane/Fastfile`) is scanned for `lane :NAME do` declarations.

The wire-up milestone adds new filenames to `MANIFEST_FILE_NAMES` (`composer.json`, `gemfile`, `*.csproj` handled via suffix set, `cmakelists.txt`, `pom.xml`, `build.gradle`, `build.gradle.kts`, `tox.ini`, `fastfile`, `rakefile`) and to `TASK_FILE_NAMES` (`rakefile`, `composer.json`, `pyproject.toml`, `cmakelists.txt`, `build.gradle`, `build.gradle.kts`, `pom.xml`, `fastfile`). `RUNNER_LABEL` gains entries for all new adapter ids. `TASK_REFERENCE_PATTERNS` gains regexes for `gradle`, `./gradlew`, `mvn`, `composer`, `rake`, and `bundle exec rake`.


## Concrete Steps

All commands run from `/Users/johannes/Code/skills/` (the repository root) unless noted otherwise.

Step 1 (per milestone M1–M8). Create the adapter file at `packages/legibility/src/languages/<name>.ts` following the template of `rust.ts`. Export a named parser function and an adapter object.

Step 2 (per milestone M1–M8). Append unit tests to `packages/legibility/tests/languages/adapters.test.ts`, covering the parser happy path, at least one malformed-input case, and adapter `detect()`.

Step 3 (per milestone M1–M8). Register the adapter in `packages/legibility/src/languages/index.ts` by importing it and adding it to `ALL_ADAPTERS`.

Step 4 (per milestone M1–M8). Run `npm -w legibility test` and confirm all tests pass (including the new ones) before moving to the next milestone. Expected tail of output:

    Test Files  3 passed (3)
         Tests  <N> passed (<N>)

Step 5 (M9). Extend `MANIFEST_FILE_NAMES` and `TASK_FILE_NAMES` in `index.ts`. Extend `RUNNER_LABEL` in `audit_repo.ts`. Extend `TASK_REFERENCE_PATTERNS` in `lib/markdown.ts` for the adapters whose prose form is clean.

Step 6 (M9). Refresh `skills/agentic-legibility/SKILL.md`'s "Adding a Language Adapter" section so the list of example ecosystems reflects the current set.

Step 7 (M9). Rebuild the bundle:

    npm -w legibility run build

Expected tail of output:

    ✓ Bundle written to /Users/johannes/Code/skills/skills/agentic-legibility/scripts/legibility.js

Step 8 (M9). Run the bundle smoke test:

    npm -w legibility run verify-bundle

Expected tail:

    6 passed, 0 failed

Step 9 (M9). Run the full test suite one more time to confirm nothing regressed:

    npm -w legibility test


## Validation and Acceptance

Acceptance is defined by four observable outcomes.

First, `npm -w legibility test` exits with status 0 and reports every new parser suite plus updated adapter `detect()` suite passing. The test-count delta should be at least 24 new assertions (three per adapter × eight adapters).

Second, `npm -w legibility run verify-bundle` exits with status 0 and reports `6 passed, 0 failed` on the committed bundle.

Third, writing a scratch pyproject.toml with `[tool.poetry.scripts] hello = "pkg:main"` into a temp directory and running `node skills/agentic-legibility/scripts/legibility.js score <tempdir>` produces a report whose `task_surface` array contains `hello`. The same scratch repo with a `Rakefile` containing `task :test do end` produces a `task_surface` containing `test`.

Fourth, running `node skills/agentic-legibility/scripts/legibility.js audit --check-all /Users/johannes/Code/skills` produces the same top-level `status` and same finding counts for `artifacts`, `links`, `commands`, `execplans`, and `agents_md` checks as it does on the pre-change `main` branch (the skills repo itself does not contain Python/Gradle/Maven/.NET/Composer/Rake/Xcode manifests that would exercise the new adapters), confirming no regression on the existing adapter set.


## Idempotence and Recovery

Each milestone is additive. Re-running `npm -w legibility test` after any milestone is safe and expected. The bundle build is deterministic: `npm -w legibility run build` run twice in succession produces byte-identical output. If a milestone's tests fail, revert the changes in that milestone's files (`packages/legibility/src/languages/<name>.ts`, the new test block, and the `ALL_ADAPTERS` entry) and re-run tests before proceeding.

The rebuilt `skills/agentic-legibility/scripts/legibility.js` is a generated artifact committed alongside the TypeScript source. If the bundle and source get out of sync during development, running `npm -w legibility run build` once restores consistency. The CI workflow at `.github/workflows/legibility.yml` enforces this by failing if `git diff --exit-code skills/agentic-legibility/scripts/legibility.js` reports drift after a fresh build.


## Artifacts and Notes

The following transcript shows the expected shape of a successful full run at the end of milestone nine:

    $ npm -w legibility test
    ...
     Test Files  3 passed (3)
         Tests  81 passed (81)

    $ npm -w legibility run build
    ...
    ✓ Bundle written to /Users/johannes/Code/skills/skills/agentic-legibility/scripts/legibility.js

    $ npm -w legibility run verify-bundle
    ...
    6 passed, 0 failed

The parsed task surface for an example Rakefile:

    task :default => [:test]

    namespace :db do
       task :migrate do
       end
       task :rollback do
       end
    end

yields task names `default`, `db:migrate`, and `db:rollback`.


## Interfaces and Dependencies

In `packages/legibility/src/languages/`, each new adapter file defines a module-scoped `PATTERNS` constant (array of filename patterns), a named `parse*` function that takes file text and returns `Set<string>`, and a const `<name>Adapter` of type `LanguageAdapter`. Required signatures:

    export const PATTERNS: string[];

    export function parsePythonScripts(text: string): Set<string>;
    export function parseToxEnvlist(text: string): Set<string>;
    export function parseGradleTasks(text: string): Set<string>;
    export function parseMavenGoals(text: string): Set<string>;
    export function parseMsbuildTargets(text: string): Set<string>;
    export function parseCmakeTargets(text: string): Set<string>;
    export function parseComposerScripts(text: string): Set<string>;
    export function parseRakefile(text: string): Set<string>;
    export function parseFastfileLanes(text: string): Set<string>;
    export function parseXcodeSchemeFilenames(files: string[]): Set<string>;

    export const pythonAdapter: LanguageAdapter;
    export const gradleAdapter: LanguageAdapter;
    export const mavenAdapter: LanguageAdapter;
    export const dotnetAdapter: LanguageAdapter;
    export const cmakeAdapter: LanguageAdapter;
    export const composerAdapter: LanguageAdapter;
    export const rakeAdapter: LanguageAdapter;
    export const xcodeAdapter: LanguageAdapter;

Adapter ids used in `collectTaskSurfaceByRunner` output and in `RUNNER_LABEL`: `python`, `gradle`, `maven`, `dotnet`, `cmake`, `composer`, `rake`, `xcode`.

In `packages/legibility/src/languages/index.ts`, `ALL_ADAPTERS` grows from 5 to 13 entries; the re-export list adds one named export per adapter. `MANIFEST_FILE_NAMES` grows to include: `composer.json`, `cmakelists.txt`, `build.gradle`, `build.gradle.kts`, `pom.xml`, `tox.ini`, `rakefile`, `fastfile`. `TASK_FILE_NAMES` grows to include: `rakefile`, `composer.json`, `pyproject.toml`, `cmakelists.txt`, `build.gradle`, `build.gradle.kts`, `pom.xml`, `fastfile`.

In `packages/legibility/src/audit_repo.ts`, `RUNNER_LABEL` gains: `python: 'Python'`, `gradle: 'Gradle'`, `maven: 'Maven'`, `dotnet: '.NET / MSBuild'`, `cmake: 'CMake'`, `composer: 'Composer'`, `rake: 'rake'`, `xcode: 'Xcode'`.

In `packages/legibility/src/lib/markdown.ts`, `TASK_REFERENCE_PATTERNS` gains entries for `gradle`, `maven`, `composer`, and `rake`. Each entry is `{ runner: <id>, regex: /.../gu }` matching the standard invocation.

No new npm dependencies are introduced at any stage. All parsing is pure JavaScript regex and line splitting.
