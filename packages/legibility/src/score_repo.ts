import path from 'node:path';
import {
   DOC_EXTENSIONS,
   readText,
   isDirectory,
   rel,
   toPosix,
   walkRepo,
} from './lib/fs_walk.js';
import {
   MANIFEST_FILE_NAMES,
   categorizeTaskSurface,
   collectAllTaskSurfaces,
} from './languages/index.js';

const MAX_EVIDENCE = 5;
const ROOT_SCOPE = '.';
const AGENT_DOC_NAMES = new Set([ 'agents.md', 'claude.md', 'copilot-instructions.md' ]);
const ROOT_AGENT_DOC_PATHS = new Set([ 'AGENTS.md', 'CLAUDE.md', '.github/copilot-instructions.md' ]);
const CORE_DOC_NAMES = new Set([
   'agents.md',
   'claude.md',
   'contributing.md',
   'copilot-instructions.md',
   'readme.md',
   'readme.mdx',
]);
const METRIC_NAMES = [
   'bootstrap_self_sufficiency',
   'task_entrypoints',
   'validation_harness',
   'lint_format_gates',
   'guardrails_and_hooks',
   'agent_repo_map',
   'structured_docs',
   'decision_records',
] as const;

type MetricName = typeof METRIC_NAMES[number];

const ROOT_MAP_DOCS = [
   'AGENTS.md',
   'CLAUDE.md',
   '.github/copilot-instructions.md',
   'CONTRIBUTING.md',
   'README.md',
];
const GENERIC_NESTED_SCOPE_SEGMENTS = [
   /^docs?$/u,
   /^examples?$/u,
   /^demos?([_-].+)?$/u,
   /^benchmarks?$/u,
   /^tests?([_-].+)?$/u,
   /^tutorials?$/u,
   /^samples?$/u,
   /^fixtures?$/u,
   /^__tests__$/u,
   /^\.[a-z0-9_-]+$/u,
];

interface ScopeSignals {
   path: string;
   signals: string[];
   score: number;
}

interface MetricResult {
   score: number;
   confidence: string;
   evidence: string[];
   gaps: string;
   next_step: string;
}

interface RepoContext {
   root: string;
   files: string[];
   relpaths: Set<string>;
   doc_paths: string[];
   doc_texts: Record<string, string>;
   task_surface: Set<string>;
   task_surface_files: Set<string>;
   entrypoint_files: string[];
}

export interface ScoreReport {
   repo: string;
   evaluated_scope: string;
   evaluated_root: string;
   discovered_scopes: ScopeSignals[];
   scope_selection: string;
   selected_metrics: string[];
   available_metrics: string[];
   score: number;
   max_score: number;
   score_percentage: number;
   metrics: Record<string, MetricResult>;
   notes: string[];
   quick_wins: string[];
}

function normalizeScope(root: string, scope: string): string {
   const scopePath = path.resolve(root, scope);
   const relative = path.relative(root, scopePath);

   if (relative.startsWith('..') || path.isAbsolute(relative)) {
      throw new Error(`Scope path must stay inside the repository root: ${scope}`);
   }

   const normalized = toPosix(relative);

   return normalized || ROOT_SCOPE;
}

function rootRoutesToScope(rootReadme: string, scope: string): boolean {
   return rootReadme.includes(`${scope}/`)
      || rootReadme.includes(`\`${scope}\``)
      || rootReadme.includes(`cd ${scope}`);
}

function clipEvidence(items: string[], limit = MAX_EVIDENCE): string[] {
   const seen = new Set<string>();
   const unique: string[] = [];

   for (const item of items) {
      if (!seen.has(item)) {
         seen.add(item);
         unique.push(item);
      }
   }

   return unique.slice(0, limit);
}

function metric(score: number, confidence: string, evidence: string[], gaps: string, nextStep: string): MetricResult {
   return {
      score,
      confidence,
      evidence: clipEvidence(evidence),
      gaps,
      next_step: nextStep,
   };
}

function setDefault(map: Map<string, Set<string>>, key: string): Set<string> {
   if (!map.has(key)) {
      map.set(key, new Set());
   }

   return map.get(key)!;
}

function hasSignal(signals: Set<string>, prefix: string): boolean {
   return Array.from(signals).some((signal) => signal.startsWith(prefix));
}

function scoreScopeSignals(signals: Set<string>): number {
   let score = 0;

   if (hasSignal(signals, 'agent_doc:')) score += 4;
   if (hasSignal(signals, 'task_surface:')) score += 2;
   if (hasSignal(signals, 'manifest:')) score += 2;
   if (hasSignal(signals, 'scope_readme:')) score += 1;
   if (hasSignal(signals, 'root_routes_here:')) score += 1;

   return score;
}

function isLikelyNestedUtilityScope(scope: string, signals: Set<string>): boolean {
   if (hasSignal(signals, 'agent_doc:') || hasSignal(signals, 'root_routes_here:')) {
      return false;
   }

   const parts = scope.split('/');

   if (parts.length < 3) {
      return false;
   }

   return parts.slice(1).some((part) => {
      return GENERIC_NESTED_SCOPE_SEGMENTS.some((pattern) => pattern.test(part));
   });
}

