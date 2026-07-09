import { readCandidates } from '../lib/fs_walk.js';
import type { LanguageAdapter, TaskSurfaceResult } from './types.js';

export const PATTERNS = [ 'Rakefile', 'rakefile', 'Rakefile.rb', '**/*.rake' ];

const NAMESPACE_OPEN = /^\s*namespace\s+:([A-Za-z_][A-Za-z0-9_]*)\s+do\b/u;
const NAMESPACE_OPEN_STR = /^\s*namespace\s+["']([A-Za-z_][A-Za-z0-9_]*)["']\s+do\b/u;
const TASK_SYM = /^\s*task\s+:([A-Za-z_][A-Za-z0-9_]*)\b/u;
const TASK_STR = /^\s*task\s+["']([A-Za-z_][A-Za-z0-9_]*)["']/u;
const BLOCK_END = /^\s*end\b/u;
const BLOCK_OPEN = /\bdo\b(\s*\|[^|]*\|)?\s*$|\{\s*(?:\|[^|]*\|)?\s*$/u;
// Ruby constructs that open a block without `do` (each closed by `end`).
// Modifier forms (`x if y`) don't match because the keyword must lead the line.
const KEYWORD_BLOCK_OPEN = /^\s*(?:def|class|module|if|unless|case|while|until|for|begin)\b/u;
// Endless method definitions (`def foo = bar`) have no matching `end`.
const ENDLESS_DEF = /^\s*def\s+(?:self\.)?[a-z_][A-Za-z0-9_]*[?!]?\s*(?:\([^)]*\))?\s*=(?!=)/u;

export function parseRakefile(text: string): Set<string> {
   const names = new Set<string>();
   const stack: Array<{ kind: 'ns' | 'other'; name?: string }> = [];

   function currentPrefix(): string {
      const parts = stack.filter((f) => f.kind === 'ns').map((f) => f.name!);
      return parts.length > 0 ? parts.join(':') + ':' : '';
   }

   const lines = text.split(/\r?\n/u);
   for (const raw of lines) {
      const line = raw.replace(/#.*$/u, '');
      const trimmed = line.trim();
      if (!trimmed) continue;

      const nsMatch = line.match(NAMESPACE_OPEN) ?? line.match(NAMESPACE_OPEN_STR);
      if (nsMatch) {
         stack.push({ kind: 'ns', name: nsMatch[1] });
         continue;
      }

      const taskMatch = line.match(TASK_SYM) ?? line.match(TASK_STR);
      if (taskMatch) {
         names.add(currentPrefix() + taskMatch[1]);
         if (BLOCK_OPEN.test(line)) {
            stack.push({ kind: 'other' });
         }
         continue;
      }

      if (BLOCK_END.test(line)) {
         if (stack.length > 0) stack.pop();
         continue;
      }

      if (KEYWORD_BLOCK_OPEN.test(line)
         && !ENDLESS_DEF.test(line)
         && !/\bend\s*$/u.test(trimmed)) {
         stack.push({ kind: 'other' });
         continue;
      }

      if (BLOCK_OPEN.test(line)) {
         stack.push({ kind: 'other' });
         continue;
      }
   }

   return names;
}

function isRakeFile(relpath: string): boolean {
   const base = relpath.split('/').pop() ?? '';
   const lower = base.toLowerCase();
   if (lower === 'rakefile' || lower === 'rakefile.rb') return true;
   return lower.endsWith('.rake');
}

export const rakeAdapter: LanguageAdapter = {
   id: 'rake',
   displayName: 'rake',
   patterns: PATTERNS,

   detect(files) {
      return files.some(isRakeFile);
   },

   async collectTaskSurface(root, files): Promise<TaskSurfaceResult> {
      const rakeFiles = files.filter(isRakeFile);
      const candidates = await readCandidates(rakeFiles, root, rakeFiles);
      const names = new Set<string>();
      const sourceFiles = new Set<string>();

      for (const [ relpath, text ] of Object.entries(candidates)) {
         const parsed = parseRakefile(text);
         for (const n of parsed) names.add(n);
         if (parsed.size > 0) sourceFiles.add(relpath);
      }

      return { names, sourceFiles };
   },
};
