#!/usr/bin/env node

// audit_repo.js -- mechanical drift and integrity checks for agentic legibility.
//
// Unlike score_repo.js, which produces a seven-dimension quality score, this
// script's job is to report concrete defects in a repository's legibility
// infrastructure -- missing required artifacts, broken Markdown links,
// references to commands that no longer exist, and so on.  Each check returns
// a CheckResult (see lib/output.js) with a list of Finding objects that name
// the problem and the fix.
//
// Subcommands (passed as --check-* flags):
//   --check-artifacts   Verify required legibility paths exist.
//   --check-all         Run every available check and aggregate the results.
//
// Additional checks are added incrementally by later milestones of the
// mechanical-audit-checks ExecPlan.
//
// Output schemas:
//   - single-check: { check, status, findings, summary }
//   - aggregate:    { repo, status, checks: { [name]: CheckResult } }
//
// Exit codes:
//   0  all checks passed ("ok")
//   1  one or more checks reported "drift"
//   2  invalid CLI usage

import path from 'node:path';
import { promises as fs } from 'node:fs';
import {
   SEVERITY_ERROR,
   SEVERITY_WARNING,
   auditReport,
   checkResult,
   finding,
   formatAuditMarkdown,
   formatJson,
   formatSingleCheckJson,
   formatSingleCheckMarkdown,
} from './lib/output.js';
import { isDirectory } from './lib/fs_walk.js';

export const REQUIRED_ARTIFACTS = [
   { path: 'AGENTS.md', kind: 'file', severity: SEVERITY_ERROR, remediation: 'Create AGENTS.md at the repository root with a concise agent map.' },
   { path: '.agents', kind: 'dir', severity: SEVERITY_ERROR, remediation: 'Create the `.agents/` directory for agent-facing infrastructure.' },
   { path: '.agents/PLANS.md', kind: 'file', severity: SEVERITY_ERROR, remediation: 'Copy PLANS.md from the agentic-legibility skill to .agents/PLANS.md verbatim.' },
   { path: 'docs', kind: 'dir', severity: SEVERITY_ERROR, remediation: 'Create the `docs/` directory to hold progressive-disclosure documentation.' },
   { path: 'docs/exec-plans', kind: 'dir', severity: SEVERITY_ERROR, remediation: 'Create `docs/exec-plans/` to host active and completed ExecPlans.' },
   { path: 'docs/exec-plans/active', kind: 'dir', severity: SEVERITY_WARNING, remediation: 'Create `docs/exec-plans/active/` to hold in-progress plans.' },
   { path: 'docs/exec-plans/completed', kind: 'dir', severity: SEVERITY_WARNING, remediation: 'Create `docs/exec-plans/completed/` to hold finished plans.' },
   { path: 'CLAUDE.md', kind: 'file', severity: SEVERITY_WARNING, remediation: 'Create CLAUDE.md containing `@AGENTS.md` to route Claude Code to the agent map.' },
];

async function pathExists(absolutePath, kind) {
   try {
      const stat = await fs.stat(absolutePath);
      return kind === 'dir' ? stat.isDirectory() : stat.isFile();
   } catch (_error) {
      return false;
   }
}

export async function checkArtifacts(root) {
   const findings = [];

   for (const artifact of REQUIRED_ARTIFACTS) {
      const absolutePath = path.join(root, artifact.path);
      const exists = await pathExists(absolutePath, artifact.kind);

      if (!exists) {
         findings.push(finding(
            artifact.severity,
            artifact.path,
            `Required legibility artifact missing (${artifact.kind}).`,
            artifact.remediation
         ));
      }
   }

   const errorCount = findings.filter((f) => f.severity === SEVERITY_ERROR).length;
   const warningCount = findings.filter((f) => f.severity === SEVERITY_WARNING).length;
   const summary = findings.length === 0
      ? 'All required legibility artifacts are present.'
      : `${errorCount} missing required artifact${errorCount === 1 ? '' : 's'}${warningCount > 0 ? `, ${warningCount} recommended artifact${warningCount === 1 ? '' : 's'} missing` : ''}.`;

   return checkResult('artifacts', findings, summary);
}

export const AVAILABLE_CHECKS = {
   artifacts: checkArtifacts,
};

export async function runAudit(root, selectedChecks) {
   const results = {};
   const names = selectedChecks.length > 0 ? selectedChecks : Object.keys(AVAILABLE_CHECKS);

   for (const name of names) {
      const runner = AVAILABLE_CHECKS[name];
      if (!runner) {
         throw new Error(`Unknown check: ${name}. Valid checks: ${Object.keys(AVAILABLE_CHECKS).join(', ')}`);
      }
      results[name] = await runner(root);
   }

   return auditReport(root, results);
}

export function parseCliArgs(argv) {
   const args = {
      repo: '.',
      format: 'json',
      checks: [],
      runAll: false,
   };
   const positionals = [];
   const checkFlags = new Set(Object.keys(AVAILABLE_CHECKS).map((name) => `--check-${name.replaceAll('_', '-')}`));

   for (let index = 0; index < argv.length; index += 1) {
      const arg = argv[index];

      if (arg === '--format') {
         const value = argv[index + 1];
         if (value !== 'json' && value !== 'markdown') {
            throw new Error('--format requires either json or markdown');
         }
         args.format = value;
         index += 1;
      } else if (arg === '--check-all') {
         args.runAll = true;
      } else if (checkFlags.has(arg)) {
         const name = arg.replace(/^--check-/u, '').replaceAll('-', '_');
         args.checks.push(name);
      } else if (arg.startsWith('--')) {
         throw new Error(`Unknown option: ${arg}`);
      } else {
         positionals.push(arg);
      }
   }

   if (positionals.length > 1) {
      throw new Error('Only one repository path may be provided.');
   }

   if (positionals.length === 1) {
      args.repo = positionals[0];
   }

   if (!args.runAll && args.checks.length === 0) {
      throw new Error(`Specify at least one check flag, or use --check-all. Valid: ${Array.from(checkFlags).sort().join(', ')}, --check-all.`);
   }

   return args;
}

async function main() {
   const args = parseCliArgs(process.argv.slice(2));
   const root = path.resolve(args.repo);

   if (!(await isDirectory(root))) {
      throw new Error(`Repository path does not exist or is not a directory: ${root}`);
   }

   const checks = args.runAll ? Object.keys(AVAILABLE_CHECKS) : args.checks;
   const singleCheck = checks.length === 1 && !args.runAll;

   if (singleCheck) {
      const name = checks[0];
      const runner = AVAILABLE_CHECKS[name];
      const result = await runner(root);
      const output = args.format === 'markdown'
         ? formatSingleCheckMarkdown(result)
         : formatSingleCheckJson(result);
      process.stdout.write(`${output}\n`);
      if (result.status === 'drift') {
         process.exitCode = 1;
      }
      return;
   }

   const report = await runAudit(root, checks);
   const output = args.format === 'markdown'
      ? formatAuditMarkdown(report)
      : formatJson(report);
   process.stdout.write(`${output}\n`);

   if (report.status === 'drift') {
      process.exitCode = 1;
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
      await main();
   } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      process.stderr.write(`${message}\n`);
      process.exitCode = 2;
   }
}