async function collectContext(root: string, excludes: string[]): Promise<RepoContext> {
   const files = await walkRepo(root, excludes);
   const relpaths = new Set(files);
   const docs = files.filter((filePath) => {
      return DOC_EXTENSIONS.has(path.extname(filePath).toLowerCase());
   });
   const docTexts: Record<string, string> = {};

   for (const relpath of docs) {
      const basename = path.posix.basename(relpath).toLowerCase();

      if (CORE_DOC_NAMES.has(basename) || relpath.startsWith('docs/')) {
         docTexts[relpath] = await readText(path.join(root, relpath));
      }
   }

   const surface = await collectAllTaskSurfaces(root, files);

   return {
      root,
      files,
      relpaths,
      doc_paths: docs,
      doc_texts: docTexts,
      task_surface: surface.task_surface,
      task_surface_files: surface.task_surface_files,
      entrypoint_files: surface.entrypoint_files,
   };
}

function discoverScopes(ctx: RepoContext): ScopeSignals[] {
   const relpaths = Array.from(ctx.relpaths).sort();
   const rootReadme = (ctx.doc_texts['README.md'] || ctx.doc_texts['README.mdx'] || '').toLowerCase();
   const signalsByScope = new Map<string, Set<string>>();

   for (const relpath of relpaths) {
      const parts = relpath.split('/');

      if (parts.length < 2) continue;

      const directScope = parts.slice(0, -1).join('/');
      const filename = parts[parts.length - 1].toLowerCase();

      if (AGENT_DOC_NAMES.has(filename)) {
         setDefault(signalsByScope, directScope).add(`agent_doc:${parts[parts.length - 1]}`);
      }

      if (filename === 'readme.md') {
         setDefault(signalsByScope, directScope).add('scope_readme:README.md');
      }

      const signals = setDefault(signalsByScope, directScope);

      if (ctx.task_surface_files.has(relpath)) {
         signals.add(`task_surface:${parts[parts.length - 1]}`);
      }

      if (MANIFEST_FILE_NAMES.has(filename)) {
         signals.add(`manifest:${parts[parts.length - 1]}`);
      }

      if (rootRoutesToScope(rootReadme, directScope)) {
         signals.add('root_routes_here:README.md');
      }
   }

   const candidates: ScopeSignals[] = [];

   for (const [ scope, signals ] of signalsByScope.entries()) {
      const score = scoreScopeSignals(signals);
      const strongSignal = hasSignal(signals, 'agent_doc:')
         || hasSignal(signals, 'task_surface:')
         || hasSignal(signals, 'manifest:');

      if (score >= 3 && strongSignal && !isLikelyNestedUtilityScope(scope, signals)) {
         candidates.push({ path: scope, signals: Array.from(signals).sort(), score });
      }
   }

   return candidates.sort((left, right) => {
      return (right.score - left.score) || left.path.localeCompare(right.path);
   });
}

function chooseScope(
   ctx: RepoContext,
   explicitScope: string | undefined = undefined,
): [ string, ScopeSignals[], string ] {
   const discovered = discoverScopes(ctx);

   if (explicitScope) {
      return [ explicitScope, discovered, 'explicit' ];
   }

   const topLevelAgentDoc = Array.from(ROOT_AGENT_DOC_PATHS).some((candidate) => {
      return ctx.relpaths.has(candidate);
   });
   const strongCandidates = discovered.filter((candidate) => candidate.score >= 5);

   if (strongCandidates.length === 1 && !topLevelAgentDoc) {
      return [ strongCandidates[0].path, discovered, 'auto_single_nested_scope' ];
   }

   if (strongCandidates.length >= 2) {
      return [ ROOT_SCOPE, discovered, 'root_multiple_nested_scopes' ];
   }

   return [ ROOT_SCOPE, discovered, 'root_default' ];
}

