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
//   --check-links       Markdown link integrity + orphan-doc detection.
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
import { isDirectory, readText, walkRepo } from './lib/fs_walk.js';
import {
   extractTaskReferences,
   isExternalHref,
   parseMarkdown,
   resolveReference,
   splitHref,
} from './lib/markdown.js';
import { collectTaskSurfaceByRunner } from './lib/task_surface.js';

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

const MARKDOWN_EXTENSIONS = new Set([ '.md', '.mdx' ]);
const LINK_ENTRY_FILES = [ 'README.md', 'AGENTS.md', 'CLAUDE.md' ];

function isMarkdownFile(relpath) {
   const lower = relpath.toLowerCase();
   for (const ext of MARKDOWN_EXTENSIONS) {
      if (lower.endsWith(ext)) return true;
   }
   return false;
}

function normalizeRelativeHref(href) {
   if (href.startsWith('./')) return href.slice(2);
   return href;
}

function resolveLinkTarget(fromRelpath, href) {
   const { target, anchor } = splitHref(href);
   if (target === null) {
      return { target: fromRelpath, anchor, originalHref: href };
   }
   const normalized = normalizeRelativeHref(target);
   const fromDir = fromRelpath.includes('/') ? fromRelpath.slice(0, fromRelpath.lastIndexOf('/')) : '';
   const joined = fromDir ? path.posix.join(fromDir, normalized) : normalized;
   const resolved = path.posix.normalize(joined);
   return { target: resolved, anchor, originalHref: href };
}

async function fileExistsInRepo(root, relpath) {
   try {
      const stat = await fs.stat(path.join(root, relpath));
      return stat.isFile();
   } catch (_error) {
      return false;
   }
}

function buildEntrySet(markdownPaths) {
   const entrySet = new Set();
   for (const relpath of markdownPaths) {
      if (LINK_ENTRY_FILES.includes(relpath)) {
         entrySet.add(relpath);
         continue;
      }
      if (relpath === 'docs/README.md' || relpath === 'docs/index.md') {
         entrySet.add(relpath);
         continue;
      }
      const parts = relpath.split('/');
      if (parts.length === 3 && parts[0] === 'docs' && (parts[2] === 'README.md' || parts[2] === 'index.md')) {
         entrySet.add(relpath);
      }
   }
   return entrySet;
}

