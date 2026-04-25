import path from 'node:path';
import { findFiles } from '../lib/fs_walk.js';
import type { LanguageAdapter, TaskSurfaceResult } from './types.js';

export const PATTERNS = [ 'mix.exs' ];

const BUILTIN_MIX_TASKS = [
   'compile',
   'deps.get',
   'deps.update',
   'deps.compile',
   'test',
   'format',
   'release',
   'phx.server',
   'phx.routes',
   'ecto.create',
   'ecto.migrate',
   'ecto.rollback',
   'run',
   'new',
   'help',
];

export function deriveMixTaskName(relpath: string): string | null {
   const base = path.posix.basename(relpath);
   if (!base.endsWith('.ex')) return null;
   const stem = base.slice(0, -3);
   if (!stem) return null;
   return stem;
}

export const mixAdapter: LanguageAdapter = {
   id: 'mix',
   displayName: 'Mix (Elixir)',
   patterns: PATTERNS,

   detect(files) {
      return files.some((f) => f.split('/').pop()?.toLowerCase() === 'mix.exs');
   },

   async collectTaskSurface(_root, files): Promise<TaskSurfaceResult> {
      const names = new Set<string>();
      const sourceFiles = new Set<string>();

      const mixFiles = findFiles(files, 'mix.exs');
      if (mixFiles.length === 0) {
         return { names, sourceFiles };
      }

      for (const t of BUILTIN_MIX_TASKS) names.add(t);

      const taskFiles = files.filter((relpath) => {
         return /(^|\/)lib\/mix\/tasks\/[^/]+\.ex$/u.test(relpath);
      });

      for (const taskFile of taskFiles) {
         const name = deriveMixTaskName(taskFile);
         if (name) names.add(name);
      }

      for (const f of mixFiles) sourceFiles.add(f);

      return { names, sourceFiles };
   },
};