async function scoreBootstrap(ctx: RepoContext): Promise<MetricResult> {
   const taskCategories = categorizeTaskSurface(ctx.task_surface);
   const declarative = Array.from(ctx.relpaths)
      .filter((relpath) => {
         return [
            'devcontainer.json',
            '.devcontainer/devcontainer.json',
            'docker-compose.yml',
            'docker-compose.yaml',
            'compose.yml',
            'compose.yaml',
            'flake.nix',
            'shell.nix',
            'mise.toml',
            '.tool-versions',
            'Brewfile',
         ].includes(relpath) || relpath.startsWith('.devcontainer/');
      })
      .sort();
   const runtimePins = Array.from(ctx.relpaths)
      .filter((relpath) => {
         return [
            '.python-version',
            '.nvmrc',
            '.node-version',
            '.ruby-version',
            '.java-version',
            'rust-toolchain.toml',
         ].includes(relpath);
      })
      .sort();
   const lockfiles = Array.from(ctx.relpaths)
      .filter((relpath) => {
         return [
            'package-lock.json',
            'pnpm-lock.yaml',
            'yarn.lock',
            'poetry.lock',
            'Pipfile.lock',
            'uv.lock',
            'Cargo.lock',
            'go.sum',
            'Gemfile.lock',
         ].includes(path.posix.basename(relpath));
      })
      .sort();
   const bootstrapCommands = Array.from(new Set([
      ...(taskCategories.setup || []),
      ...(taskCategories.dev || []),
   ])).sort();
   const categories = [ declarative, runtimePins, lockfiles, bootstrapCommands ]
      .filter((group) => group.length > 0)
      .length;
   const evidence = [
      ...declarative,
      ...runtimePins,
      ...lockfiles,
      ...bootstrapCommands.map((name) => `task:${name}`),
   ];

   if (declarative.length > 0 && bootstrapCommands.length > 0 && (runtimePins.length > 0 || lockfiles.length > 0)) {
      return metric(3, 'high', evidence, 'Little obvious setup debt from repo-visible signals.', 'Keep one canonical bootstrap command and keep manifests pinned.');
   }

   if (categories >= 2) {
      return metric(2, 'medium', evidence, 'Setup is partly declared, but the repo does not advertise one clearly dominant bootstrap path.', 'Add a canonical `setup` or `bootstrap` entrypoint and point docs at it.');
   }

   if (categories === 1) {
      return metric(1, 'medium', evidence, 'Some setup signals exist, but an agent still has to infer too much about the environment.', 'Add declarative environment files or a single bootstrap command.');
   }

   return metric(0, 'high', evidence, 'No strong repo-visible bootstrap path was found.', 'Declare the toolchain and local services in version control and expose a `setup` task.');
}

async function scoreTaskEntrypoints(ctx: RepoContext): Promise<MetricResult> {
   const taskCategories = categorizeTaskSurface(ctx.task_surface);
   const matchedCategories = [ 'setup', 'dev', 'build', 'test', 'lint', 'format', 'check' ].filter((category) => {
      return (taskCategories[category] || []).length > 0;
   });
   const evidence = [
      ...ctx.entrypoint_files,
      ...[ 'setup', 'dev', 'build', 'test', 'lint', 'format', 'check' ].flatMap((category) => {
         return (taskCategories[category] || []).map((name) => `task:${name}`);
      }),
   ];
   const hasSetup = Boolean((taskCategories.setup || []).length > 0 || (taskCategories.dev || []).length > 0);
   const hasValidation = Boolean((taskCategories.test || []).length > 0 || (taskCategories.lint || []).length > 0 || (taskCategories.check || []).length > 0);
   const hasBuild = Boolean((taskCategories.build || []).length > 0);

   if (matchedCategories.length >= 5 && hasSetup && hasValidation && hasBuild) {
      return metric(3, 'high', evidence, 'Common workflows appear to have stable entrypoints.', 'Keep entrypoint names consistent across docs and CI.');
   }

   if (matchedCategories.length >= 3) {
      return metric(2, 'high', evidence, 'Several common tasks are exposed, but the task surface is not yet complete.', 'Expose `setup`, `dev`, `test`, `lint`, and `build` through one canonical task layer.');
   }

   if (ctx.entrypoint_files.length > 0 || matchedCategories.length > 0) {
      return metric(1, 'medium', evidence, 'Some task entrypoints exist, but coverage is narrow or inconsistent.', 'Add a single command surface such as `make`, `just`, `task`, or package scripts for routine work.');
   }

   return metric(0, 'high', evidence, 'No canonical task surface was detected.', 'Add repo-level entrypoints for setup, validation, and build tasks.');
}

async function scoreValidationHarness(ctx: RepoContext): Promise<MetricResult> {
   const taskCategories = categorizeTaskSurface(ctx.task_surface);
   const testDirs = Array.from(ctx.relpaths)
      .filter((relpath) => {
         return /(^|\/)(tests?|__tests__|spec|specs|integration|e2e|cypress|playwright|testdata|fixtures)(\/|$)/u.test(relpath);
      })
      .sort();
   const testConfigs = Array.from(ctx.relpaths)
      .filter((relpath) => {
         const basename = path.posix.basename(relpath);

         return basename === 'pytest.ini'
            || basename === 'tox.ini'
            || /^jest\.config\./u.test(basename)
            || /^vitest\.config\./u.test(basename)
            || /^playwright\.config\./u.test(basename)
            || /^cypress\.config\./u.test(basename);
      })
      .sort();
   const testCommands = Array.from(new Set([
      ...(taskCategories.test || []),
      ...(taskCategories.check || []),
   ])).sort();
   const layered = testDirs.some((relpath) => {
      return [ 'integration', 'e2e', 'cypress', 'playwright' ].some((part) => relpath.includes(part));
   });
   const fixtures = testDirs.some((relpath) => {
      return [ 'fixtures', 'testdata' ].some((part) => relpath.includes(part));
   });
   const evidence = [
      ...testDirs,
      ...testConfigs,
      ...testCommands.map((name) => `task:${name}`),
   ];

   if ((testDirs.length > 0 || testConfigs.length > 0) && testCommands.length > 0 && (layered || fixtures)) {
      return metric(3, 'high', evidence, 'The repo appears to support more than one validation layer or reusable test state.', 'Keep smoke or integration coverage aligned with the most common change types.');
   }

   if ((testDirs.length > 0 || testConfigs.length > 0) && testCommands.length > 0) {
      return metric(2, 'high', evidence, 'The repo has a credible local validation path for ordinary changes.', 'Add smoke, integration, or e2e coverage for cross-cutting changes.');
   }

   if (testDirs.length > 0 || testConfigs.length > 0 || testCommands.length > 0) {
      return metric(1, 'medium', evidence, 'Some validation signals exist, but the harness looks narrow or hard to trust end-to-end.', 'Add a canonical `test` or `check` command and keep tests in predictable locations.');
   }

   return metric(0, 'high', evidence, 'No meaningful local validation harness was detected.', 'Add a basic test or smoke-test path that an agent can run after changes.');
}

