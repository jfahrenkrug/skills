import { readCandidates } from '../lib/fs_walk.js';
import type { LanguageAdapter, TaskSurfaceResult } from './types.js';

export const PATTERNS = [ 'turbo.json' ];

export function parseTurboTasks(text: string): Set<string> {
   const names = new Set<string>();
   try {
      const parsed: unknown = JSON.parse(text);
      if (typeof parsed !== 'object' || parsed === null) return names;
      const obj = parsed as Record<string, unknown>;

      for (const key of [ 'pipeline', 'tasks' ]) {
         const value = obj[key];
         if (value && typeof value === 'object' && !Array.isArray(value)) {
            for (const taskKey of Object.keys(value as Record<string, unknown>)) {
               names.add(taskKey);
               const hashIdx = taskKey.indexOf('#');
               if (hashIdx !== -1) {
                  const stripped = taskKey.slice(hashIdx + 1);
                  if (stripped) names.add(stripped);
               }
            }
         }
      }
   } catch (_error) {
      return names;
   }
   return names;
}

export const turboAdapter: LanguageAdapter = {
   id: 'turbo',
   displayName: 'Turbo',
   patterns: PATTERNS,

   detect(files) {
      return files.some((f) => f.split('/').pop()?.toLowerCase() === 'turbo.json');
   },

   async collectTaskSurface(root, files): Promise<TaskSurfaceResult> {
      const candidates = await readCandidates(files, root, PATTERNS);
      const names = new Set<string>();
      const sourceFiles = new Set<string>();

      for (const [ relpath, text ] of Object.entries(candidates)) {
         const parsed = parseTurboTasks(text);
         for (const n of parsed) names.add(n);
         if (parsed.size > 0) sourceFiles.add(relpath);
      }

      return { names, sourceFiles };
   },
};
