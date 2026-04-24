import { readCandidates } from '../lib/fs_walk.js';
import type { LanguageAdapter, TaskSurfaceResult } from './types.js';

export const PATTERNS = [ 'Taskfile.yml', 'Taskfile.yaml' ];

export function parseTaskfileTargets(text: string): Set<string> {
   const targets = new Set<string>();
   let inTasks = false;

   for (const line of text.split(/\r?\n/u)) {
      if (/^tasks:\s*$/u.test(line)) {
         inTasks = true;
         continue;
      }

      if (inTasks && /^[A-Za-z]/u.test(line)) break;
      if (!inTasks) continue;

      const match = line.match(/^\s{2,}([A-Za-z0-9_.-]+):\s*$/u);
      if (match) targets.add(match[1]);
   }

   return targets;
}

export const taskfileAdapter: LanguageAdapter = {
   id: 'task',
   displayName: 'Task (go-task)',
   patterns: PATTERNS,

   detect(files) {
      return files.some((f) => {
         const base = f.split('/').pop()?.toLowerCase();
         return base === 'taskfile.yml' || base === 'taskfile.yaml';
      });
   },

   async collectTaskSurface(root, files): Promise<TaskSurfaceResult> {
      const candidates = await readCandidates(files, root, PATTERNS);
      const names = new Set<string>();
      const sourceFiles = new Set<string>();

      for (const [ relpath, text ] of Object.entries(candidates)) {
         const parsed = parseTaskfileTargets(text);
         for (const n of parsed) names.add(n);
         sourceFiles.add(relpath);
      }

      return { names, sourceFiles };
   },
};
