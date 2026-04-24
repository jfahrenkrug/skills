import { describe, it, beforeAll, afterAll } from 'vitest';
import { expect } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { parsePackageScripts, javascriptAdapter } from '../../src/languages/javascript.js';
import { parseMakeTargets, makeAdapter } from '../../src/languages/make.js';
import { parseJustTargets, justAdapter } from '../../src/languages/just.js';
import { parseTaskfileTargets, taskfileAdapter } from '../../src/languages/taskfile.js';
import { parseCargoAliases, rustAdapter } from '../../src/languages/rust.js';
import {
   ALL_ADAPTERS,
   TASK_FILE_NAMES,
   MANIFEST_FILE_NAMES,
   TASK_FILE_PATTERNS,
   categorizeTaskSurface,
   collectAllTaskSurfaces,
} from '../../src/languages/index.js';

async function mkTempDir(): Promise<string> {
   return fs.mkdtemp(path.join(os.tmpdir(), 'al-lang-'));
}

async function rmDir(dir: string): Promise<void> {
   await fs.rm(dir, { recursive: true, force: true });
}

describe('constants', () => {
   it('TASK_FILE_NAMES includes common task runner filenames', () => {
      expect(TASK_FILE_NAMES.has('package.json')).toBe(true);
      expect(TASK_FILE_NAMES.has('makefile')).toBe(true);
      expect(TASK_FILE_NAMES.has('justfile')).toBe(true);
   });

   it('MANIFEST_FILE_NAMES includes common manifest filenames', () => {
      expect(MANIFEST_FILE_NAMES.has('pyproject.toml')).toBe(true);
      expect(MANIFEST_FILE_NAMES.has('go.mod')).toBe(true);
      expect(MANIFEST_FILE_NAMES.has('gemfile')).toBe(true);
   });

   it('TASK_FILE_PATTERNS is non-empty', () => {
      expect(TASK_FILE_PATTERNS.length).toBeGreaterThan(0);
   });

   it('ALL_ADAPTERS contains all 5 adapters', () => {
      expect(ALL_ADAPTERS.length).toBe(5);
      const ids = ALL_ADAPTERS.map((a) => a.id);
      expect(ids).toContain('javascript');
      expect(ids).toContain('make');
      expect(ids).toContain('just');
      expect(ids).toContain('task');
      expect(ids).toContain('cargo');
   });
});

describe('parsePackageScripts', () => {
   it('extracts script names', () => {
      const text = JSON.stringify({ scripts: { build: 'x', test: 'y' } });
      const result = parsePackageScripts(text);
      expect(Array.from(result).sort()).toEqual([ 'build', 'test' ]);
   });

   it('returns empty set for malformed JSON', () => {
      expect(parsePackageScripts('not json').size).toBe(0);
   });

   it('returns empty set when scripts is absent or wrong type', () => {
      expect(parsePackageScripts('{}').size).toBe(0);
      expect(parsePackageScripts(JSON.stringify({ scripts: [] })).size).toBe(0);
      expect(parsePackageScripts(JSON.stringify({ scripts: 'oops' })).size).toBe(0);
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
      expect(result.has('build')).toBe(true);
      expect(result.has('test')).toBe(true);
      expect(result.has('.PHONY')).toBe(false);
   });
});

describe('parseJustTargets', () => {
   it('extracts recipe names', () => {
      const text = [ 'build:', '    cargo build', 'test:', '    cargo test' ].join('\n');
      const result = parseJustTargets(text);
      expect(Array.from(result).sort()).toEqual([ 'build', 'test' ]);
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
      expect(result.has('build')).toBe(true);
      expect(result.has('test')).toBe(true);
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
      expect(result.has('b')).toBe(true);
      expect(result.has('t')).toBe(true);
      expect(result.has('target')).toBe(false);
   });
});

describe('categorizeTaskSurface', () => {
   it('buckets standard commands into setup/dev/build/test/lint/format/check', () => {
      const surface = new Set([ 'setup', 'dev', 'build', 'test', 'lint', 'format', 'check' ]);
      const cats = categorizeTaskSurface(surface);
      expect(cats.setup).toEqual([ 'setup' ]);
      expect(cats.dev).toEqual([ 'dev' ]);
      expect(cats.build).toEqual([ 'build' ]);
      expect(cats.test).toEqual([ 'test' ]);
      expect(cats.lint).toEqual([ 'lint' ]);
      expect(cats.format).toEqual([ 'format' ]);
      expect(cats.check).toEqual([ 'check' ]);
   });

   it('handles colon-prefixed variants', () => {
      const surface = new Set([ 'test:unit', 'lint:eslint', 'format:rust' ]);
      const cats = categorizeTaskSurface(surface);
      expect(cats.test).toContain('test:unit');
      expect(cats.lint).toContain('lint:eslint');
      expect(cats.format).toContain('format:rust');
   });
});

describe('collectAllTaskSurfaces', () => {
   let tempDir: string;

   beforeAll(async () => {
      tempDir = await mkTempDir();
      await fs.writeFile(
         path.join(tempDir, 'package.json'),
         JSON.stringify({ scripts: { dev: 'vite', test: 'vitest' } }),
      );
      await fs.writeFile(
         path.join(tempDir, 'Makefile'),
         [ 'build:', '\tgcc main.c', 'check:', '\tmake build' ].join('\n'),
      );
   });

   afterAll(async () => {
      await rmDir(tempDir);
   });

   it('merges commands from multiple task files', async () => {
      const files = [ 'package.json', 'Makefile' ];
      const result = await collectAllTaskSurfaces(tempDir, files);
      expect(result.task_surface.has('dev')).toBe(true);
      expect(result.task_surface.has('test')).toBe(true);
      expect(result.task_surface.has('build')).toBe(true);
      expect(result.task_surface.has('check')).toBe(true);
   });

   it('records which files contributed to the surface', async () => {
      const files = [ 'package.json', 'Makefile' ];
      const result = await collectAllTaskSurfaces(tempDir, files);
      expect(result.task_surface_files.has('package.json')).toBe(true);
      expect(result.task_surface_files.has('Makefile')).toBe(true);
   });
});

describe('adapter detect()', () => {
   it('javascriptAdapter detects package.json', () => {
      expect(javascriptAdapter.detect([ 'package.json', 'src/index.ts' ])).toBe(true);
      expect(javascriptAdapter.detect([ 'Cargo.toml', 'src/main.rs' ])).toBe(false);
   });

   it('makeAdapter detects Makefile', () => {
      expect(makeAdapter.detect([ 'Makefile', 'src/main.c' ])).toBe(true);
      expect(makeAdapter.detect([ 'package.json' ])).toBe(false);
   });

   it('justAdapter detects justfile', () => {
      expect(justAdapter.detect([ 'justfile', 'src/main.rs' ])).toBe(true);
      expect(justAdapter.detect([ 'Makefile' ])).toBe(false);
   });

   it('taskfileAdapter detects Taskfile.yml', () => {
      expect(taskfileAdapter.detect([ 'Taskfile.yml' ])).toBe(true);
      expect(taskfileAdapter.detect([ 'package.json' ])).toBe(false);
   });

   it('rustAdapter detects .cargo/config.toml', () => {
      expect(rustAdapter.detect([ '.cargo/config.toml', 'src/main.rs' ])).toBe(true);
      expect(rustAdapter.detect([ 'Cargo.toml' ])).toBe(false);
   });
});
