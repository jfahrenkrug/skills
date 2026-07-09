import { readCandidates } from '../lib/fs_walk.js';
import type { LanguageAdapter, TaskSurfaceResult } from './types.js';

export const PATTERNS = [ 'package.json' ];

export function parsePackageScripts(text: string): Set<string> {
   try {
      const parsed: unknown = JSON.parse(text);
      if (
         typeof parsed !== 'object'
         || parsed === null
         || Array.isArray(parsed)
      ) return new Set();
      const scripts = (parsed as Record<string, unknown>).scripts;
      if (!scripts || typeof scripts !== 'object' || Array.isArray(scripts)) {
         return new Set();
      }
      return new Set(Object.keys(scripts as Record<string, unknown>).map((name) => String(name).trim()));
   } catch (_error) {
      return new Set();
   }
}

export const javascriptAdapter: LanguageAdapter = {
   id: 'javascript',
   displayName: 'JavaScript / Node.js',
   patterns: PATTERNS,

   detect(files) {
      return files.some((f) => f.toLowerCase().endsWith('package.json'));
   },

   async collectTaskSurface(root, files): Promise<TaskSurfaceResult> {
      const candidates = await readCandidates(files, root, PATTERNS);
      const names = new Set<string>();
      const sourceFiles = new Set<string>();

      for (const [ relpath, text ] of Object.entries(candidates)) {
         const parsed = parsePackageScripts(text);
         for (const n of parsed) names.add(n);
         if (parsed.size > 0) sourceFiles.add(relpath);
      }

      return { names, sourceFiles };
   },
};
