import { readCandidates } from '../lib/fs_walk.js';
import type { LanguageAdapter, TaskSurfaceResult } from './types.js';

export const PATTERNS = [ 'justfile', 'Justfile' ];

export function parseJustTargets(text: string): Set<string> {
   const targets = new Set<string>();

   for (const line of text.split(/\r?\n/u)) {
      const match = line.match(/^([A-Za-z0-9_.-]+):(?:\s|$)/u);
      if (match) targets.add(match[1]);
   }

   return targets;
}

export const justAdapter: LanguageAdapter = {
   id: 'just',
   displayName: 'just',
   patterns: PATTERNS,

   detect(files) {
      return files.some((f) => {
         const base = f.split('/').pop()?.toLowerCase();
         return base === 'justfile';
      });
   },

   async collectTaskSurface(root, files): Promise<TaskSurfaceResult> {
      const candidates = await readCandidates(files, root, PATTERNS);
      const names = new Set<string>();
      const sourceFiles = new Set<string>();

      for (const [ relpath, text ] of Object.entries(candidates)) {
         const parsed = parseJustTargets(text);
         for (const n of parsed) names.add(n);
         sourceFiles.add(relpath);
      }

      return { names, sourceFiles };
   },
};
