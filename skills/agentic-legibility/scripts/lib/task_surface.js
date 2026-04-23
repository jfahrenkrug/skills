// Task-surface extraction across the task runners the skill cares about.
//
// "Task surface" means the set of named commands a repository exposes to its
// contributors -- npm scripts, Makefile targets, justfile recipes, Taskfile
// targets, cargo aliases.  This module parses each of those files and exposes a
// single categorizer that buckets the discovered names into setup / dev / build
// / test / lint / format / check groups.  The same surface is used both by the
// scoring rubric and by the audit drift checks.

import path from 'node:path';
import { readCandidates } from './fs_walk.js';

export const TASK_FILE_NAMES = new Set([
   'makefile',
   'justfile',
   'taskfile.yml',
   'taskfile.yaml',
   'package.json',
]);

export const MANIFEST_FILE_NAMES = new Set([
   'build.gradle',
   'build.gradle.kts',
   'cargo.toml',
   'gemfile',
   'go.mod',
   'mix.exs',
   'package.json',
   'pom.xml',
   'pyproject.toml',
   'requirements.txt',
]);

export const TASK_FILE_PATTERNS = [
   'Makefile',
   'makefile',
   'justfile',
   'Justfile',
   'Taskfile.yml',
   'Taskfile.yaml',
   'package.json',
   '.cargo/config.toml',
   '.cargo/config',
];

export function parsePackageScripts(text) {
   try {
      const parsed = JSON.parse(text);
      const scripts = parsed.scripts;

      if (!scripts || typeof scripts !== 'object' || Array.isArray(scripts)) {
         return new Set();
      }

      return new Set(Object.keys(scripts).map((name) => String(name).trim()));
   } catch (_error) {
      return new Set();
   }
}

export function parseMakeTargets(text) {
   const targets = new Set();

   for (const line of text.split(/\r?\n/u)) {
      if (line.startsWith('\t') || line.startsWith(' ')) {
         continue;
      }

      const match = line.match(/^([A-Za-z0-9_.-]+):(?:\s|$)/u);

      if (match && !match[1].startsWith('.')) {
         targets.add(match[1]);
      }
   }

   return targets;
}

export function parseJustTargets(text) {
   const targets = new Set();

   for (const line of text.split(/\r?\n/u)) {
      const match = line.match(/^([A-Za-z0-9_.-]+):(?:\s|$)/u);

      if (match) {
         targets.add(match[1]);
      }
   }

   return targets;
}

export function parseTaskfileTargets(text) {
   const targets = new Set();
   let inTasks = false;

   for (const line of text.split(/\r?\n/u)) {
      if (/^tasks:\s*$/u.test(line)) {
         inTasks = true;
         continue;
      }

      if (inTasks && /^[A-Za-z]/u.test(line)) {
         break;
      }

      if (!inTasks) {
         continue;
      }

      const match = line.match(/^\s{2,}([A-Za-z0-9_.-]+):\s*$/u);

      if (match) {
         targets.add(match[1]);
      }
   }

   return targets;
}

export function parseCargoAliases(text) {
   const targets = new Set();
   let inAlias = false;

   for (const line of text.split(/\r?\n/u)) {
      const stripped = line.trim();

      if (!stripped || stripped.startsWith('#')) {
         continue;
      }

      if (/^\[[^\]]+\]\s*$/u.test(stripped)) {
         inAlias = stripped.toLowerCase() === '[alias]';
         continue;
      }

      if (!inAlias) {
         continue;
      }

      const match = stripped.match(/^([A-Za-z0-9_.:-]+)\s*=/u);

      if (match) {
         targets.add(match[1]);
      }
   }

   return targets;
}

/**
 * Like `collectTaskSurface`, but keeps each runner's names in its own bucket so
 * callers can cross-reference `npm run X` against `npm` scripts specifically
 * rather than the flattened union of every runner's names.
 *
 * @returns {Promise<{ npm: Set<string>, make: Set<string>, just: Set<string>, task: Set<string>, cargo: Set<string> }>}
 */
export async function collectTaskSurfaceByRunner(root, files) {
   const taskFiles = await readCandidates(files, root, TASK_FILE_PATTERNS);
   const byRunner = {
      npm: new Set(),
      make: new Set(),
      just: new Set(),
      task: new Set(),
      cargo: new Set(),
   };

   for (const [ relpath, text ] of Object.entries(taskFiles)) {
      const lower = relpath.toLowerCase();

      if (lower.endsWith('package.json')) {
         for (const name of parsePackageScripts(text)) byRunner.npm.add(name);
      } else if (lower.endsWith('makefile')) {
         for (const name of parseMakeTargets(text)) byRunner.make.add(name);
      } else if (lower.endsWith('justfile')) {
         for (const name of parseJustTargets(text)) byRunner.just.add(name);
      } else if (lower.endsWith('.cargo/config.toml') || lower.endsWith('.cargo/config')) {
         for (const name of parseCargoAliases(text)) byRunner.cargo.add(name);
      } else if (lower.endsWith('.yml') || lower.endsWith('.yaml')) {
         for (const name of parseTaskfileTargets(text)) byRunner.task.add(name);
      }
   }

   return byRunner;
}

export async function collectTaskSurface(root, files) {
   const taskFiles = await readCandidates(files, root, TASK_FILE_PATTERNS);
   const taskSurface = new Set();
   const taskSurfaceFiles = new Set();
   const entrypointFiles = [];

   for (const [ relpath, text ] of Object.entries(taskFiles)) {
      entrypointFiles.push(relpath);

      const lower = relpath.toLowerCase();
      let parsed = null;

      if (lower.endsWith('package.json')) {
         parsed = parsePackageScripts(text);
         if (parsed.size > 0) {
            taskSurfaceFiles.add(relpath);
         }
      } else if (lower.endsWith('makefile')) {
         parsed = parseMakeTargets(text);
         taskSurfaceFiles.add(relpath);
      } else if (lower.endsWith('justfile')) {
         parsed = parseJustTargets(text);
         taskSurfaceFiles.add(relpath);
      } else if (lower.endsWith('.cargo/config.toml') || lower.endsWith('.cargo/config')) {
         parsed = parseCargoAliases(text);
         if (parsed.size > 0) {
            taskSurfaceFiles.add(relpath);
         }
      } else if (lower.endsWith('.yml') || lower.endsWith('.yaml')) {
         parsed = parseTaskfileTargets(text);
         taskSurfaceFiles.add(relpath);
      }

      if (parsed) {
         for (const name of parsed) {
            taskSurface.add(name);
         }
      }
   }

   return {
      task_surface: taskSurface,
      task_surface_files: taskSurfaceFiles,
      entrypoint_files: entrypointFiles,
   };
}

export function categorizeTaskSurface(taskSurface) {
   const categories = new Map();

   function add(category, name) {
      if (!categories.has(category)) {
         categories.set(category, new Set());
      }

      categories.get(category).add(name);
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
