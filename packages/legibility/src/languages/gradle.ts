import { readCandidates } from '../lib/fs_walk.js';
import type { LanguageAdapter, TaskSurfaceResult } from './types.js';

export const PATTERNS = [ 'build.gradle', 'build.gradle.kts' ];

const GROOVY_TASK = /(?:^|\n)\s*task\s+([A-Za-z_][A-Za-z0-9_]*)\s*(?:\([^)]*\))?\s*[{(<]/gu;
const KOTLIN_REGISTER = /tasks\.register(?:<[^>]+>)?\s*\(\s*["']([^"']+)["']/gu;
const KOTLIN_CREATE = /tasks\.create(?:<[^>]+>)?\s*\(\s*["']([^"']+)["']/gu;
const KOTLIN_REGISTERING = /val\s+([A-Za-z_][A-Za-z0-9_]*)\s+by\s+tasks\.(?:registering|creating)/gu;

export function parseGradleTasks(text: string): Set<string> {
   const names = new Set<string>();

   for (const regex of [ GROOVY_TASK, KOTLIN_REGISTER, KOTLIN_CREATE, KOTLIN_REGISTERING ]) {
      regex.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = regex.exec(text)) !== null) {
         names.add(match[1]);
      }
   }

   return names;
}

export const gradleAdapter: LanguageAdapter = {
   id: 'gradle',
   displayName: 'Gradle',
   patterns: PATTERNS,

   detect(files) {
      return files.some((f) => {
         const base = f.split('/').pop()?.toLowerCase();
         return base === 'build.gradle' || base === 'build.gradle.kts';
      });
   },

   async collectTaskSurface(root, files): Promise<TaskSurfaceResult> {
      const candidates = await readCandidates(files, root, PATTERNS);
      const names = new Set<string>();
      const sourceFiles = new Set<string>();

      for (const [ relpath, text ] of Object.entries(candidates)) {
         const parsed = parseGradleTasks(text);
         for (const n of parsed) names.add(n);
         if (parsed.size > 0) sourceFiles.add(relpath);
      }

      return { names, sourceFiles };
   },
};
