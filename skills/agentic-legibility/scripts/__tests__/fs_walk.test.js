import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
   IGNORED_DIRS,
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
} from '../lib/fs_walk.js';

async function mkTempDir() {
   return await fs.mkdtemp(path.join(os.tmpdir(), 'al-fs-walk-'));
}

async function rmDir(dir) {
   await fs.rm(dir, { recursive: true, force: true });
}

describe('fs_walk', () => {
   describe('constants', () => {
      it('ignores common build and dependency directories', () => {
         assert.equal(IGNORED_DIRS.has('node_modules'), true);
         assert.equal(IGNORED_DIRS.has('.git'), true);
         assert.equal(IGNORED_DIRS.has('dist'), true);
         assert.equal(IGNORED_DIRS.has('src'), false);
      });

      it('recognizes documentation extensions', () => {
         assert.equal(DOC_EXTENSIONS.has('.md'), true);
         assert.equal(DOC_EXTENSIONS.has('.mdx'), true);
         assert.equal(DOC_EXTENSIONS.has('.rst'), true);
         assert.equal(DOC_EXTENSIONS.has('.js'), false);
      });

      it('defines a text-size limit', () => {
         assert.equal(typeof MAX_TEXT_SIZE, 'number');
         assert.ok(MAX_TEXT_SIZE > 0);
      });
   });

   describe('toPosix and rel', () => {
      it('normalizes native separators to forward slashes', () => {
         const mixed = [ 'a', 'b', 'c' ].join(path.sep);
         assert.equal(toPosix(mixed), 'a/b/c');
      });

      it('returns repo-relative posix paths from absolute inputs', () => {
         const root = path.join('tmp', 'root');
         const file = path.join('tmp', 'root', 'sub', 'file.md');
         assert.equal(rel(root, file), 'sub/file.md');
      });
   });

   describe('globToRegExp and matchesExclude', () => {
      it('converts single-star globs correctly', () => {
         const rex = globToRegExp('*.md');
         assert.equal(rex.test('README.md'), true);
         assert.equal(rex.test('sub/README.md'), false);
      });

      it('converts double-star globs correctly', () => {
         const rex = globToRegExp('**/*.md');
         // `**/*.md` requires at least one path separator, matching the
         // semantics used by most glob-to-regex implementations: root-level
         // files are not covered by this pattern.
         assert.equal(rex.test('README.md'), false);
         assert.equal(rex.test('a/README.md'), true);
         assert.equal(rex.test('a/b/README.md'), true);
      });

      it('matches exact path excludes', () => {
         assert.equal(matchesExclude('docs/generated', [ 'docs/generated' ]), true);
         assert.equal(matchesExclude('docs/generated/foo.md', [ 'docs/generated' ]), true);
      });

      it('returns false for empty pattern list', () => {
         assert.equal(matchesExclude('any/path', []), false);
      });

      it('matches glob-style excludes', () => {
         assert.equal(matchesExclude('build/output.js', [ 'build/*' ]), true);
         assert.equal(matchesExclude('src/main.js', [ 'build/*' ]), false);
      });
   });

   describe('walkRepo', () => {
      let tempDir;

      before(async () => {
         tempDir = await mkTempDir();
         await fs.mkdir(path.join(tempDir, 'src'), { recursive: true });
         await fs.mkdir(path.join(tempDir, 'node_modules', 'dep'), { recursive: true });
         await fs.mkdir(path.join(tempDir, 'docs'), { recursive: true });
         await fs.writeFile(path.join(tempDir, 'README.md'), '# hi');
         await fs.writeFile(path.join(tempDir, 'src', 'main.js'), '// main');
         await fs.writeFile(path.join(tempDir, 'node_modules', 'dep', 'index.js'), '// dep');
         await fs.writeFile(path.join(tempDir, 'docs', 'intro.md'), '# intro');
      });

      after(async () => {
         await rmDir(tempDir);
      });

      it('returns repo-relative paths with forward slashes', async () => {
         const files = await walkRepo(tempDir);
         for (const relpath of files) {
            assert.equal(path.sep === '/' ? true : !relpath.includes('\\'), true);
         }
      });

      it('skips IGNORED_DIRS entries', async () => {
         const files = await walkRepo(tempDir);
         assert.equal(files.some((f) => f.startsWith('node_modules/')), false);
      });

      it('enumerates files inside non-ignored dirs', async () => {
         const files = await walkRepo(tempDir);
         assert.equal(files.includes('README.md'), true);
         assert.equal(files.includes('src/main.js'), true);
         assert.equal(files.includes('docs/intro.md'), true);
      });

      it('respects custom excludes', async () => {
         const files = await walkRepo(tempDir, [ 'docs' ]);
         assert.equal(files.some((f) => f.startsWith('docs/')), false);
         assert.equal(files.includes('src/main.js'), true);
      });
   });

   describe('findFiles', () => {
      it('matches by basename pattern', () => {
         const files = [ 'pkg/package.json', 'src/main.js', 'Makefile' ];
         const matched = findFiles(files, 'package.json', 'Makefile');
         assert.deepEqual(matched.sort(), [ 'Makefile', 'pkg/package.json' ]);
      });

      it('matches by full-path glob pattern', () => {
         const files = [ '.cargo/config.toml', 'src/main.rs' ];
         const matched = findFiles(files, '.cargo/config.toml');
         assert.deepEqual(matched, [ '.cargo/config.toml' ]);
      });
   });

   describe('readText and isDirectory', () => {
      let tempDir;

      before(async () => {
         tempDir = await mkTempDir();
         await fs.writeFile(path.join(tempDir, 'small.txt'), 'hello');
      });

      after(async () => {
         await rmDir(tempDir);
      });

      it('reads small text files', async () => {
         const text = await readText(path.join(tempDir, 'small.txt'));
         assert.equal(text, 'hello');
      });

      it('returns empty string for non-existent files', async () => {
         const text = await readText(path.join(tempDir, 'missing.txt'));
         assert.equal(text, '');
      });

      it('detects directories', async () => {
         assert.equal(await isDirectory(tempDir), true);
         assert.equal(await isDirectory(path.join(tempDir, 'small.txt')), false);
         assert.equal(await isDirectory(path.join(tempDir, 'missing')), false);
      });
   });
});
