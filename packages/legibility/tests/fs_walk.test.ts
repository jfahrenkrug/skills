import { describe, it, beforeAll, afterAll } from 'vitest';
import { expect } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
   IGNORED_DIRS,
   IGNORED_PATH_PATTERNS,
   DOC_EXTENSIONS,
   MAX_TEXT_SIZE,
   toPosix,
   rel,
   globToRegExp,
   matchesExclude,
   walkRepo,
   findFiles,
   readText,
   isDirectory,
} from '../src/lib/fs_walk.js';

async function mkTempDir(): Promise<string> {
   return await fs.mkdtemp(path.join(os.tmpdir(), 'al-fs-walk-'));
}

async function rmDir(dir: string): Promise<void> {
   await fs.rm(dir, { recursive: true, force: true });
}

describe('fs_walk', () => {
   describe('constants', () => {
      it('ignores common build and dependency directories', () => {
         expect(IGNORED_DIRS.has('node_modules')).toBe(true);
         expect(IGNORED_DIRS.has('.git')).toBe(true);
         expect(IGNORED_DIRS.has('dist')).toBe(true);
         expect(IGNORED_DIRS.has('src')).toBe(false);
      });

      it('ignores agent-tool config/skill folders not owned by the project', () => {
         expect(IGNORED_DIRS.has('.claude')).toBe(true);
         expect(IGNORED_DIRS.has('.cursor')).toBe(true);
         expect(IGNORED_DIRS.has('.windsurf')).toBe(true);
         expect(IGNORED_DIRS.has('.codex')).toBe(true);
         expect(IGNORED_DIRS.has('.aider')).toBe(true);
         expect(IGNORED_DIRS.has('.continue')).toBe(true);
         expect(IGNORED_DIRS.has('.cline')).toBe(true);
         expect(IGNORED_DIRS.has('.roo')).toBe(true);
         expect(IGNORED_DIRS.has('.gemini')).toBe(true);
         expect(IGNORED_DIRS.has('.opencode')).toBe(true);
         expect(IGNORED_DIRS.has('.amazonq')).toBe(true);
      });

      it('does not ignore .agents/, the project-owned exec-plans directory', () => {
         expect(IGNORED_DIRS.has('.agents')).toBe(false);
      });

      it('path-excludes .agents/skills/, the vendored skill packages under .agents/', () => {
         expect(IGNORED_PATH_PATTERNS).toContain('.agents/skills');
      });

      it('recognizes documentation extensions', () => {
         expect(DOC_EXTENSIONS.has('.md')).toBe(true);
         expect(DOC_EXTENSIONS.has('.mdx')).toBe(true);
         expect(DOC_EXTENSIONS.has('.rst')).toBe(true);
         expect(DOC_EXTENSIONS.has('.js')).toBe(false);
      });

      it('defines a text-size limit', () => {
         expect(typeof MAX_TEXT_SIZE).toBe('number');
         expect(MAX_TEXT_SIZE).toBeGreaterThan(0);
      });
   });

   describe('toPosix and rel', () => {
      it('normalizes native separators to forward slashes', () => {
         const mixed = [ 'a', 'b', 'c' ].join(path.sep);
         expect(toPosix(mixed)).toBe('a/b/c');
      });

      it('returns repo-relative posix paths from absolute inputs', () => {
         const root = path.join('tmp', 'root');
         const file = path.join('tmp', 'root', 'sub', 'file.md');
         expect(rel(root, file)).toBe('sub/file.md');
      });
   });

   describe('globToRegExp and matchesExclude', () => {
      it('converts single-star globs correctly', () => {
         const rex = globToRegExp('*.md');
         expect(rex.test('README.md')).toBe(true);
         expect(rex.test('sub/README.md')).toBe(false);
      });

      it('converts double-star globs correctly', () => {
         const rex = globToRegExp('**/*.md');
         expect(rex.test('README.md')).toBe(false);
         expect(rex.test('a/README.md')).toBe(true);
         expect(rex.test('a/b/README.md')).toBe(true);
      });

      it('matches exact path excludes', () => {
         expect(matchesExclude('docs/generated', [ 'docs/generated' ])).toBe(true);
         expect(matchesExclude('docs/generated/foo.md', [ 'docs/generated' ])).toBe(true);
      });

      it('returns false for empty pattern list', () => {
         expect(matchesExclude('any/path', [])).toBe(false);
      });

      it('matches glob-style excludes', () => {
         expect(matchesExclude('build/output.js', [ 'build/*' ])).toBe(true);
         expect(matchesExclude('src/main.js', [ 'build/*' ])).toBe(false);
      });
   });

   describe('walkRepo', () => {
      let tempDir: string;

      beforeAll(async () => {
         tempDir = await mkTempDir();
         await fs.mkdir(path.join(tempDir, 'src'), { recursive: true });
         await fs.mkdir(path.join(tempDir, 'node_modules', 'dep'), { recursive: true });
         await fs.mkdir(path.join(tempDir, 'docs'), { recursive: true });
         await fs.mkdir(path.join(tempDir, '.claude', 'skills', 'some-skill'), { recursive: true });
         await fs.mkdir(path.join(tempDir, '.agents', 'skills', 'vendored-skill'), { recursive: true });
         await fs.writeFile(path.join(tempDir, 'README.md'), '# hi');
         await fs.writeFile(path.join(tempDir, 'src', 'main.js'), '// main');
         await fs.writeFile(path.join(tempDir, 'node_modules', 'dep', 'index.js'), '// dep');
         await fs.writeFile(path.join(tempDir, 'docs', 'intro.md'), '# intro');
         await fs.writeFile(path.join(tempDir, '.claude', 'skills', 'some-skill', 'SKILL.md'), '# skill');
         await fs.writeFile(path.join(tempDir, '.agents', 'PLANS.md'), '# plans');
         await fs.writeFile(path.join(tempDir, '.agents', 'skills', 'vendored-skill', 'SKILL.md'), '# vendored skill');
      });

      afterAll(async () => {
         await rmDir(tempDir);
      });

      it('returns repo-relative paths with forward slashes', async () => {
         const files = await walkRepo(tempDir);
         for (const relpath of files) {
            expect(path.sep === '/' ? true : !relpath.includes('\\')).toBe(true);
         }
      });

      it('skips IGNORED_DIRS entries', async () => {
         const files = await walkRepo(tempDir);
         expect(files.some((f) => f.startsWith('node_modules/'))).toBe(false);
      });

      it('skips agent-tool folders such as .claude', async () => {
         const files = await walkRepo(tempDir);
         expect(files.some((f) => f.startsWith('.claude/'))).toBe(false);
      });

      it('does not skip the project-owned .agents/ directory', async () => {
         const files = await walkRepo(tempDir);
         expect(files.includes('.agents/PLANS.md')).toBe(true);
      });

      it('skips vendored skill packages under .agents/skills/', async () => {
         const files = await walkRepo(tempDir);
         expect(files.some((f) => f.startsWith('.agents/skills/'))).toBe(false);
      });

      it('enumerates files inside non-ignored dirs', async () => {
         const files = await walkRepo(tempDir);
         expect(files.includes('README.md')).toBe(true);
         expect(files.includes('src/main.js')).toBe(true);
         expect(files.includes('docs/intro.md')).toBe(true);
      });

      it('respects custom excludes', async () => {
         const files = await walkRepo(tempDir, [ 'docs' ]);
         expect(files.some((f) => f.startsWith('docs/'))).toBe(false);
         expect(files.includes('src/main.js')).toBe(true);
      });
   });

   describe('findFiles', () => {
      it('matches by basename pattern', () => {
         const files = [ 'pkg/package.json', 'src/main.js', 'Makefile' ];
         const matched = findFiles(files, 'package.json', 'Makefile');
         expect(matched.sort()).toEqual([ 'Makefile', 'pkg/package.json' ]);
      });

      it('matches by full-path glob pattern', () => {
         const files = [ '.cargo/config.toml', 'src/main.rs' ];
         const matched = findFiles(files, '.cargo/config.toml');
         expect(matched).toEqual([ '.cargo/config.toml' ]);
      });
   });

   describe('readText and isDirectory', () => {
      let tempDir: string;

      beforeAll(async () => {
         tempDir = await mkTempDir();
         await fs.writeFile(path.join(tempDir, 'small.txt'), 'hello');
      });

      afterAll(async () => {
         await rmDir(tempDir);
      });

      it('reads small text files', async () => {
         const text = await readText(path.join(tempDir, 'small.txt'));
         expect(text).toBe('hello');
      });

      it('returns empty string for non-existent files', async () => {
         const text = await readText(path.join(tempDir, 'missing.txt'));
         expect(text).toBe('');
      });

      it('detects directories', async () => {
         expect(await isDirectory(tempDir)).toBe(true);
         expect(await isDirectory(path.join(tempDir, 'small.txt'))).toBe(false);
         expect(await isDirectory(path.join(tempDir, 'missing'))).toBe(false);
      });
   });
});
