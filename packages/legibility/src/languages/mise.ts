import { readCandidates } from '../lib/fs_walk.js';
import type { LanguageAdapter, TaskSurfaceResult } from './types.js';

export const PATTERNS = [ '.mise.toml', 'mise.toml' ];

export function parseMiseTasks(text: string): Set<string> {
   const names = new Set<string>();
   const lines = text.split(/\r?\n/u);
   for (const line of lines) {
      const match = line.match(/^\s*\[tasks\.([A-Za-z0-9_:.-]+)\]\s*(?:#.*)?$/u);
      if (match) {
         names.add(match[1]);
      }
   }
   const inlineTableSection = text.match(/^\s*\[tasks\]\s*$/mu);
   if (inlineTableSection) {
      const startIndex = (inlineTableSection.index ?? 0);
      const after = text.slice(startIndex).split(/\r?\n/u).slice(1);
      for (const line of after) {
         if (/^\s*\[/.test(line)) break;
         const m = line.match(/^\s*([A-Za-z0-9_:.-]+)\s*=/u);
         if (m) names.add(m[1]);
      }
   }
   return names;
}

export const miseAdapter: LanguageAdapter = {
   id: 'mise',
   displayName: 'mise',
   patterns: PATTERNS,

   detect(files) {
      return files.some((f) => {
         const base = f.split('/').pop()?.toLowerCase();
         return base === '.mise.toml' || base === 'mise.toml';
      });
   },

   async collectTaskSurface(root, files): Promise<TaskSurfaceResult> {
      const candidates = await readCandidates(files, root, PATTERNS);
      const names = new Set<string>();
      const sourceFiles = new Set<string>();

      for (const [ relpath, text ] of Object.entries(candidates)) {
         const parsed = parseMiseTasks(text);
         for (const n of parsed) names.add(n);
         if (parsed.size > 0) sourceFiles.add(relpath);
      }

      return { names, sourceFiles };
   },
};