export async function checkLinks(root, options = {}) {
   const excludes = options.excludes || [];
   const files = await walkRepo(root, excludes);
   const markdownPaths = files.filter(isMarkdownFile).sort();
   const findings = [];
   const adjacency = new Map();

   const parsedByFile = new Map();
   for (const relpath of markdownPaths) {
      const text = await readText(path.join(root, relpath));
      parsedByFile.set(relpath, parseMarkdown(text));
      adjacency.set(relpath, new Set());
   }

   for (const relpath of markdownPaths) {
      const parsed = parsedByFile.get(relpath);
      for (const link of parsed.links) {
         const resolvedHref = resolveReference(link, parsed.referenceDefinitions);
         if (resolvedHref === null) {
            findings.push(finding(
               SEVERITY_WARNING,
               relpath,
               `Unresolved reference link \`${link.text}\` (no definition in file).`,
               'Add a matching `[label]: url` definition or change the link.',
               link.line
            ));
            continue;
         }
         if (!resolvedHref || isExternalHref(resolvedHref)) {
            continue;
         }
         const resolved = resolveLinkTarget(relpath, resolvedHref);
         if (!resolved.target) continue;
         if (resolved.target.startsWith('..')) {
            continue;
         }

         const targetExists = await fileExistsInRepo(root, resolved.target);
         if (!targetExists) {
            findings.push(finding(
               SEVERITY_ERROR,
               relpath,
               `Broken link to \`${resolvedHref}\` (target not found).`,
               `Update the link or create the target file \`${resolved.target}\`.`,
               link.line
            ));
            continue;
         }

         if (resolved.anchor && isMarkdownFile(resolved.target)) {
            const targetParsed = parsedByFile.get(resolved.target) || parseMarkdown(await readText(path.join(root, resolved.target)));
            const anchors = new Set(targetParsed.headings.map((h) => h.anchor).filter(Boolean));
            if (!anchors.has(resolved.anchor)) {
               findings.push(finding(
                  SEVERITY_WARNING,
                  relpath,
                  `Broken anchor \`#${resolved.anchor}\` in \`${resolved.target}\` (no matching heading).`,
                  `Update the anchor to match a heading in \`${resolved.target}\` or add the heading.`,
                  link.line
               ));
            }
         }

         if (isMarkdownFile(resolved.target) && adjacency.has(resolved.target)) {
            adjacency.get(relpath).add(resolved.target);
         }
      }
   }

   const entrySet = buildEntrySet(markdownPaths);
   const reachable = new Set(entrySet);
   const queue = Array.from(entrySet);
   while (queue.length > 0) {
      const current = queue.shift();
      const neighbors = adjacency.get(current);
      if (!neighbors) continue;
      for (const neighbor of neighbors) {
         if (!reachable.has(neighbor)) {
            reachable.add(neighbor);
            queue.push(neighbor);
         }
      }
   }

   for (const relpath of markdownPaths) {
      if (!relpath.startsWith('docs/')) continue;
      if (reachable.has(relpath)) continue;
      findings.push(finding(
         SEVERITY_WARNING,
         relpath,
         'Orphaned documentation file (not reachable from any index).',
         'Link this file from docs/README.md or a parent-directory README, or delete it.'
      ));
   }

   const brokenLinkCount = findings.filter((f) => f.message.startsWith('Broken link')).length;
   const brokenAnchorCount = findings.filter((f) => f.message.startsWith('Broken anchor')).length;
   const orphanCount = findings.filter((f) => f.message.startsWith('Orphaned')).length;
   const unresolvedRefCount = findings.filter((f) => f.message.startsWith('Unresolved reference')).length;
   const summary = findings.length === 0
      ? 'No broken links, anchors, or orphaned docs.'
      : `${brokenLinkCount} broken link${brokenLinkCount === 1 ? '' : 's'}, ${brokenAnchorCount} broken anchor${brokenAnchorCount === 1 ? '' : 's'}, ${orphanCount} orphan doc${orphanCount === 1 ? '' : 's'}${unresolvedRefCount > 0 ? `, ${unresolvedRefCount} unresolved reference${unresolvedRefCount === 1 ? '' : 's'}` : ''}.`;

   return checkResult('links', findings, summary);
}

const RUNNER_LABEL = {
   npm: 'npm/pnpm/yarn/bun',
   make: 'make',
   just: 'just',
   task: 'task',
   cargo: 'cargo',
};

export async function checkCommands(root, options = {}) {
   const excludes = options.excludes || [];
   const files = await walkRepo(root, excludes);
   const surfaceByRunner = await collectTaskSurfaceByRunner(root, files);
   const findings = [];
   const markdownPaths = files.filter(isMarkdownFile).sort();

   for (const relpath of markdownPaths) {
      const text = await readText(path.join(root, relpath));
      const references = extractTaskReferences(text);

      for (const ref of references) {
         const knownNames = surfaceByRunner[ref.runner];
         if (!knownNames) continue;
         if (knownNames.has(ref.token)) continue;

         findings.push(finding(
            SEVERITY_WARNING,
            relpath,
            `Doc references ${RUNNER_LABEL[ref.runner]} task \`${ref.token}\` but it is not defined in the task surface.`,
            `Define \`${ref.token}\` in the ${RUNNER_LABEL[ref.runner]} task file, or update the doc to name an existing task.`,
            ref.line
         ));
      }
   }

   const summary = findings.length === 0
      ? 'All documented task references resolve to the task surface.'
      : `${findings.length} unresolved task reference${findings.length === 1 ? '' : 's'} in Markdown.`;

   return checkResult('commands', findings, summary);
}

export const AVAILABLE_CHECKS = {
   artifacts: checkArtifacts,
   links: checkLinks,
   commands: checkCommands,
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