async function scoreLintFormat(ctx: RepoContext): Promise<MetricResult> {
   const taskCategories = categorizeTaskSurface(ctx.task_surface);
   const lintFiles = Array.from(ctx.relpaths)
      .filter((relpath) => {
         return new Set([
            '.eslintrc',
            '.eslintrc.js',
            '.eslintrc.cjs',
            '.eslintrc.json',
            '.eslintrc.yml',
            '.eslintrc.yaml',
            'eslint.config.js',
            'eslint.config.cjs',
            'eslint.config.mjs',
            '.golangci.yml',
            '.golangci.yaml',
            '.markdownlint.json',
            '.markdownlint.yaml',
            '.markdownlint.yml',
            '.markdownlint-cli2.cjs',
            'ruff.toml',
            '.ruff.toml',
            '.stylelintrc',
            '.stylelintrc.js',
            '.stylelintrc.cjs',
            '.stylelintrc.json',
            '.stylelintrc.yml',
            '.stylelintrc.yaml',
            'stylelint.config.js',
            'stylelint.config.cjs',
            'commitlint.config.cjs',
         ]).has(path.posix.basename(relpath));
      })
      .sort();
   const formatFiles = Array.from(ctx.relpaths)
      .filter((relpath) => {
         return new Set([
            '.prettierrc',
            '.prettierrc.json',
            '.prettierrc.yml',
            '.prettierrc.yaml',
            'prettier.config.js',
            'prettier.config.cjs',
            'rustfmt.toml',
            '.rustfmt.toml',
            '.editorconfig',
         ]).has(path.posix.basename(relpath));
      })
      .sort();

   if (ctx.relpaths.has('pyproject.toml')) {
      const pyprojectText = await readText(path.join(ctx.root, 'pyproject.toml'));

      if ([ '[tool.ruff', '[tool.black', '[tool.isort' ].some((token) => pyprojectText.includes(token))) {
         lintFiles.push('pyproject.toml');
      }

      if ([ '[tool.black', '[tool.ruff.format' ].some((token) => pyprojectText.includes(token))) {
         formatFiles.push('pyproject.toml');
      }
   }

   const extra: string[] = [];

   if (ctx.relpaths.has('.pre-commit-config.yaml') || ctx.relpaths.has('.pre-commit-config.yml')) {
      extra.push('.pre-commit-config.yaml');
   }

   if (ctx.relpaths.has('.gitlab-ci.yml')) {
      extra.push('.gitlab-ci.yml');
   }

   const githubWorkflows = Array.from(ctx.relpaths)
      .filter((relpath) => relpath.startsWith('.github/workflows/'))
      .sort()
      .slice(0, 2);
   extra.push(...githubWorkflows);

   const lintCommands = Array.from(new Set([
      ...(taskCategories.lint || []),
      ...(taskCategories.check || []),
   ])).sort();
   const formatCommands = [ ...(taskCategories.format || []) ].sort();
   const evidence = [
      ...lintFiles,
      ...formatFiles,
      ...lintCommands.map((name) => `task:${name}`),
      ...formatCommands.map((name) => `task:${name}`),
      ...extra,
   ];

   if (lintFiles.length > 0 && formatFiles.length > 0 && (lintCommands.length > 0 || formatCommands.length > 0) && extra.length > 0) {
      return metric(3, 'high', evidence, 'Static checks look integrated into the repository workflow.', 'Keep lint and format commands stable and easy to run locally.');
   }

   if ((lintFiles.length > 0 || formatFiles.length > 0) && (lintCommands.length > 0 || formatCommands.length > 0)) {
      return metric(2, 'high', evidence, 'The repo has usable lint or format gates, but enforcement signals are still modest.', 'Add both lint and format entrypoints and wire them into pre-commit or repo-local CI workflows.');
   }

   if (lintFiles.length > 0 || formatFiles.length > 0 || lintCommands.length > 0 || formatCommands.length > 0) {
      return metric(1, 'medium', evidence, 'Lint or format tooling exists, but the workflow is incomplete or weakly surfaced.', 'Expose `lint` and `format` commands through the canonical task surface.');
   }

   return metric(0, 'high', evidence, 'No lint or format gates were detected.', 'Add at least one linter and formatter with explicit repo-level commands.');
}

