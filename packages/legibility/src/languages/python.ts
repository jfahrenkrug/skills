import { readCandidates } from '../lib/fs_walk.js';
import type { LanguageAdapter, TaskSurfaceResult } from './types.js';

export const PATTERNS = [ 'pyproject.toml', 'setup.py', 'tox.ini' ];

const SCRIPT_TABLE_PATTERNS = [
   /^\[project\.scripts\]\s*$/u,
   /^\[tool\.poetry\.scripts\]\s*$/u,
   /^\[tool\.pdm\.scripts\]\s*$/u,
   /^\[tool\.hatch\.envs\.[^\]]+\.scripts\]\s*$/u,
];

function isTableHeader(line: string): boolean {
   return /^\[[^\]]+\]\s*$/u.test(line);
}

function matchesScriptTable(line: string): boolean {
   return SCRIPT_TABLE_PATTERNS.some((rx) => rx.test(line));
}

export function parsePythonScripts(text: string): Set<string> {
   const names = new Set<string>();
   let inScriptTable = false;

   for (const raw of text.split(/\r?\n/u)) {
      const stripped = raw.trim();
      if (!stripped || stripped.startsWith('#')) continue;

      if (isTableHeader(stripped)) {
         inScriptTable = matchesScriptTable(stripped);
         continue;
      }

      if (!inScriptTable) continue;

      const match = stripped.match(/^([A-Za-z0-9_.:-]+)\s*=/u);
      if (match) names.add(match[1]);
   }

   return names;
}

export function parseToxEnvlist(text: string): Set<string> {
   const envs = new Set<string>();
   const lines = text.split(/\r?\n/u);
   let inTox = false;
   let collecting = false;
   let buffer = '';

   function flush(): void {
      if (buffer) {
         for (const name of splitEnvlist(buffer)) envs.add(name);
         buffer = '';
      }
      collecting = false;
   }

   for (const raw of lines) {
      const stripped = raw.trim();

      if (/^\[[^\]]+\]\s*$/u.test(stripped)) {
         flush();
         inTox = stripped === '[tox]';
         continue;
      }

      if (!inTox) continue;

      if (!collecting) {
         const match = raw.match(/^\s*envlist\s*=\s*(.*)$/u);
         if (match) {
            buffer = match[1].trim();
            collecting = true;
         }
         continue;
      }

      if (stripped === '') continue;

      if (raw[0] === ' ' || raw[0] === '\t') {
         buffer += ' ' + stripped;
         continue;
      }

      flush();
      if (/^\s*[A-Za-z_][A-Za-z0-9_]*\s*=/u.test(raw)) continue;
   }

   flush();

   return envs;
}

function splitEnvlist(raw: string): string[] {
   return raw
      .split(/[\s,]+/u)
      .map((s) => s.trim())
      .filter((s) => s.length > 0 && !s.startsWith('#'));
}

export const pythonAdapter: LanguageAdapter = {
   id: 'python',
   displayName: 'Python',
   patterns: PATTERNS,

   detect(files) {
      return files.some((f) => {
         const base = f.split('/').pop()?.toLowerCase();
         return base === 'pyproject.toml' || base === 'setup.py' || base === 'tox.ini';
      });
   },

   async collectTaskSurface(root, files): Promise<TaskSurfaceResult> {
      const candidates = await readCandidates(files, root, PATTERNS);
      const names = new Set<string>();
      const sourceFiles = new Set<string>();

      for (const [ relpath, text ] of Object.entries(candidates)) {
         const base = relpath.split('/').pop()?.toLowerCase();
         let parsed: Set<string> = new Set();

         if (base === 'pyproject.toml') {
            parsed = parsePythonScripts(text);
         } else if (base === 'tox.ini') {
            const envs = parseToxEnvlist(text);
            for (const env of envs) parsed.add(`tox:${env}`);
         }

         for (const n of parsed) names.add(n);
         if (parsed.size > 0) sourceFiles.add(relpath);
      }

      return { names, sourceFiles };
   },
};
