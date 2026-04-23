// Filesystem traversal and text reading helpers.
//
// This module owns the conventions for walking a repository without descending
// into build outputs, caches, or vendored dependencies, plus the small utilities
// that go with that: path normalization, glob-to-regex conversion, and bounded
// text reads.  The rest of the skill composes these primitives.

import { promises as fs } from 'node:fs';
import path from 'node:path';

export const IGNORED_DIRS = new Set([
   '.git',
   '.hg',
   '.mypy_cache',
   '.next',
   '.nuxt',
   '.pytest_cache',
   '.svn',
   '.turbo',
   '.venv',
   '.yarn',
   '__pycache__',
   'build',
   'coverage',
   'dist',
   'node_modules',
   'out',
   'target',
   'vendor',
]);

export const DOC_EXTENSIONS = new Set([ '.md', '.mdx', '.rst', '.txt' ]);

export const MAX_TEXT_SIZE = 250_000;

export function toPosix(value) {
   return value.split(path.sep).join('/');
}

export function rel(root, absolutePath) {
   return toPosix(path.relative(root, absolutePath));
}

function escapeRegex(value) {
   return value.replace(/[|\\{}()[\]^$+?.]/gu, '\\$&');
}

export function globToRegExp(pattern) {
   let result = '';

   for (let index = 0; index < pattern.length; index += 1) {
      const char = pattern[index];
      const next = pattern[index + 1];

      if (char === '*' && next === '*') {
         result += '.*';
         index += 1;
      } else if (char === '*') {
         result += '[^/]*';
      } else if (char === '?') {
         result += '.';
      } else {
         result += escapeRegex(char);
      }
   }

   return new RegExp(`^${result}$`, 'u');
}

export function matchesExclude(relpath, patterns) {
   if (patterns.length === 0) {
      return false;
   }

   return patterns.some((pattern) => {
      const trimmed = pattern.replace(/\/+$/gu, '');

      if (relpath === pattern || relpath.startsWith(`${trimmed}/`)) {
         return true;
      }

      return globToRegExp(pattern).test(relpath);
   });
}

export async function readText(filePath) {
   try {
      const stat = await fs.stat(filePath);

      if (stat.size > MAX_TEXT_SIZE) {
         return '';
      }

      return await fs.readFile(filePath, 'utf8');
   } catch (_error) {
      return '';
   }
}

export async function isDirectory(targetPath) {
   try {
      return (await fs.stat(targetPath)).isDirectory();
   } catch (_error) {
      return false;
   }
}

export async function readDirEntries(targetPath) {
   try {
      return await fs.readdir(targetPath, { withFileTypes: true });
   } catch (_error) {
      return [];
   }
}

export async function walkRepo(root, excludes = []) {
   const excludePatterns = excludes
      .map((pattern) => pattern.trim().replace(/^\/+|\/+$/gu, ''))
      .filter(Boolean);
   const stack = [ root ];
   const results = [];

   while (stack.length > 0) {
      const current = stack.pop();

      if (!current) {
         continue;
      }

      const entries = await readDirEntries(current);

      for (const entry of entries) {
         const absolutePath = path.join(current, entry.name);
         const relpath = rel(root, absolutePath);

         if (matchesExclude(relpath, excludePatterns)) {
            continue;
         }

         if (entry.isDirectory()) {
            if (!IGNORED_DIRS.has(entry.name)) {
               stack.push(absolutePath);
            }
         } else {
            results.push(relpath);
         }
      }
   }

   return results;
}

export function findFiles(paths, ...patterns) {
   return paths.filter((relpath) => {
      const basename = path.posix.basename(relpath);

      return patterns.some((pattern) => {
         const matcher = globToRegExp(pattern);

         return matcher.test(basename) || matcher.test(relpath);
      });
   });
}

export async function readCandidates(paths, root, patterns) {
   const selected = {};

   for (const relpath of findFiles(paths, ...patterns)) {
      selected[relpath] = await readText(path.join(root, relpath));
   }

   return selected;
}
