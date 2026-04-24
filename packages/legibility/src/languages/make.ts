import { readCandidates } from '../lib/fs_walk.js';
import type { LanguageAdapter, TaskSurfaceResult } from './types.js';

export const PATTERNS = [ 'Makefile', 'makefile' ];

export function parseMakeTargets(text: string): Set<string> {
   const targets = new Set<string>();

   for (const line of text.split(/\r?\n/u)) {
      if (line.startsWith('\t') || line.startsWith(' ')) continue;

      const match = line.match(/^([A-Za-z0-9_.-]+):(?:\s|$)/u);

      if (match && !match[1].startsWith('.')) {
         targets.add(match[1]);
      }
   }

   return targets;
}

export const makeAdapter: LanguageAdapter = {
   id: 'make',
   displayName: 'GNU Make',
   patterns: PATTERNS,

   detect(files) {
      return files.some((f) => {
         const base = f.split('/').pop()?.toLowerCase();
         return base === 'makefile';
      });
   },

   async collectTaskSurface(root, files): Promise<TaskSurfaceResult> {
      const candidates = await readCandidates(files, root, PATTERNS);
      const names = new Set<string>();
      const sourceFiles = new Set<string>();

      for (const [ relpath, text ] of Object.entries(candidates)) {
         const parsed = parseMakeTargets(text);
         for (const n of parsed) names.add(n);
         sourceFiles.add(relpath);
      }

      return { names, sourceFiles };
   },
};
