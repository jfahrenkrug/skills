import { readCandidates } from '../lib/fs_walk.js';
import type { LanguageAdapter, TaskSurfaceResult } from './types.js';

export const PATTERNS = [ '.cargo/config.toml', '.cargo/config' ];

export function parseCargoAliases(text: string): Set<string> {
   const targets = new Set<string>();
   let inAlias = false;

   for (const line of text.split(/\r?\n/u)) {
      const stripped = line.trim();

      if (!stripped || stripped.startsWith('#')) continue;

      if (/^\[[^\]]+\]\s*$/u.test(stripped)) {
         inAlias = stripped.toLowerCase() === '[alias]';
         continue;
      }

      if (!inAlias) continue;

      const match = stripped.match(/^([A-Za-z0-9_.:-]+)\s*=/u);
      if (match) targets.add(match[1]);
   }

   return targets;
}

export const rustAdapter: LanguageAdapter = {
   id: 'cargo',
   displayName: 'Rust / Cargo',
   patterns: PATTERNS,

   detect(files) {
      return files.some((f) => f.toLowerCase().endsWith('.cargo/config.toml') || f.toLowerCase().endsWith('.cargo/config'));
   },

   async collectTaskSurface(root, files): Promise<TaskSurfaceResult> {
      const candidates = await readCandidates(files, root, PATTERNS);
      const names = new Set<string>();
      const sourceFiles = new Set<string>();

      for (const [ relpath, text ] of Object.entries(candidates)) {
         const parsed = parseCargoAliases(text);
         for (const n of parsed) names.add(n);
         if (parsed.size > 0) sourceFiles.add(relpath);
      }

      return { names, sourceFiles };
   },
};
