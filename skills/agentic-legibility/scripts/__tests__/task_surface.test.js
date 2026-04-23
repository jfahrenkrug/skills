import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
   TASK_FILE_NAMES,
   MANIFEST_FILE_NAMES,
   TASK_FILE_PATTERNS,
   parsePackageScripts,
   parseMakeTargets,
   parseJustTargets,
   parseTaskfileTargets,
   parseCargoAliases,
   categorizeTaskSurface,
   collectTaskSurface,
} from '../lib/task_surface.js';

async function mkTempDir() {
   return await fs.mkdtemp(path.join(os.tmpdir(), 'al-task-surface-'));
}

async function rmDir(dir) {
   await fs.rm(dir, { recursive: true, force: true });
}

describe('task_surface', () => {
   describe('constants', () => {
      it('includes the common task runner filenames', () => {
         assert.equal(TASK_FILE_NAMES.has('package.json'), true);
         assert.equal(TASK_FILE_NAMES.has('makefile'), true);
         assert.equal(TASK_FILE_NAMES.has('justfile'), true);
      });

      it('includes the common manifest filenames', () => {
         assert.equal(MANIFEST_FILE_NAMES.has('pyproject.toml'), true);
         assert.equal(MANIFEST_FILE_NAMES.has('go.mod'), true);
         assert.equal(MANIFEST_FILE_NAMES.has('Gemfile'.toLowerCase()), true);
      });

      it('has non-empty task file patterns', () => {
         assert.ok(TASK_FILE_PATTERNS.length > 0);
      });
   });

   describe('parsePackageScripts', () => {
      it('extracts script names', () => {
         const text = JSON.stringify({ scripts: { build: 'x', test: 'y' } });
         const result = parsePackageScripts(text);
         assert.deepEqual(Array.from(result).sort(), [ 'build', 'test' ]);
      });

      it('returns empty set for malformed JSON', () => {
         assert.equal(parsePackageScripts('not json').size, 0);
      });

      it('returns empty set when scripts is absent or wrong type', () => {
         assert.equal(parsePackageScripts('{}').size, 0);
         assert.equal(parsePackageScripts(JSON.stringify({ scripts: [] })).size, 0);
         assert.equal(parsePackageScripts(JSON.stringify({ scripts: 'oops' })).size, 0);
      });
   });

   describe('parseMakeTargets', () => {
      it('extracts target names and skips indented lines', () => {
         const text = [
            'build:',
            '\tgcc -o out main.c',
            'test: build',
            '\t./out',
            '.PHONY: build test',
         ].join('\n');
         const result = parseMakeTargets(text);
         assert.equal(result.has('build'), true);
         assert.equal(result.has('test'), true);
         assert.equal(result.has('.PHONY'), false);
      });
   });

   describe('parseJustTargets', () => {
      it('extracts recipe names', () => {
         const text = [ 'build:', '    cargo build', 'test:', '    cargo test' ].join('\n');
         const result = parseJustTargets(text);
         assert.deepEqual(Array.from(result).sort(), [ 'build', 'test' ]);
      });
   });

   describe('parseTaskfileTargets', () => {
      it('extracts task names from the tasks: section', () => {
         const text = [
            'version: 3',
            'tasks:',
            '  build:',
            '    cmds:',
            '      - echo build',
            '  test:',
            '    cmds:',
            '      - echo test',
            'vars: {}',
         ].join('\n');
         const result = parseTaskfileTargets(text);
         assert.equal(result.has('build'), true);
         assert.equal(result.has('test'), true);
      });
   });

   describe('parseCargoAliases', () => {
      it('extracts aliases from the [alias] section', () => {
         const text = [
            '[alias]',
            'b = "build"',
            't = "test"',
            '',
            '[build]',
            'target = "wasm32"',
         ].join('\n');
         const result = parseCargoAliases(text);
         assert.equal(result.has('b'), true);
         assert.equal(result.has('t'), true);
         assert.equal(result.has('target'), false);
      });
   });

   describe('categorizeTaskSurface', () => {
      it('buckets standard commands into setup/dev/build/test/lint/format/check', () => {
         const surface = new Set([
            'setup', 'dev', 'build', 'test', 'lint', 'format', 'check',
         ]);
         const cats = categorizeTaskSurface(surface);
         assert.deepEqual(cats.setup, [ 'setup' ]);
         assert.deepEqual(cats.dev, [ 'dev' ]);
         assert.deepEqual(cats.build, [ 'build' ]);
         assert.deepEqual(cats.test, [ 'test' ]);
         assert.deepEqual(cats.lint, [ 'lint' ]);
         assert.deepEqual(cats.format, [ 'format' ]);
         assert.deepEqual(cats.check, [ 'check' ]);
      });

      it('handles colon-prefixed variants', () => {
         const surface = new Set([ 'test:unit', 'lint:eslint', 'format:rust' ]);
         const cats = categorizeTaskSurface(surface);
         assert.ok(cats.test.includes('test:unit'));
         assert.ok(cats.lint.includes('lint:eslint'));
         assert.ok(cats.format.includes('format:rust'));
      });
   });

   describe('collectTaskSurface', () => {
      let tempDir;

      before(async () => {
         tempDir = await mkTempDir();
         await fs.writeFile(
            path.join(tempDir, 'package.json'),
            JSON.stringify({ scripts: { dev: 'vite', test: 'vitest' } })
         );
         await fs.writeFile(
            path.join(tempDir, 'Makefile'),
            [ 'build:', '\tgcc main.c', 'check:', '\tmake build' ].join('\n')
         );
      });

      after(async () => {
         await rmDir(tempDir);
      });

      it('merges commands from multiple task files', async () => {
         const files = [ 'package.json', 'Makefile' ];
         const result = await collectTaskSurface(tempDir, files);
         assert.equal(result.task_surface.has('dev'), true);
         assert.equal(result.task_surface.has('test'), true);
         assert.equal(result.task_surface.has('build'), true);
         assert.equal(result.task_surface.has('check'), true);
      });

      it('records which files contributed to the surface', async () => {
         const files = [ 'package.json', 'Makefile' ];
         const result = await collectTaskSurface(tempDir, files);
         assert.equal(result.task_surface_files.has('package.json'), true);
         assert.equal(result.task_surface_files.has('Makefile'), true);
      });
   });
});
