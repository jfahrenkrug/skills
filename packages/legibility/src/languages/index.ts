import { findFiles } from '../lib/fs_walk.js';
import { javascriptAdapter } from './javascript.js';
import { makeAdapter } from './make.js';
import { justAdapter } from './just.js';
import { taskfileAdapter } from './taskfile.js';
import { rustAdapter } from './rust.js';
import { pythonAdapter } from './python.js';
import { gradleAdapter } from './gradle.js';
import { mavenAdapter } from './maven.js';
import { dotnetAdapter } from './dotnet.js';
import { cmakeAdapter } from './cmake.js';
import { composerAdapter } from './composer.js';
import { rakeAdapter } from './rake.js';
import { xcodeAdapter } from './xcode.js';
import { nxAdapter } from './nx.js';
import { turboAdapter } from './turbo.js';
import { miseAdapter } from './mise.js';
import { mixAdapter } from './mix.js';
import type { AggregatedTaskSurface, LanguageAdapter } from './types.js';

export type { LanguageAdapter, TaskSurfaceResult, AggregatedTaskSurface } from './types.js';
export { javascriptAdapter } from './javascript.js';
export { makeAdapter } from './make.js';
export { justAdapter } from './just.js';
export { taskfileAdapter } from './taskfile.js';
export { rustAdapter } from './rust.js';
export { pythonAdapter } from './python.js';
export { gradleAdapter } from './gradle.js';
export { mavenAdapter } from './maven.js';
export { dotnetAdapter } from './dotnet.js';
export { cmakeAdapter } from './cmake.js';
export { composerAdapter } from './composer.js';
export { rakeAdapter } from './rake.js';
export { xcodeAdapter } from './xcode.js';
export { nxAdapter } from './nx.js';
export { turboAdapter } from './turbo.js';
export { miseAdapter } from './mise.js';
export { mixAdapter } from './mix.js';

export const ALL_ADAPTERS: LanguageAdapter[] = [
   javascriptAdapter,
   makeAdapter,
   justAdapter,
   taskfileAdapter,
   rustAdapter,
   pythonAdapter,
   gradleAdapter,
   mavenAdapter,
   dotnetAdapter,
   cmakeAdapter,
   composerAdapter,
   rakeAdapter,
   xcodeAdapter,
   nxAdapter,
   turboAdapter,
   miseAdapter,
   mixAdapter,
];

export const TASK_FILE_PATTERNS: string[] = ALL_ADAPTERS.flatMap((a) => a.patterns);

export const TASK_FILE_NAMES = new Set([
   'makefile',
   'justfile',
   'taskfile.yml',
   'taskfile.yaml',
   'package.json',
   'pyproject.toml',
   'tox.ini',
   'build.gradle',
   'build.gradle.kts',
   'pom.xml',
   'cmakelists.txt',
   'composer.json',
   'rakefile',
   'rakefile.rb',
   'fastfile',
   'nx.json',
   'project.json',
   'turbo.json',
   '.mise.toml',
   'mise.toml',
   'mix.exs',
]);

export const MANIFEST_FILE_NAMES = new Set([
   'build.gradle',
   'build.gradle.kts',
   'cargo.toml',
   'cmakelists.txt',
   'composer.json',
   'fastfile',
   'gemfile',
   'go.mod',
   'mix.exs',
   'package.json',
   'pom.xml',
   'pyproject.toml',
   'rakefile',
   'requirements.txt',
   'setup.py',
   'tox.ini',
   'nx.json',
   'project.json',
   'turbo.json',
]);

export async function collectAllTaskSurfaces(
   root: string,
   files: string[],
): Promise<AggregatedTaskSurface> {
   const task_surface = new Set<string>();
   const task_surface_files = new Set<string>();

   for (const adapter of ALL_ADAPTERS) {
      const result = await adapter.collectTaskSurface(root, files);
      for (const n of result.names) task_surface.add(n);
      for (const f of result.sourceFiles) task_surface_files.add(f);
   }

   const entrypoint_files = findFiles(files, ...TASK_FILE_PATTERNS);

   return { task_surface, task_surface_files, entrypoint_files };
}

export async function collectTaskSurfaceByRunner(
   root: string,
   files: string[],
): Promise<Record<string, Set<string>>> {
   const result: Record<string, Set<string>> = {};

   for (const adapter of ALL_ADAPTERS) {
      const surface = await adapter.collectTaskSurface(root, files);
      result[adapter.id] = surface.names;
   }

   return result;
}

export function categorizeTaskSurface(taskSurface: Set<string>): Record<string, string[]> {
   const categories = new Map<string, Set<string>>();

   function add(category: string, name: string): void {
      if (!categories.has(category)) categories.set(category, new Set());
      categories.get(category)!.add(name);
   }

   for (const name of Array.from(taskSurface).sort()) {
      const lower = name.toLowerCase();

      if ([ 'setup', 'bootstrap', 'install', 'init' ].includes(lower)
         || /^(setup|bootstrap|install|init):/u.test(lower)) {
         add('setup', name);
      }

      if ([ 'dev', 'start', 'serve', 'tauri' ].includes(lower)
         || /^(dev|start|serve):/u.test(lower)) {
         add('dev', name);
      }

      if (lower === 'build' || /^(build|bundle|compile|package):/u.test(lower)) {
         add('build', name);
      }

      if (lower === 'test'
         || lower.startsWith('test:')
         || [ 'integration', 'e2e', 'smoke' ].includes(lower)
         || /^(integration|e2e|smoke):/u.test(lower)) {
         add('test', name);
      }

      if ([ 'ci', 'check' ].includes(lower) || /^(ci|check):/u.test(lower)) {
         add('check', name);
      }

      if ([ 'typecheck', 'type-check' ].includes(lower)
         || /^(typecheck|type-check):/u.test(lower)) {
         add('check', name);
      }

      if (lower === 'standards' || lower.startsWith('standards:')) {
         add('lint', name);
         add('check', name);
      }

      if (lower === 'lint'
         || lower.startsWith('lint:')
         || lower.endsWith(':lint')
         || lower.includes(':lint:')) {
         add('lint', name);
      }

      if ([ 'eslint', 'stylelint', 'markdownlint', 'commitlint', 'rust:lint' ].includes(lower)) {
         add('lint', name);
      }

      if (/^(eslint|stylelint|markdownlint|commitlint|rust:lint):/u.test(lower)) {
         add('lint', name);
      }

      if (/^(lint[-_])/u.test(lower) || lower.includes('clippy')) {
         add('lint', name);
      }

      if (/(^|[:_-])fmt($|[:_-])/u.test(lower)) {
         if (lower.includes('fix') || /^(fix[-_])/u.test(lower)) {
            add('format', name);
         } else {
            add('lint', name);
         }
      }

      if ([ 'format', 'fmt' ].includes(lower) || /^(format|fmt):/u.test(lower)) {
         add('format', name);
      }

      if (lower.endsWith(':fix') || lower.includes(':fix:') || /^(fix[-_])/u.test(lower)) {
         add('format', name);
      }
   }

   return Object.fromEntries(Array.from(categories.entries(), ([ category, names ]) => {
      return [ category, Array.from(names).sort() ];
   }));
}