async function scoreGuardrailsAndHooks(ctx: RepoContext): Promise<MetricResult> {
   const families: Record<string, string[]> = {
      'pre-commit': [],
      lefthook: [],
      'husky/githooks': [],
      'agent-hooks': [],
   };

   for (const relpath of ctx.relpaths) {
      if (relpath === '.pre-commit-config.yaml' || relpath === '.pre-commit-config.yml') {
         families['pre-commit'].push(relpath);
      }
      if (relpath === 'lefthook.yml' || relpath === 'lefthook.yaml' || relpath === '.lefthook.yml') {
         families.lefthook.push(relpath);
      }
      if (relpath.startsWith('.husky/') || relpath.startsWith('.githooks/')) {
         families['husky/githooks'].push(relpath);
      }
      if (relpath.startsWith('.claude/hooks/')) {
         families['agent-hooks'].push(relpath);
      }
   }

   const presentFamilies = Object.entries(families).filter(([ , files ]) => files.length > 0);
   const evidence = presentFamilies.flatMap(([ , files ]) => files).slice(0, MAX_EVIDENCE);

   if (presentFamilies.length >= 2) {
      return metric(
         3,
         'high',
         evidence,
         'The repository looks like it has layered mechanical enforcement.',
         'Keep hook configs healthy and audit them when adding new tools.',
      );
   }

   if (presentFamilies.length === 1) {
      return metric(
         2,
         'high',
         evidence,
         'A single hooks family enforces guardrails; consider adding another for redundancy.',
         'Add another layer such as `.pre-commit-config.yaml` or `lefthook.yml` so guardrails survive a missing local install.',
      );
   }

   return metric(
      0,
      'high',
      evidence,
      'No mechanical hooks found.',
      'Add `pre-commit`, `lefthook`, `husky`, or `.claude/hooks/` so common mistakes fail loudly before commit.',
   );
}

async function scoreAgentRepoMap(ctx: RepoContext): Promise<MetricResult> {
   const repoWideAgentDocs = Array.from(ROOT_AGENT_DOC_PATHS)
      .filter((candidate) => ctx.relpaths.has(candidate))
      .sort();
   const rootSupportDocs = Array.from(ctx.relpaths)
      .filter((relpath) => [ 'CONTRIBUTING.md', 'README.md' ].includes(relpath))
      .sort();
   const nestedAgentDocs = Array.from(ctx.relpaths)
      .filter((relpath) => relpath.includes('/') && AGENT_DOC_NAMES.has(path.posix.basename(relpath).toLowerCase()))
      .sort();
   const evidence = [
      ...repoWideAgentDocs,
      ...rootSupportDocs.slice(0, 2),
      ...nestedAgentDocs.slice(0, 2),
   ];

   let mapText = '';

   for (const candidate of ROOT_MAP_DOCS) {
      if (ctx.doc_texts[candidate]) {
         mapText = ctx.doc_texts[candidate];

         if (mapText) break;
      }
   }

   const cueMatches = [ 'command', 'setup', 'docs', 'architecture', 'test', 'constraint', 'workflow' ]
      .filter((token) => mapText.toLowerCase().includes(token))
      .length;
   const repoMapBonus = [ 'docs/repo-map.md', 'docs/architecture.md', 'ARCHITECTURE.md' ]
      .some((candidate) => ctx.relpaths.has(candidate)) ? 1 : 0;
   const cues = cueMatches + repoMapBonus;
   const hasAgentDoc = repoWideAgentDocs.length > 0;
   const hasNestedAgentDoc = nestedAgentDocs.length > 0;
   const rootText = ROOT_MAP_DOCS
      .map((candidate) => ctx.doc_texts[candidate] || '')
      .join('\n')
      .toLowerCase();
   const nestedGuidesAreSurfaced = nestedAgentDocs.some((nestedDoc) => {
      return rootText.includes(nestedDoc.toLowerCase())
         || rootRoutesToScope(rootText, path.posix.dirname(nestedDoc).toLowerCase());
   });

   if (hasAgentDoc && cues >= 3) {
      return metric(3, 'high', evidence, 'The repo includes a repo-wide navigation aid for agents with actionable cues.', 'Keep the repo map short and link outward to deeper docs instead of duplicating them.');
   }

   if (hasAgentDoc) {
      return metric(2, 'medium', evidence, 'A repo-wide agent guide exists, but it does not yet look like a crisp map of commands, docs, and constraints.', 'Tighten the top-level agent guide so it indexes the primary commands, docs, architecture, and validation paths.');
   }

   if (hasNestedAgentDoc && nestedGuidesAreSurfaced) {
      return metric(2, 'medium', evidence, 'The repo routes some work through nested scopes with subtree-only agent guidance, but the root still lacks a single repo-wide map.', 'Add a short top-level repo map that points to the nested scope guides and their primary commands.');
   }

   if (ctx.relpaths.has('README.md') && cues >= 2) {
      return metric(1, 'medium', evidence, 'The root docs provide some navigation help, but they do not clearly distinguish repo-wide guidance from subtree-specific workflows.', 'Add an `AGENTS.md` or equivalent short index linking commands, docs, constraints, and nested scope guides.');
   }

   if (hasNestedAgentDoc) {
      return metric(1, 'medium', evidence, 'Nested agent guidance exists, but it is not surfaced clearly from the repository root.', 'Link the nested scope guides from the root README or add a short top-level AGENTS.md.');
   }

   if (evidence.length > 0) {
      return metric(1, 'medium', evidence, 'Some onboarding docs exist, but the repo lacks a concise map optimized for agent navigation.', 'Write a short repo map that points to setup, validation, and architecture docs.');
   }

   return metric(0, 'high', evidence, 'No obvious repo map or contributor guide was detected.', 'Add `AGENTS.md` with the primary commands, docs, and navigation tips.');
}

