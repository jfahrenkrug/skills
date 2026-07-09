import path from 'node:path';
import { promises as fs } from 'node:fs';
import { getTemplates, type TemplateFile } from './templates.js';

export interface InitResult {
   root: string;
   created: string[];
   skipped: string[];
}

export interface InitOptions {
   force?: boolean;
}

async function pathExists(absPath: string): Promise<boolean> {
   try {
      await fs.access(absPath);
      return true;
   } catch (_error) {
      return false;
   }
}

async function writeTemplate(root: string, template: TemplateFile, force: boolean): Promise<'created' | 'skipped'> {
   const absPath = path.join(root, template.path);
   if (!force && await pathExists(absPath)) {
      return 'skipped';
   }
   await fs.mkdir(path.dirname(absPath), { recursive: true });
   await fs.writeFile(absPath, template.contents, 'utf8');
   return 'created';
}

export async function runInit(root: string, options: InitOptions = {}): Promise<InitResult> {
   const force = options.force === true;
   const absRoot = path.resolve(root);
   await fs.mkdir(absRoot, { recursive: true });

   const created: string[] = [];
   const skipped: string[] = [];
   for (const template of getTemplates()) {
      const outcome = await writeTemplate(absRoot, template, force);
      if (outcome === 'created') created.push(template.path);
      else skipped.push(template.path);
   }
   return { root: absRoot, created, skipped };
}

export async function runInitCli(argv: string[]): Promise<void> {
   let force = false;
   const positional: string[] = [];
   for (const arg of argv) {
      if (arg === '--force' || arg === '-f') {
         force = true;
      } else if (arg === '--help' || arg === '-h') {
         process.stdout.write([
            'Usage: legibility init [--force] [path]',
            '',
            'Scaffolds the required-artifact tree from templates: AGENTS.md,',
            'CLAUDE.md, .agents/PLANS.md, docs/README.md, and the exec-plans',
            'directories. Existing files are skipped unless --force is set.',
            '',
         ].join('\n'));
         return;
      } else if (arg.startsWith('--')) {
         throw new Error(`Unknown flag for init: ${arg}`);
      } else {
         positional.push(arg);
      }
   }
   if (positional.length > 1) {
      throw new Error(`init takes at most one path argument, got ${positional.length}`);
   }
   const target = positional[0] ?? '.';
   const result = await runInit(target, { force });
   process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}
