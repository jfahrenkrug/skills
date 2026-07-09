import { readCandidates } from '../lib/fs_walk.js';
import type { LanguageAdapter, TaskSurfaceResult } from './types.js';

export const PATTERNS = [ 'pom.xml' ];

const PROFILE_ID = /<profile>[\s\S]*?<id>\s*([A-Za-z0-9_.:-]+)\s*<\/id>/gu;
const GOAL = /<goal>\s*([A-Za-z0-9_.:-]+)\s*<\/goal>/gu;

export function parseMavenGoals(text: string): Set<string> {
   const names = new Set<string>();

   for (const regex of [ PROFILE_ID, GOAL ]) {
      regex.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = regex.exec(text)) !== null) {
         names.add(match[1]);
      }
   }

   return names;
}

export const mavenAdapter: LanguageAdapter = {
   id: 'maven',
   displayName: 'Maven',
   patterns: PATTERNS,

   detect(files) {
      return files.some((f) => f.split('/').pop()?.toLowerCase() === 'pom.xml');
   },

   async collectTaskSurface(root, files): Promise<TaskSurfaceResult> {
      const candidates = await readCandidates(files, root, PATTERNS);
      const names = new Set<string>();
      const sourceFiles = new Set<string>();

      for (const [ relpath, text ] of Object.entries(candidates)) {
         const parsed = parseMavenGoals(text);
         for (const n of parsed) names.add(n);
         if (parsed.size > 0) sourceFiles.add(relpath);
      }

      return { names, sourceFiles };
   },
};