async function scoreStructuredDocs(ctx: RepoContext): Promise<MetricResult> {
   const docCount = ctx.doc_paths.length;
   const docsDirFiles = [ ...ctx.doc_paths ]
      .filter((relpath) => relpath.startsWith('docs/'))
      .sort();
   const docsSubdirs = new Set(docsDirFiles
      .map((relpath) => relpath.split('/'))
      .filter((parts) => parts.length > 2)
      .map((parts) => parts[1]));
   const indexFiles = docsDirFiles.filter((relpath) => {
      return [ 'readme.md', 'index.md' ].includes(path.posix.basename(relpath).toLowerCase());
   });
   let crossLinks = 0;

   for (const [ relpath, text ] of Object.entries(ctx.doc_texts)) {
      if (relpath.startsWith('docs/')) {
         const matches = text.match(/\[[^\]]+\]\((?!https?:\/\/)[^)]+\)/gu);
         crossLinks += matches ? matches.length : 0;
      }
   }

   const evidence = Array.from(new Set([ ...indexFiles, ...docsDirFiles.slice(0, 3) ])).sort();
   const hasDocsTree = docsDirFiles.length > 0;
   const hasDocsIndex = indexFiles.length > 0;
   const hasCrossLinks = crossLinks >= 3;
   const hasDepth = docsSubdirs.size > 0;

   if (hasDocsTree && hasDocsIndex && hasDepth && hasCrossLinks) {
      return metric(3, 'high', evidence, 'Documentation appears organized, indexed, and linked across topics.', 'Preserve the index and keep new docs inside the same structure.');
   }

   if (hasDocsTree && hasDocsIndex && docsDirFiles.length >= 3) {
      return metric(2, 'high', evidence, 'The repo has an indexed docs tree, but it is still fairly shallow or only lightly cross-linked.', 'Improve cross-links and add clearer sections for setup, architecture, and contributor flows.');
   }

   if (hasDocsTree && docsDirFiles.length >= 3) {
      return metric(1, 'medium', evidence.length > 0 ? evidence : docsDirFiles.slice(0, 3), 'The repo has a shallow docs tree, but it lacks a clear index or stronger cross-links.', 'Add `docs/README.md` or `docs/index.md` and improve cross-links between the main setup, architecture, and contributor pages.');
   }

   if (hasDocsTree) {
      return metric(1, 'medium', evidence.length > 0 ? evidence : docsDirFiles.slice(0, 3), 'A docs directory exists, but it is still sparse or hard to navigate.', 'Add `docs/README.md` or `docs/index.md` and improve cross-links as the docs tree grows.');
   }

   if (docCount >= 2) {
      return metric(1, 'medium', evidence.length > 0 ? evidence : ctx.doc_paths.slice(0, 3).sort(), 'Some documentation exists, but the structure is shallow or scattered.', 'Group repo docs under `docs/` or add an index that links the important pages.');
   }

   return metric(0, 'high', evidence, 'Very little structured documentation was found.', 'Add a `docs/` directory with an index page and a small set of core topics.');
}

function isDecisionRecordPath(relpath: string): boolean {
   const lower = relpath.toLowerCase();

   return /(^|\/)(adr|adrs|decisions?)(\/|[-_])/u.test(lower)
      && /\.(md|mdx)$/u.test(lower);
}

function isCanonicalDecisionRecordPath(relpath: string): boolean {
   const lower = relpath.toLowerCase();

   return lower.startsWith('docs/adr/')
      || lower.startsWith('docs/adrs/')
      || lower.startsWith('docs/decisions/');
}

