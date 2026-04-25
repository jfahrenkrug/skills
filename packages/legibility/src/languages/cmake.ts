import { readCandidates } from '../lib/fs_walk.js';
import type { LanguageAdapter, TaskSurfaceResult } from './types.js';

export const PATTERNS = [ 'CMakeLists.txt' ];

const CUSTOM_TARGET = /\badd_custom_target\s*\(\s*([A-Za-z_][A-Za-z0-9_.-]*)/gu;
const EXECUTABLE = /\badd_executable\s*\(\s*([A-Za-z_][A-Za-z0-9_.-]*)/gu;
const LIBRARY = /\badd_library\s*\(\s*([A-Za-z_][A-Za-z0-9_.-]*)/gu;

export function parseCmakeTargets(text: string): Set<string> {
   const names = new Set<string>();
   for (const regex of [ CUSTOM_TARGET, EXECUTABLE, LIBRARY ]) {
      regex.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = regex.exec(text)) !== null) {
         names.add(match[1]);
      }
   }
   return names;
}

export const cmakeAdapter: LanguageAdapter = {
   id: 'cmake',
   displayName: 'CMake',
   patterns: PATTERNS,

   detect(files) {
      return files.some((f) => f.split('/').pop()?.toLowerCase() === 'cmakelists.txt');
   },

   async collectTaskSurface(root, files): Promise<TaskSurfaceResult> {
      const candidates = await readCandidates(files, root, PATTERNS);
      const names = new Set<string>();
      const sourceFiles = new Set<string>();

      for (const [ relpath, text ] of Object.entries(candidates)) {
         const parsed = parseCmakeTargets(text);
         for (const n of parsed) names.add(n);
         if (parsed.size > 0) sourceFiles.add(relpath);
      }

      return { names, sourceFiles };
   },
};
