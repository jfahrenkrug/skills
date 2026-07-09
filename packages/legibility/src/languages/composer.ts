import { readCandidates } from '../lib/fs_walk.js';
import type { LanguageAdapter, TaskSurfaceResult } from './types.js';

export const PATTERNS = [ 'composer.json' ];

export function parseComposerScripts(text: string): Set<string> {
   const names = new Set<string>();
   let data: unknown;
   try {
      data = JSON.parse(text);
   } catch {
      return names;
   }
   if (!data || typeof data !== 'object') return names;
   const scripts = (data as { scripts?: unknown }).scripts;
   if (!scripts || typeof scripts !== 'object' || Array.isArray(scripts)) return names;
   for (const key of Object.keys(scripts)) {
      names.add(key);
   }
   return names;
}

export const composerAdapter: LanguageAdapter = {
   id: 'composer',
   displayName: 'Composer',
   patterns: PATTERNS,

   detect(files) {
      return files.some((f) => f.split('/').pop()?.toLowerCase() === 'composer.json');
   },

   async collectTaskSurface(root, files): Promise<TaskSurfaceResult> {
      const candidates = await readCandidates(files, root, PATTERNS);
      const names = new Set<string>();
      const sourceFiles = new Set<string>();

      for (const [ relpath, text ] of Object.entries(candidates)) {
         const parsed = parseComposerScripts(text);
         for (const n of parsed) names.add(n);
         if (parsed.size > 0) sourceFiles.add(relpath);
      }

      return { names, sourceFiles };
   },
};
