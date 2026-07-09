import { readCandidates } from '../lib/fs_walk.js';
import type { LanguageAdapter, TaskSurfaceResult } from './types.js';

export const PATTERNS = [
   '**/xcshareddata/xcschemes/*.xcscheme',
   'Fastfile',
   'fastlane/Fastfile',
];

const LANE = /^\s*lane\s+:([A-Za-z_][A-Za-z0-9_]*)\s+do\b/u;

export function parseFastfileLanes(text: string): Set<string> {
   const names = new Set<string>();
   for (const raw of text.split(/\r?\n/u)) {
      const line = raw.replace(/#.*$/u, '');
      const match = line.match(LANE);
      if (match) names.add(match[1]);
   }
   return names;
}

export function parseXcodeSchemeFilenames(files: string[]): Set<string> {
   const names = new Set<string>();
   for (const f of files) {
      if (!f.includes('/xcshareddata/xcschemes/')) continue;
      const base = f.split('/').pop() ?? '';
      if (!base.toLowerCase().endsWith('.xcscheme')) continue;
      const stem = base.slice(0, -'.xcscheme'.length);
      if (stem) names.add(stem);
   }
   return names;
}

function isFastfile(relpath: string): boolean {
   const base = relpath.split('/').pop()?.toLowerCase() ?? '';
   return base === 'fastfile';
}

function isScheme(relpath: string): boolean {
   return relpath.includes('/xcshareddata/xcschemes/')
      && relpath.toLowerCase().endsWith('.xcscheme');
}

export const xcodeAdapter: LanguageAdapter = {
   id: 'xcode',
   displayName: 'Xcode',
   patterns: PATTERNS,

   detect(files) {
      return files.some((f) => isFastfile(f) || isScheme(f) || f.includes('.xcodeproj/'));
   },

   async collectTaskSurface(root, files): Promise<TaskSurfaceResult> {
      const names = new Set<string>();
      const sourceFiles = new Set<string>();

      for (const scheme of parseXcodeSchemeFilenames(files)) {
         names.add(scheme);
      }
      for (const f of files) {
         if (isScheme(f)) sourceFiles.add(f);
      }

      const fastfiles = files.filter(isFastfile);
      const candidates = await readCandidates(fastfiles, root, fastfiles);
      for (const [ relpath, text ] of Object.entries(candidates)) {
         const parsed = parseFastfileLanes(text);
         for (const n of parsed) names.add(n);
         if (parsed.size > 0) sourceFiles.add(relpath);
      }

      return { names, sourceFiles };
   },
};