async function scoreDecisionRecords(ctx: RepoContext): Promise<MetricResult> {
   const adrFiles = Array.from(ctx.relpaths)
      .filter((relpath) => {
         return isDecisionRecordPath(relpath);
      })
      .sort();
   const canonicalAdrFiles = adrFiles.filter((relpath) => {
      return isCanonicalDecisionRecordPath(relpath);
   });
   let structured = 0;
   let supersession = 0;

   for (const relpath of adrFiles.slice(0, 10)) {
      const text = await readText(path.join(ctx.root, relpath));
      const lower = text.toLowerCase();

      if (lower.includes('context') && lower.includes('decision')) {
         structured += 1;
      }

      if (lower.includes('superseded by') || lower.includes('status')) {
         supersession += 1;
      }
   }

   if (canonicalAdrFiles.length >= 2 && structured >= 2 && supersession >= 1) {
      return metric(3, 'high', canonicalAdrFiles, 'The repo appears to keep structured, evolving decision records in version control.', 'Keep ADR status and supersession links current as decisions change.');
   }

   if (canonicalAdrFiles.length >= 2) {
      return metric(2, 'high', canonicalAdrFiles, 'There is a dedicated decision-record trail, but it looks lightly structured.', 'Standardize ADR headings such as Context, Decision, Consequences, and Status.');
   }

   if (canonicalAdrFiles.length > 0) {
      return metric(1, 'medium', canonicalAdrFiles, 'A decision-record artifact exists, but the practice looks narrow or inconsistent.', 'Keep architecture decision records together under `docs/decisions/` or `docs/adr/` and use that folder consistently.');
   }

   if (adrFiles.length > 0) {
      return metric(1, 'medium', adrFiles, 'Decision-record artifacts exist, but they are scattered outside the main ADR trail.', 'Move architecture decisions into `docs/decisions/` or `docs/adr/` and keep that folder authoritative.');
   }

   return metric(0, 'high', adrFiles, 'No decision-record artifacts were detected.', 'Start recording major architecture and workflow decisions in ADRs.');
}

const METRIC_SCORERS: Record<MetricName, (ctx: RepoContext) => Promise<MetricResult>> = {
   bootstrap_self_sufficiency: scoreBootstrap,
   task_entrypoints: scoreTaskEntrypoints,
   validation_harness: scoreValidationHarness,
   lint_format_gates: scoreLintFormat,
   guardrails_and_hooks: scoreGuardrailsAndHooks,
   agent_repo_map: scoreAgentRepoMap,
   structured_docs: scoreStructuredDocs,
   decision_records: scoreDecisionRecords,
};

function summarize(report: ScoreReport): void {
   const priorities = Object.entries(report.metrics)
      .sort((left, right) => (left[1].score - right[1].score) || left[0].localeCompare(right[0]));

   report.quick_wins = priorities.slice(0, 3).map(([ name, data ]) => {
      return `${name}: ${data.next_step}`;
   });
}

function normalizeMetricNames(rawMetrics: string[]): MetricName[] {
   if (rawMetrics.length === 0) {
      return [ ...METRIC_NAMES ];
   }

   const names: MetricName[] = [];
   const seen = new Set<string>();

   for (const item of rawMetrics) {
      for (const token of item.split(',')) {
         const name = token.trim();

         if (!name) continue;

         if (!(METRIC_NAMES as readonly string[]).includes(name)) {
            throw new Error(`Unknown metric '${name}'. Valid metrics: ${METRIC_NAMES.join(', ')}`);
         }

         if (!seen.has(name)) {
            seen.add(name);
            names.push(name as MetricName);
         }
      }
   }

   return names;
}

export async function buildReport(
   root: string,
   excludes: string[],
   selectedMetrics: MetricName[],
   scope: string | undefined,
): Promise<ScoreReport> {
   const rootContext = await collectContext(root, excludes);
   const normalizedScope = scope ? normalizeScope(root, scope) : undefined;
   const [ evaluatedScope, discoveredScopes, scopeSelection ] = chooseScope(rootContext, normalizedScope);
   const targetRoot = evaluatedScope === ROOT_SCOPE ? root : path.resolve(root, evaluatedScope);
   const context = targetRoot === root ? rootContext : await collectContext(targetRoot, excludes);
   const metrics: Record<string, MetricResult> = {};

   for (const metricName of selectedMetrics) {
      metrics[metricName] = await METRIC_SCORERS[metricName](context);
   }

   const score = Object.values(metrics).reduce((total, data) => total + data.score, 0);
   const maxScore = selectedMetrics.length * 3;
   const scorePercentage = maxScore === 0 ? 0 : Math.round((score / maxScore) * 100);
   const report: ScoreReport = {
      repo: root,
      evaluated_scope: evaluatedScope,
      evaluated_root: targetRoot,
      discovered_scopes: discoveredScopes,
      scope_selection: scopeSelection,
      selected_metrics: selectedMetrics,
      available_metrics: [ ...METRIC_NAMES ],
      score,
      max_score: maxScore,
      score_percentage: scorePercentage,
      metrics,
      notes: [
         'This score is limited to repo-visible evidence.',
         'Operational metrics such as CI reliability or debt tracking are intentionally excluded from the main score.',
         'Nested scopes may be auto-selected when the repository clearly routes work into one self-contained subsystem.',
      ],
      quick_wins: [],
   };

   summarize(report);

   return report;
}

