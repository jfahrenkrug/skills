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
import type { CheckResult, AuditReport, Severity } from './lib/output.js';
import { isDirectory, readText, walkRepo } from './lib/fs_walk.js';
import {
   extractInlineCodeSpans,
   extractTaskReferences,
   isExternalHref,
   parseMarkdown,
   resolveReference,
   splitHref,
} from './lib/markdown.js';
import { collectTaskSurfaceByRunner } from './languages/index.js';
import { REQUIRED_SECTIONS, parseExecPlan } from './lib/execplans.js';
import { lastActivityTimestamp } from './lib/git.js';

export interface RequiredArtifact {
   path: string;
   kind: 'file' | 'dir';
   severity: Severity;
   remediation: string;
}

export const REQUIRED_ARTIFACTS: RequiredArtifact[] = [
   { path: 'AGENTS.md', kind: 'file', severity: SEVERITY_ERROR, remediation: 'Create AGENTS.md at the repository root with a concise agent map.' },
   { path: '.agents', kind: 'dir', severity: SEVERITY_ERROR, remediation: 'Create the `.agents/` directory for agent-facing infrastructure.' },
   { path: '.agents/PLANS.md', kind: 'file', severity: SEVERITY_ERROR, remediation: 'Copy PLANS.md from the agentic-legibility skill to .agents/PLANS.md verbatim.' },
   { path: 'docs', kind: 'dir', severity: SEVERITY_ERROR, remediation: 'Create the `docs/` directory to hold progressive-disclosure documentation.' },
   { path: 'docs/exec-plans', kind: 'dir', severity: SEVERITY_ERROR, remediation: 'Create `docs/exec-plans/` to host active and completed ExecPlans.' },
   { path: 'docs/exec-plans/active', kind: 'dir', severity: SEVERITY_WARNING, remediation: 'Create `docs/exec-plans/active/` to hold in-progress plans.' },
   { path: 'docs/exec-plans/completed', kind: 'dir', severity: SEVERITY_WARNING, remediation: 'Create `docs/exec-plans/completed/` to hold finished plans.' },
   { path: 'CLAUDE.md', kind: 'file', severity: SEVERITY_WARNING, remediation: 'Create CLAUDE.md containing `@AGENTS.md` to route Claude Code to the agent map.' },
];

async function pathExists(absolutePath: string, kind: 'file' | 'dir'): Promise<boolean> {
   try {
      const stat = await fs.stat(absolutePath);
      return kind === 'dir' ? stat.isDirectory() : stat.isFile();
   } catch (_error) {
      return false;
   }
}

