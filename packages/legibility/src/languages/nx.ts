import { readCandidates } from '../lib/fs_walk.js';
import type { LanguageAdapter, TaskSurfaceResult } from './types.js';

export const PATTERNS = [ 'nx.json', 'project.json' ];

export function parseNxTargets(text: string): Set<string> {
   const names = new Set<string>();
   try {
      const parsed: unknown = JSON.parse(text);
      if (typeof parsed !== 'object' || parsed === null) return names;
      const obj = parsed as Record<string, unknown>;

      const targets = obj.targets;
      if (targets && typeof targets === 'object' && !Array.isArray(targets)) {
         for (const key of Object.keys(targets as Record<string, unknown>)) {
            names.add(key);
         }
      }

      const targetDefaults = obj.targetDefaults;
      if (targetDefaults && typeof targetDefaults === 'object' && !Array.isArray(targetDefaults)) {
         for (const key of Object.keys(targetDefaults as Record<string, unknown>)) {
            names.add(key);
         }
      }
   } catch (_error) {
      return names;
   }
   return names;
}

export const nxAdapter: LanguageAdapter = {
   id: 'nx',
   displayName: 'Nx',
   patterns: PATTERNS,

   detect(files) {
      return files.some((f) => {
         const base = f.split('/').pop()?.toLowerCase();
         return base === 'nx.json' || base === 'project.json';
      });
   },

   async collectTaskSurface(root, files): Promise<TaskSurfaceResult> {
      const candidates = await readCandidates(files, root, PATTERNS);
      const names = new Set<string>();
      const sourceFiles = new Set<string>();

      for (const [ relpath, text ] of Object.entries(candidates)) {
         const parsed = parseNxTargets(text);
         for (const n of parsed) names.add(n);
         if (parsed.size > 0) sourceFiles.add(relpath);
      }

      return { names, sourceFiles };
   },
};
