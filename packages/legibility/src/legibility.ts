import path from 'node:path';
import { runCli as runScoreCli } from './score_repo.js';
import { runCli as runAuditCli } from './audit_repo.js';
import { runInitCli } from './init/index.js';

const USAGE = [
   'Usage: legibility <subcommand> [options]',
   '',
   'Subcommands:',
   '  score <path>             Produce the seven-dimension legibility report.',
   '  list-scopes <path>       List detected scopes in the repo.',
   '  list-metrics             List the available scoring metrics.',
   '  audit [flags] <path>     Run mechanical audit checks.',
   '  init [--force] <path>    Scaffold AGENTS.md, CLAUDE.md, .agents/, docs/.',
   '',
   'Audit flags:',
   '  --check-artifacts            Verify required legibility artifacts exist.',
   '  --check-links                Find broken Markdown links, anchors, and orphan docs.',
   '  --check-commands             Flag doc references to tasks not in the task surface.',
   '  --check-execplans            Check ExecPlan sections, progress, and staleness.',
   '  --check-agents-md            Validate paths and commands in root agent docs.',
   '  --check-cross-tool-aliases   Detect drift between AGENTS.md and tool-specific aliases.',
   '  --check-context-budget       Warn when an agent doc exceeds the context budget.',
   '  --check-readme-drift         Compare commands between README.md and AGENTS.md.',
   '  --check-nesting              In monorepos, look for per-package AGENTS.md.',
   '  --check-repo-map             Require a one-screen architecture index.',
   '  --check-adrs                 Validate ADR sections, index, and supersession links.',
   '  --check-all                  Run every audit check and emit an aggregate report.',
   '',
   'Shared flags:',
   '  --format json|markdown   Output format (default: json).',
   '',
   'Examples:',
   '  legibility score .',
   '  legibility audit --check-all --format markdown .',
].join('\n');

export async function runDispatcher(argv: string[] = process.argv.slice(2)): Promise<void> {
   if (argv.length === 0 || argv[0] === 'help' || argv[0] === '--help' || argv[0] === '-h') {
      process.stdout.write(`${USAGE}\n`);
      return;
   }

   const subcommand = argv[0];
   const rest = argv.slice(1);

   switch (subcommand) {
      case 'score':
         return await runScoreCli(rest);
      case 'list-scopes':
         return await runScoreCli([ ...rest, '--list-scopes' ]);
      case 'list-metrics':
         return await runScoreCli([ ...rest, '--list-metrics' ]);
      case 'audit':
         return await runAuditCli(rest);
      case 'init':
      case 'generate-templates':
         return await runInitCli(rest);
      default:
         throw new Error(`Unknown subcommand: ${subcommand}. Valid: score, list-scopes, list-metrics, audit, init.`);
   }
}

const invokedAsMain = (() => {
   const entry = process.argv[1];
   if (!entry) return false;
   try {
      const entryUrl = new URL(`file://${path.resolve(entry)}`).href;
      return import.meta.url === entryUrl;
   } catch (_error) {
      return false;
   }
})();

if (invokedAsMain) {
   try {
      await runDispatcher();
   } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      process.stderr.write(`${message}\n`);
      process.exitCode = 2;
   }
}
