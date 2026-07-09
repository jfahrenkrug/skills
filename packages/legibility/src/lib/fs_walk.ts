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

export function toPosix(value: string): string {
   return value.split(path.sep).join('/');
}

export function rel(root: string, absolutePath: string): string {
   return toPosix(path.relative(root, absolutePath));
}

function escapeRegex(value: string): string {
   return value.replace(/[|\\{}()[\]^$+?.]/gu, '\\$&');
}

export function globToRegExp(pattern: string): RegExp {
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

export function matchesExclude(relpath: string, patterns: string[]): boolean {
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

export async function readText(filePath: string): Promise<string> {
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

export async function isDirectory(targetPath: string): Promise<boolean> {
   try {
      return (await fs.stat(targetPath)).isDirectory();
   } catch (_error) {
      return false;
   }
}

export async function readDirEntries(targetPath: string): Promise<import('node:fs').Dirent[]> {
   try {
      return await fs.readdir(targetPath, { withFileTypes: true });
   } catch (_error) {
      return [];
   }
}

export async function walkRepo(root: string, excludes: string[] = []): Promise<string[]> {
   const excludePatterns = excludes
      .map((pattern) => pattern.trim().replace(/^\/+|\/+$/gu, ''))
      .filter(Boolean);
   const stack = [ root ];
   const results: string[] = [];

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

export function findFiles(paths: string[], ...patterns: string[]): string[] {
   const matchers = patterns.map(globToRegExp);

   return paths.filter((relpath) => {
      const basename = path.posix.basename(relpath);

      return matchers.some((matcher) => matcher.test(basename) || matcher.test(relpath));
   });
}

export async function readCandidates(
   paths: string[],
   root: string,
   patterns: string[],
): Promise<Record<string, string>> {
   const selected: Record<string, string> = {};

   for (const relpath of findFiles(paths, ...patterns)) {
      selected[relpath] = await readText(path.join(root, relpath));
   }

   return selected;
}
