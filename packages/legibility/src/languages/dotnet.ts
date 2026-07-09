import { readCandidates } from '../lib/fs_walk.js';
import type { LanguageAdapter, TaskSurfaceResult } from './types.js';

export const PATTERNS = [ '*.csproj', '*.fsproj', '*.vbproj' ];

const TARGET = /<Target\s+[^>]*\bName\s*=\s*"([^"]+)"/gu;

export function parseMsbuildTargets(text: string): Set<string> {
   const names = new Set<string>();
   TARGET.lastIndex = 0;
   let match: RegExpExecArray | null;
   while ((match = TARGET.exec(text)) !== null) {
      names.add(match[1]);
   }
   return names;
}

function isProjectFile(path: string): boolean {
   const base = path.split('/').pop()?.toLowerCase() ?? '';
   return base.endsWith('.csproj') || base.endsWith('.fsproj') || base.endsWith('.vbproj');
}

export const dotnetAdapter: LanguageAdapter = {
   id: 'dotnet',
   displayName: '.NET / MSBuild',
   patterns: PATTERNS,

   detect(files) {
      return files.some(isProjectFile);
   },

   async collectTaskSurface(root, files): Promise<TaskSurfaceResult> {
      const candidates = await readCandidates(files, root, PATTERNS);
      const names = new Set<string>();
      const sourceFiles = new Set<string>();

      for (const [ relpath, text ] of Object.entries(candidates)) {
         const parsed = parseMsbuildTargets(text);
         for (const n of parsed) names.add(n);
         if (parsed.size > 0) sourceFiles.add(relpath);
      }

      return { names, sourceFiles };
   },
};