export function toMarkdown(report: ScoreReport): string {
   const lines = [
      '# Agentic Legibility Scorecard',
      '',
      `- Repository: \`${report.repo}\``,
      `- Evaluated scope: \`${report.evaluated_scope}\``,
      `- Score: **${report.score}/${report.max_score}** (${report.score_percentage}%)`,
      '',
      '## Scope Discovery',
      '',
   ];

   if (report.discovered_scopes.length > 0) {
      for (const scope of report.discovered_scopes) {
         const signals = scope.signals.map((item) => `\`${item}\``).join(', ');
         lines.push(`- \`${scope.path}\` (${scope.score}): ${signals}`);
      }
   } else {
      lines.push('- No nested scoring scopes discovered.');
   }

   lines.push('');
   lines.push('## Metrics');
   lines.push('');
   lines.push('| Metric | Score | Confidence | Evidence | Gap | Next step |');
   lines.push('| --- | --- | --- | --- | --- | --- |');

   for (const [ name, data ] of Object.entries(report.metrics)) {
      const evidence = data.evidence.length > 0
         ? data.evidence.map((item) => `\`${item}\``).join('<br>')
         : '-';
      const gap = data.gaps.replaceAll('|', '\\|');
      const nextStep = data.next_step.replaceAll('|', '\\|');

      lines.push(`| \`${name}\` | ${data.score}/3 | ${data.confidence} | ${evidence} | ${gap} | ${nextStep} |`);
   }

   lines.push('');
   lines.push('## Quick Wins');
   lines.push('');

   for (const item of report.quick_wins) {
      lines.push(`- ${item}`);
   }

   lines.push('');
   lines.push('## Notes');
   lines.push('');

   for (const note of report.notes) {
      lines.push(`- ${note}`);
   }

   return lines.join('\n');
}

export interface CliArgs {
   repo: string;
   format: 'json' | 'markdown';
   metrics: string[];
   listMetrics: boolean;
   listScopes: boolean;
   scope: string | undefined;
   excludes: string[];
}

export function parseCliArgs(argv: string[]): CliArgs {
   const args: CliArgs = {
      repo: '.',
      format: 'json',
      metrics: [],
      listMetrics: false,
      listScopes: false,
      scope: undefined,
      excludes: [],
   };
   const positionals: string[] = [];

   for (let index = 0; index < argv.length; index += 1) {
      const arg = argv[index];

      if (arg === '--format') {
         const value = argv[index + 1];

         if (value !== 'json' && value !== 'markdown') {
            throw new Error('--format requires either json or markdown');
         }

         args.format = value;
         index += 1;
      } else if (arg === '--metric') {
         const value = argv[index + 1];

         if (!value) throw new Error('--metric requires a value');

         args.metrics.push(value);
         index += 1;
      } else if (arg === '--list-metrics') {
         args.listMetrics = true;
      } else if (arg === '--list-scopes') {
         args.listScopes = true;
      } else if (arg === '--scope') {
         const value = argv[index + 1];

         if (!value) throw new Error('--scope requires a value');

         args.scope = value;
         index += 1;
      } else if (arg === '--exclude') {
         const value = argv[index + 1];

         if (!value) throw new Error('--exclude requires a value');

         args.excludes.push(value);
         index += 1;
      } else if (arg.startsWith('--')) {
         throw new Error(`Unknown option: ${arg}`);
      } else {
         positionals.push(arg);
      }
   }

   if (positionals.length > 1) {
      throw new Error('Only one repository path may be provided.');
   }

   if (positionals.length === 1) {
      args.repo = positionals[0];
   }

   return args;
}

export { collectContext, discoverScopes, normalizeMetricNames, METRIC_NAMES };

export async function runCli(argv: string[] = process.argv.slice(2)): Promise<void> {
   const args = parseCliArgs(argv);

   if (args.listMetrics) {
      process.stdout.write(`${METRIC_NAMES.join('\n')}\n`);
      return;
   }

   const root = path.resolve(args.repo);

   if (!(await isDirectory(root))) {
      throw new Error(`Repository path does not exist or is not a directory: ${root}`);
   }

   if (args.scope) {
      const normalizedScope = normalizeScope(root, args.scope);
      const scopePath = path.resolve(root, normalizedScope);

      if (!(await isDirectory(scopePath))) {
         throw new Error(`Scope path does not exist or is not a directory: ${scopePath}`);
      }
   }

   if (args.listScopes) {
      const context = await collectContext(root, args.excludes);
      process.stdout.write(`${JSON.stringify(discoverScopes(context), null, 2)}\n`);
      return;
   }

   const selectedMetrics = normalizeMetricNames(args.metrics);
   const report = await buildReport(root, args.excludes, selectedMetrics, args.scope);

   if (args.format === 'json') {
      process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
   } else {
      process.stdout.write(`${toMarkdown(report)}\n`);
   }
}