export async function checkArtifacts(root: string): Promise<CheckResult> {
   const findings = [];

   for (const artifact of REQUIRED_ARTIFACTS) {
      const absolutePath = path.join(root, artifact.path);
      const exists = await pathExists(absolutePath, artifact.kind);

      if (!exists) {
         findings.push(finding(
            artifact.severity,
            artifact.path,
            `Required legibility artifact missing (${artifact.kind}).`,
            artifact.remediation,
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

function isMarkdownFile(relpath: string): boolean {
   const lower = relpath.toLowerCase();
   for (const ext of MARKDOWN_EXTENSIONS) {
      if (lower.endsWith(ext)) return true;
   }
   return false;
}

function normalizeRelativeHref(href: string): string {
   if (href.startsWith('./')) return href.slice(2);
   return href;
}

function resolveLinkTarget(
   fromRelpath: string,
   href: string,
): { target: string | null; anchor: string | null; originalHref: string } {
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

async function fileExistsInRepo(root: string, relpath: string): Promise<boolean> {
   try {
      const stat = await fs.stat(path.join(root, relpath));
      return stat.isFile();
   } catch (_error) {
      return false;
   }
}

function buildEntrySet(markdownPaths: string[]): Set<string> {
   const entrySet = new Set<string>();
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

export async function checkLinks(
   root: string,
   options: { excludes?: string[] } = {},
): Promise<CheckResult> {
   const excludes = options.excludes || [];
   const files = await walkRepo(root, excludes);
   const markdownPaths = files.filter(isMarkdownFile).sort();
   const findings = [];
   const adjacency = new Map<string, Set<string>>();

   const parsedByFile = new Map<string, ReturnType<typeof parseMarkdown>>();
   for (const relpath of markdownPaths) {
      const text = await readText(path.join(root, relpath));
      parsedByFile.set(relpath, parseMarkdown(text));
      adjacency.set(relpath, new Set());
   }

   for (const relpath of markdownPaths) {
      const parsed = parsedByFile.get(relpath)!;
      for (const link of parsed.links) {
         const resolvedHref = resolveReference(link, parsed.referenceDefinitions);
         if (resolvedHref === null) {
            findings.push(finding(
               SEVERITY_WARNING,
               relpath,
               `Unresolved reference link \`${link.text}\` (no definition in file).`,
               'Add a matching `[label]: url` definition or change the link.',
               link.line,
            ));
            continue;
         }
         if (!resolvedHref || isExternalHref(resolvedHref)) continue;

         const resolved = resolveLinkTarget(relpath, resolvedHref);
         if (!resolved.target) continue;
         if (resolved.target.startsWith('..')) continue;

         const targetExists = await fileExistsInRepo(root, resolved.target);
         if (!targetExists) {
            findings.push(finding(
               SEVERITY_ERROR,
               relpath,
               `Broken link to \`${resolvedHref}\` (target not found).`,
               `Update the link or create the target file \`${resolved.target}\`.`,
               link.line,
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
                  link.line,
               ));
            }
         }

         if (isMarkdownFile(resolved.target) && adjacency.has(resolved.target)) {
            adjacency.get(relpath)!.add(resolved.target);
         }
      }
   }

   const entrySet = buildEntrySet(markdownPaths);
   const reachable = new Set(entrySet);
   const queue = Array.from(entrySet);
   while (queue.length > 0) {
      const current = queue.shift()!;
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
         'Link this file from docs/README.md or a parent-directory README, or delete it.',
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

const RUNNER_LABEL: Record<string, string> = {
   javascript: 'npm/pnpm/yarn/bun',
   make: 'make',
   just: 'just',
   task: 'task',
   cargo: 'cargo',
};

export async function checkCommands(
   root: string,
   options: { excludes?: string[] } = {},
): Promise<CheckResult> {
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
            `Doc references ${RUNNER_LABEL[ref.runner] ?? ref.runner} task \`${ref.token}\` but it is not defined in the task surface.`,
            `Define \`${ref.token}\` in the ${RUNNER_LABEL[ref.runner] ?? ref.runner} task file, or update the doc to name an existing task.`,
            ref.line,
         ));
      }
   }

   const summary = findings.length === 0
      ? 'All documented task references resolve to the task surface.'
      : `${findings.length} unresolved task reference${findings.length === 1 ? '' : 's'} in Markdown.`;

   return checkResult('commands', findings, summary);
}

const DEFAULT_STALE_THRESHOLD_DAYS = 30;

async function listExecPlans(root: string, kind: string): Promise<string[]> {
   const dir = path.join(root, 'docs/exec-plans', kind);
   try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      return entries
         .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.md'))
         .map((entry) => path.posix.join('docs/exec-plans', kind, entry.name))
         .sort();
   } catch (_error) {
      return [];
   }
}

export async function checkExecplans(
   root: string,
   options: { staleThresholdDays?: number } = {},
): Promise<CheckResult> {
   const thresholdDays = options.staleThresholdDays ?? DEFAULT_STALE_THRESHOLD_DAYS;
   const findings = [];
   const now = Math.floor(Date.now() / 1000);
   const thresholdSeconds = thresholdDays * 86400;

   const activePlans = await listExecPlans(root, 'active');
   const completedPlans = await listExecPlans(root, 'completed');

   for (const relpath of [ ...activePlans, ...completedPlans ]) {
      const text = await readText(path.join(root, relpath));
      const parsed = parseExecPlan(text);

      for (const missing of parsed.missingSections) {
         findings.push(finding(
            SEVERITY_WARNING,
            relpath,
            `ExecPlan is missing required section \`${missing}\`.`,
            `Add a \`## ${missing}\` section per skills/agentic-legibility/PLANS.md.`,
         ));
      }
   }

   for (const relpath of activePlans) {
      const text = await readText(path.join(root, relpath));
      const parsed = parseExecPlan(text);
      const timestamp = await lastActivityTimestamp(root, relpath);

      if (timestamp !== null && now - timestamp > thresholdSeconds) {
         const days = Math.floor((now - timestamp) / 86400);
         findings.push(finding(
            SEVERITY_WARNING,
            relpath,
            `Active ExecPlan has had no activity in ${days} days (threshold ${thresholdDays}).`,
            'Update the Progress and Outcomes sections, or move the plan to docs/exec-plans/completed/.',
         ));
      }

      if (parsed.progress.total > 0
         && parsed.progress.remaining === 0
         && parsed.presentSections.has('Outcomes & Retrospective')) {
         const outcomesBodyPresent = text
            .split(/^##\s+Outcomes\s*&\s*Retrospective\s*$/mu)[1]
            ?.replace(/^##\s.*$/msu, '')
            ?.trim();
         if (!outcomesBodyPresent) {
            findings.push(finding(
               SEVERITY_WARNING,
               relpath,
               'Active ExecPlan has every progress checkbox completed but no Outcomes & Retrospective body.',
               'Fill in Outcomes & Retrospective, then move the plan to docs/exec-plans/completed/.',
            ));
         }
      }
   }

   for (const relpath of completedPlans) {
      const text = await readText(path.join(root, relpath));
      const parsed = parseExecPlan(text);
      if (parsed.progress.remaining > 0) {
         findings.push(finding(
            SEVERITY_WARNING,
            relpath,
            `Completed ExecPlan still has ${parsed.progress.remaining} unchecked progress item${parsed.progress.remaining === 1 ? '' : 's'}.`,
            'Either finish the remaining items or move the plan back to docs/exec-plans/active/.',
         ));
      }
   }

   const summary = findings.length === 0
      ? `All ExecPlans healthy (${activePlans.length} active, ${completedPlans.length} completed).`
      : `${findings.length} ExecPlan finding${findings.length === 1 ? '' : 's'} across ${activePlans.length} active and ${completedPlans.length} completed plans.`;

   return checkResult('execplans', findings, summary);
}

const AGENT_DOC_CANDIDATES = [
   'AGENTS.md',
   'CLAUDE.md',
   '.github/copilot-instructions.md',
];

function looksLikePath(content: string): boolean {
   const trimmed = content.trim();
   if (!trimmed || /\s/u.test(trimmed)) return false;
   if (trimmed.startsWith('#')) return false;
   if (/^https?:\/\//iu.test(trimmed)) return false;
   if (/^[a-z][a-z0-9+.-]*:/iu.test(trimmed)) return false;
   if (trimmed.startsWith('/')) return false;
   if (!trimmed.includes('/')) return false;
   return true;
}

async function repoPathExists(root: string, relpath: string): Promise<boolean> {
   try {
      await fs.stat(path.join(root, relpath));
      return true;
   } catch (_error) {
      return false;
   }
}

export async function checkAgentsMd(
   root: string,
   options: { excludes?: string[] } = {},
): Promise<CheckResult> {
   const excludes = options.excludes || [];
   const files = await walkRepo(root, excludes);
   const surfaceByRunner = await collectTaskSurfaceByRunner(root, files);
   const findings = [];
   const checkedDocs: string[] = [];

   for (const relpath of AGENT_DOC_CANDIDATES) {
      if (!(await fileExistsInRepo(root, relpath))) continue;
      const text = await readText(path.join(root, relpath));
      if (!text) continue;
      checkedDocs.push(relpath);

      const parsed = parseMarkdown(text);

      for (const link of parsed.links) {
         const href = resolveReference(link, parsed.referenceDefinitions);
         if (!href || isExternalHref(href)) continue;
         const { target } = splitHref(href);
         if (!target) continue;
         const cleaned = target.startsWith('./') ? target.slice(2) : target;
         if (cleaned.startsWith('..')) continue;
         if (!(await repoPathExists(root, cleaned))) {
            findings.push(finding(
               SEVERITY_ERROR,
               relpath,
               `Agent doc links to \`${href}\` but the target does not exist.`,
               `Update the link or create the target \`${cleaned}\`.`,
               link.line,
            ));
         }
      }

      for (const span of extractInlineCodeSpans(text)) {
         if (!looksLikePath(span.content)) continue;
         const candidate = span.content.trim();
         if (candidate.startsWith('/') || candidate.startsWith('~')) continue;
         const normalized = candidate.startsWith('./') ? candidate.slice(2) : candidate;
         if (normalized.startsWith('..')) continue;
         if (!(await repoPathExists(root, normalized))) {
            findings.push(finding(
               SEVERITY_ERROR,
               relpath,
               `Agent doc mentions \`${candidate}\` but the path does not exist.`,
               `Remove the reference or create \`${normalized}\`.`,
               span.line,
            ));
         }
      }

      for (const ref of extractTaskReferences(text)) {
         const known = surfaceByRunner[ref.runner];
         if (!known) continue;
         if (known.has(ref.token)) continue;
         findings.push(finding(
            SEVERITY_ERROR,
            relpath,
            `Agent doc names ${RUNNER_LABEL[ref.runner] ?? ref.runner} task \`${ref.token}\` but it is not defined in the task surface.`,
            `Define \`${ref.token}\` in the ${RUNNER_LABEL[ref.runner] ?? ref.runner} task file or update the doc.`,
            ref.line,
         ));
      }
   }

   let summary: string;
   if (checkedDocs.length === 0) {
      summary = 'No agent docs found to audit.';
   } else if (findings.length === 0) {
      summary = `All paths and task commands in agent docs resolve (${checkedDocs.length} doc${checkedDocs.length === 1 ? '' : 's'} checked).`;
   } else {
      summary = `${findings.length} broken reference${findings.length === 1 ? '' : 's'} across ${checkedDocs.length} agent doc${checkedDocs.length === 1 ? '' : 's'}.`;
   }

   return checkResult('agents_md', findings, summary);
}

type CheckFn = (root: string, options?: Record<string, unknown>) => Promise<CheckResult>;

export const AVAILABLE_CHECKS: Record<string, CheckFn> = {
   artifacts: checkArtifacts as CheckFn,
   links: checkLinks as CheckFn,
   commands: checkCommands as CheckFn,
   execplans: checkExecplans as CheckFn,
   agents_md: checkAgentsMd as CheckFn,
};

export async function runAudit(root: string, selectedChecks: string[]): Promise<AuditReport> {
   const results: Record<string, CheckResult> = {};
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

export interface AuditCliArgs {
   repo: string;
   format: 'json' | 'markdown';
   checks: string[];
   runAll: boolean;
}

export function parseCliArgs(argv: string[]): AuditCliArgs {
   const args: AuditCliArgs = {
      repo: '.',
      format: 'json',
      checks: [],
      runAll: false,
   };
   const positionals: string[] = [];
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

export async function runCli(argv: string[] = process.argv.slice(2)): Promise<void> {
   const args = parseCliArgs(argv);
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
