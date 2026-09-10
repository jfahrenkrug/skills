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

export interface CheckOptions {
   excludes?: string[];
   /** Pre-computed walkRepo result, so --check-all walks the tree once. */
   files?: string[];
   /** Pre-computed task surface, so --check-all runs the adapters once. */
   surfaceByRunner?: Record<string, Set<string>>;
   staleThresholdDays?: number;
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
   const rawFindings = [];
   const presentPaths = new Set<string>();

   for (const artifact of REQUIRED_ARTIFACTS) {
      const absolutePath = path.join(root, artifact.path);
      const exists = await pathExists(absolutePath, artifact.kind);

      if (exists) {
         presentPaths.add(artifact.path);
         continue;
      }

      rawFindings.push(finding(
         artifact.severity,
         artifact.path,
         `Required legibility artifact missing (${artifact.kind}).`,
         artifact.remediation,
      ));
   }

   const agentsMdPresent = presentPaths.has('AGENTS.md');
   const findings = rawFindings.filter((f) => {
      if (f.path === 'CLAUDE.md' && agentsMdPresent) return false;
      return true;
   });

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

async function resolveExistingLinkTarget(root: string, relpath: string): Promise<string | null> {
   try {
      const stat = await fs.stat(path.join(root, relpath));
      // Directory links ([docs](docs/)) are valid targets too.
      if (stat.isFile()) return relpath;
      if (!stat.isDirectory()) return null;

      for (const entryFile of [ 'README.md', 'index.md' ]) {
         const entryRelpath = path.posix.join(relpath, entryFile);
         const entryStat = await fs.stat(path.join(root, entryRelpath)).catch(() => null);
         if (entryStat?.isFile()) return entryRelpath;
      }

      return relpath;
   } catch (_error) {
      return null;
   }
}

async function fileExistsInRepo(root: string, relpath: string): Promise<boolean> {
   return (await resolveExistingLinkTarget(root, relpath)) !== null;
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
   options: CheckOptions = {},
): Promise<CheckResult> {
   const excludes = options.excludes || [];
   const files = options.files ?? await walkRepo(root, excludes);
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

         const effectiveTarget = await resolveExistingLinkTarget(root, resolved.target);
         if (effectiveTarget === null) {
            findings.push(finding(
               SEVERITY_ERROR,
               relpath,
               `Broken link to \`${resolvedHref}\` (target not found).`,
               `Update the link or create the target file \`${resolved.target}\`.`,
               link.line,
            ));
            continue;
         }

         if (resolved.anchor && isMarkdownFile(effectiveTarget)) {
            const targetParsed = parsedByFile.get(effectiveTarget) || parseMarkdown(await readText(path.join(root, effectiveTarget)));
            const anchors = new Set(targetParsed.headings.map((h) => h.anchor).filter(Boolean));
            if (!anchors.has(resolved.anchor)) {
               findings.push(finding(
                  SEVERITY_WARNING,
                  relpath,
                  `Broken anchor \`#${resolved.anchor}\` in \`${effectiveTarget}\` (no matching heading).`,
                  `Update the anchor to match a heading in \`${effectiveTarget}\` or add the heading.`,
                  link.line,
               ));
            }
         }

         if (isMarkdownFile(effectiveTarget) && adjacency.has(effectiveTarget)) {
            adjacency.get(relpath)!.add(effectiveTarget);
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
   python: 'Python',
   gradle: 'Gradle',
   maven: 'Maven',
   dotnet: '.NET / MSBuild',
   cmake: 'CMake',
   composer: 'Composer',
   rake: 'rake',
   xcode: 'Xcode',
   nx: 'Nx',
   turbo: 'Turbo',
   mise: 'mise',
   mix: 'Mix',
};

export async function checkCommands(
   root: string,
   options: CheckOptions = {},
): Promise<CheckResult> {
   const excludes = options.excludes || [];
   const files = options.files ?? await walkRepo(root, excludes);
   const surfaceByRunner = options.surfaceByRunner ?? await collectTaskSurfaceByRunner(root, files);
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
   options: CheckOptions = {},
): Promise<CheckResult> {
   const thresholdDays = options.staleThresholdDays ?? DEFAULT_STALE_THRESHOLD_DAYS;
   const findings = [];
   const now = Math.floor(Date.now() / 1000);
   const thresholdSeconds = thresholdDays * 86400;

   const activePlans = await listExecPlans(root, 'active');
   const completedPlans = await listExecPlans(root, 'completed');

   const parsedByPath = new Map<string, ReturnType<typeof parseExecPlan>>();
   for (const relpath of [ ...activePlans, ...completedPlans ]) {
      parsedByPath.set(relpath, parseExecPlan(await readText(path.join(root, relpath))));
   }
   const timestampByPath = new Map(await Promise.all(activePlans.map(async (relpath) => {
      return [ relpath, await lastActivityTimestamp(root, relpath) ] as const;
   })));

   for (const [ relpath, parsed ] of parsedByPath) {
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
      const parsed = parsedByPath.get(relpath)!;
      const timestamp = timestampByPath.get(relpath) ?? null;
      const isStale = timestamp !== null && now - timestamp > thresholdSeconds;

      if (isStale) {
         const days = Math.floor((now - timestamp!) / 86400);
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
         const outcomesBody = parsed.sectionBodies['Outcomes & Retrospective'] ?? '';
         if (!outcomesBody.trim()) {
            findings.push(finding(
               SEVERITY_WARNING,
               relpath,
               'Active ExecPlan has every progress checkbox completed but no Outcomes & Retrospective body.',
               'Fill in Outcomes & Retrospective, then move the plan to docs/exec-plans/completed/.',
            ));
         }
      }

      if (parsed.presentSections.has('Validation and Acceptance')) {
         const body = parsed.sectionBodies['Validation and Acceptance'] ?? '';
         if (!body.trim()) {
            findings.push(finding(
               SEVERITY_WARNING,
               relpath,
               'ExecPlan section `Validation and Acceptance` is empty.',
               'Describe how a reader can verify the change works (commands to run, expected outputs, behaviors to observe).',
            ));
         }
      }

      if (isStale && parsed.progress.total > 0 && parsed.progress.remaining === 1) {
         findings.push(finding(
            SEVERITY_WARNING,
            relpath,
            'Active ExecPlan has a single unchecked task with no recent activity.',
            'Either finish the remaining task or split it into smaller pieces and update Progress.',
         ));
      }
   }

   for (const relpath of completedPlans) {
      const parsed = parsedByPath.get(relpath)!;
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

const GIT_REMOTE_NAMES = new Set([ 'origin', 'upstream' ]);

/**
 * Git refs like `origin/main`, `refs/heads/main` or `HEAD~1/file` share the
 * path-like shape `looksLikePath` matches (a slash-containing token) but name
 * commits, not files — flagging them as broken paths is a false positive.
 *
 * Any `refs/<namespace>/…` counts: the namespace set is open-ended
 * (`refs/pull/42/head`, `refs/merge-requests/…`) and no real repo-relative
 * path lives under `refs/`.
 *
 * Slash-free refs (`HEAD`, `HEAD~1`, `HEAD^`) never reach here: `looksLikePath`
 * already rejects any token without a `/`.
 */
function looksLikeGitRef(candidate: string): boolean {
   const [ first, second ] = candidate.split('/');
   if (second === undefined) return false;
   if (GIT_REMOTE_NAMES.has(first)) return true;
   if (first === 'refs') return second.length > 0;
   return /^HEAD[~^]/u.test(first);
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
   options: CheckOptions = {},
): Promise<CheckResult> {
   const excludes = options.excludes || [];
   const files = options.files ?? await walkRepo(root, excludes);
   const surfaceByRunner = options.surfaceByRunner ?? await collectTaskSurfaceByRunner(root, files);
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
         if (looksLikeGitRef(candidate)) continue;
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

const CROSS_TOOL_ALIAS_FILES = [
   'CLAUDE.md',
   '.github/copilot-instructions.md',
   '.windsurfrules',
   'GEMINI.md',
   'CONVENTIONS.md',
];

const CROSS_TOOL_ALIAS_DIRS = [
   '.cursor/rules',
];

function tokenizeAliasContent(text: string): Set<string> {
   const lines = text.split(/\r?\n/u);
   const sentences = new Set<string>();
   for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.length >= 30) {
         sentences.add(trimmed.toLowerCase());
      }
   }
   return sentences;
}

function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
   if (a.size === 0 && b.size === 0) return 1;
   let intersection = 0;
   for (const value of a) {
      if (b.has(value)) intersection += 1;
   }
   const union = a.size + b.size - intersection;
   if (union === 0) return 1;
   return intersection / union;
}

function aliasIncludesAgentsMd(text: string): boolean {
   if (/@\.?\/?AGENTS\.md/u.test(text)) return true;
   if (/^\s*read:\s*AGENTS\.md\s*$/mu.test(text)) return true;
   if (/^\s*include:\s*AGENTS\.md\s*$/mu.test(text)) return true;
   return false;
}

async function isSymlink(absolutePath: string): Promise<boolean> {
   try {
      const stat = await fs.lstat(absolutePath);
      return stat.isSymbolicLink();
   } catch (_error) {
      return false;
   }
}

async function listCursorRuleFiles(root: string): Promise<string[]> {
   const dir = path.join(root, '.cursor', 'rules');
   try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      return entries
         .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.mdc'))
         .map((entry) => path.posix.join('.cursor/rules', entry.name))
         .sort();
   } catch (_error) {
      return [];
   }
}

export async function checkCrossToolAliases(root: string): Promise<CheckResult> {
   const findings = [];
   const agentsAbs = path.join(root, 'AGENTS.md');
   const agentsExists = await pathExists(agentsAbs, 'file');
   const agentsText = agentsExists ? await readText(agentsAbs) : '';
   const agentsSentences = agentsExists ? tokenizeAliasContent(agentsText) : new Set<string>();

   const aliasPaths: string[] = [];
   for (const aliasPath of CROSS_TOOL_ALIAS_FILES) {
      if (await pathExists(path.join(root, aliasPath), 'file')) {
         aliasPaths.push(aliasPath);
      }
   }
   for (const cursorDir of CROSS_TOOL_ALIAS_DIRS) {
      if (cursorDir === '.cursor/rules') {
         aliasPaths.push(...await listCursorRuleFiles(root));
      }
   }

   if (!agentsExists) {
      if (aliasPaths.length >= 2) {
         let largest = aliasPaths[0];
         let largestSize = -1;
         for (const aliasPath of aliasPaths) {
            try {
               const stat = await fs.stat(path.join(root, aliasPath));
               if (stat.size > largestSize) {
                  largestSize = stat.size;
                  largest = aliasPath;
               }
            } catch (_error) {
               continue;
            }
         }
         findings.push(finding(
            SEVERITY_WARNING,
            largest,
            'Multiple cross-tool agent docs but no canonical AGENTS.md.',
            'Pick AGENTS.md as the source of truth and make the others symlinks or @AGENTS.md includes.',
         ));
      }
      const summary = findings.length === 0
         ? 'No AGENTS.md and no cross-tool aliases to compare.'
         : `${findings.length} cross-tool alias issue${findings.length === 1 ? '' : 's'}.`;
      return checkResult('cross_tool_aliases', findings, summary);
   }

   for (const aliasPath of aliasPaths) {
      const aliasAbs = path.join(root, aliasPath);
      if (await isSymlink(aliasAbs)) continue;
      const aliasText = await readText(aliasAbs);
      if (!aliasText) continue;
      if (aliasIncludesAgentsMd(aliasText)) continue;
      if (aliasText === agentsText) continue;

      const aliasSentences = tokenizeAliasContent(aliasText);
      const similarity = jaccardSimilarity(agentsSentences, aliasSentences);
      if (similarity < 0.5) {
         findings.push(finding(
            SEVERITY_WARNING,
            aliasPath,
            `Cross-tool alias \`${aliasPath}\` looks substantively different from AGENTS.md (similarity ${similarity.toFixed(2)}).`,
            `Make \`${aliasPath}\` a symlink to AGENTS.md, or include AGENTS.md (e.g. \`@AGENTS.md\`).`,
         ));
      }
   }

   const summary = findings.length === 0
      ? `Cross-tool aliases consistent with AGENTS.md (${aliasPaths.length} alias${aliasPaths.length === 1 ? '' : 'es'} checked).`
      : `${findings.length} cross-tool alias drift finding${findings.length === 1 ? '' : 's'} across ${aliasPaths.length} alias${aliasPaths.length === 1 ? '' : 'es'}.`;

   return checkResult('cross_tool_aliases', findings, summary);
}

const CONTEXT_BUDGET_DOCS = [
   'AGENTS.md',
   'CLAUDE.md',
   '.github/copilot-instructions.md',
];

const CONTEXT_BUDGET_WARN_TOKENS = 4000;
const CONTEXT_BUDGET_ERROR_TOKENS = 8000;

export async function checkContextBudget(root: string): Promise<CheckResult> {
   const findings = [];
   let checkedCount = 0;

   for (const docPath of CONTEXT_BUDGET_DOCS) {
      const abs = path.join(root, docPath);
      let size: number;
      try {
         const stat = await fs.stat(abs);
         if (!stat.isFile()) continue;
         size = stat.size;
      } catch (_error) {
         continue;
      }
      checkedCount += 1;
      const text = await readText(abs);
      // readText returns '' for files over MAX_TEXT_SIZE — exactly the docs
      // this check must flag — so fall back to the byte size on disk.
      const tokens = text ? Math.ceil(text.length / 4) : Math.ceil(size / 4);

      if (tokens > CONTEXT_BUDGET_ERROR_TOKENS) {
         findings.push(finding(
            SEVERITY_ERROR,
            docPath,
            `Agent doc is approximately ${tokens} tokens (>${CONTEXT_BUDGET_ERROR_TOKENS}); agents typically read ≤ ${CONTEXT_BUDGET_WARN_TOKENS} efficiently.`,
            'Trim the doc to a one-screen index; push detail into `docs/` and link from here.',
            1,
         ));
      } else if (tokens > CONTEXT_BUDGET_WARN_TOKENS) {
         findings.push(finding(
            SEVERITY_WARNING,
            docPath,
            `Agent doc is approximately ${tokens} tokens (>${CONTEXT_BUDGET_WARN_TOKENS}); consider trimming.`,
            'Move detail into `docs/` and keep this file as a short index.',
            1,
         ));
      }
   }

   const summary = findings.length === 0
      ? `Agent docs within context budget (${checkedCount} doc${checkedCount === 1 ? '' : 's'} checked).`
      : `${findings.length} agent doc${findings.length === 1 ? '' : 's'} exceeds the context budget.`;

   return checkResult('context_budget', findings, summary);
}

export async function checkReadmeDrift(root: string): Promise<CheckResult> {
   const readmePath = path.join(root, 'README.md');
   const agentsPath = path.join(root, 'AGENTS.md');
   const readmeExists = await pathExists(readmePath, 'file');
   const agentsExists = await pathExists(agentsPath, 'file');

   if (!readmeExists || !agentsExists) {
      return checkResult('readme_drift', [], 'README.md or AGENTS.md absent; nothing to compare.');
   }

   const readmeText = await readText(readmePath);
   const agentsText = await readText(agentsPath);

   const readmeRefs = extractTaskReferences(readmeText);
   const agentsRefs = extractTaskReferences(agentsText);

   const byRunnerReadme = new Map<string, Map<string, number>>();
   const byRunnerAgents = new Map<string, Map<string, number>>();

   function addRef(map: Map<string, Map<string, number>>, runner: string, token: string, line: number): void {
      if (!map.has(runner)) map.set(runner, new Map());
      const inner = map.get(runner)!;
      if (!inner.has(token)) inner.set(token, line);
   }

   for (const ref of readmeRefs) addRef(byRunnerReadme, ref.runner, ref.token, ref.line);
   for (const ref of agentsRefs) addRef(byRunnerAgents, ref.runner, ref.token, ref.line);

   const findings = [];

   const sharedRunners = new Set(
      Array.from(byRunnerReadme.keys()).filter((r) => byRunnerAgents.has(r)),
   );

   for (const runner of sharedRunners) {
      const readmeMap = byRunnerReadme.get(runner)!;
      const agentsMap = byRunnerAgents.get(runner)!;
      const runnerLabel = RUNNER_LABEL[runner] ?? runner;

      for (const [ token, line ] of readmeMap.entries()) {
         if (!agentsMap.has(token)) {
            findings.push(finding(
               SEVERITY_WARNING,
               'README.md',
               `README.md uses ${runnerLabel} task \`${token}\` but AGENTS.md does not mention it (drift).`,
               'Align the two docs: either update AGENTS.md to match, or pick one canonical command and reference it from both.',
               line,
            ));
         }
      }
      for (const [ token, line ] of agentsMap.entries()) {
         if (!readmeMap.has(token)) {
            findings.push(finding(
               SEVERITY_WARNING,
               'AGENTS.md',
               `AGENTS.md uses ${runnerLabel} task \`${token}\` but README.md does not mention it (drift).`,
               'Align the two docs: either update README.md to match, or pick one canonical command and reference it from both.',
               line,
            ));
         }
      }
   }

   const summary = findings.length === 0
      ? 'README.md and AGENTS.md describe the same tasks consistently.'
      : `${findings.length} task drift finding${findings.length === 1 ? '' : 's'} between README.md and AGENTS.md.`;

   return checkResult('readme_drift', findings, summary);
}

async function rootPackageJsonHasWorkspaces(root: string): Promise<boolean> {
   const text = await readText(path.join(root, 'package.json'));
   if (!text) return false;
   try {
      const parsed: unknown = JSON.parse(text);
      if (typeof parsed !== 'object' || parsed === null) return false;
      const ws = (parsed as Record<string, unknown>).workspaces;
      if (Array.isArray(ws) && ws.length > 0) return true;
      if (ws && typeof ws === 'object' && Array.isArray((ws as Record<string, unknown>).packages)) {
         return ((ws as Record<string, unknown>).packages as unknown[]).length > 0;
      }
      return false;
   } catch (_error) {
      return false;
   }
}

export async function checkNesting(
   root: string,
   options: CheckOptions = {},
): Promise<CheckResult> {
   const excludes = options.excludes || [];
   const files = options.files ?? await walkRepo(root, excludes);

   const hasPnpmWorkspaces = files.includes('pnpm-workspace.yaml') || files.includes('pnpm-workspace.yml');
   const hasNxJson = files.includes('nx.json');
   const projectJsonFiles = files.filter((f) => path.posix.basename(f) === 'project.json');
   const hasTurboJson = files.includes('turbo.json');
   const rootHasWorkspaces = files.includes('package.json') && await rootPackageJsonHasWorkspaces(root);

   const isMonorepo = hasPnpmWorkspaces || hasNxJson || hasTurboJson || rootHasWorkspaces || projectJsonFiles.length > 0;

   if (!isMonorepo) {
      return checkResult('nesting', [], 'Not a monorepo; per-package AGENTS.md not required.');
   }

   const packageDirs = new Set<string>();

   for (const projectJson of projectJsonFiles) {
      const dir = path.posix.dirname(projectJson);
      if (dir && dir !== '.') packageDirs.add(dir);
   }

   if (rootHasWorkspaces || hasPnpmWorkspaces || hasTurboJson) {
      for (const file of files) {
         if (path.posix.basename(file) === 'package.json' && file !== 'package.json') {
            const dir = path.posix.dirname(file);
            packageDirs.add(dir);
         }
      }
   }

   if (packageDirs.size === 0) {
      return checkResult('nesting', [], 'Monorepo detected but no package directories discovered.');
   }

   const findings = [];
   const present: string[] = [];
   const missing: string[] = [];

   for (const dir of Array.from(packageDirs).sort()) {
      const hasAgents = files.includes(`${dir}/AGENTS.md`);
      const hasClaude = files.includes(`${dir}/CLAUDE.md`);
      if (hasAgents || hasClaude) {
         present.push(dir);
      } else {
         missing.push(dir);
      }
   }

   const total = packageDirs.size;
   const ratio = present.length / total;
   const halfOrMore = ratio >= 0.5;

   for (const dir of missing) {
      const message = halfOrMore
         ? `Most workspace packages have AGENTS.md; consider adding one to \`${dir}\` for consistency.`
         : `Workspace package \`${dir}\` lacks AGENTS.md; subtree-specific guidance helps agents stay scoped.`;
      findings.push(finding(
         SEVERITY_WARNING,
         dir,
         message,
         `Add \`${dir}/AGENTS.md\` describing the package's purpose, primary commands, and links to its docs.`,
      ));
   }

   const summary = findings.length === 0
      ? `All ${total} workspace package${total === 1 ? '' : 's'} have a per-package agent doc.`
      : `${present.length}/${total} workspace package${total === 1 ? '' : 's'} have AGENTS.md; ${missing.length} missing.`;

   return checkResult('nesting', findings, summary);
}

export const REPO_MAP_CANDIDATES = [
   'docs/repo-map.md',
   'docs/architecture.md',
   'ARCHITECTURE.md',
];

export async function checkRepoMap(root: string): Promise<CheckResult> {
   for (const candidate of REPO_MAP_CANDIDATES) {
      if (await pathExists(path.join(root, candidate), 'file')) {
         return checkResult('repo_map', [], `Repo map found at \`${candidate}\`.`);
      }
   }
   const findings = [ finding(
      SEVERITY_WARNING,
      '.',
      'No repo map found.',
      'Add `docs/repo-map.md` or `ARCHITECTURE.md` describing module boundaries, allowed dependency directions, and where each subsystem lives.',
   ) ];
   return checkResult('repo_map', findings, 'No repo map found.');
}

function isAdrFile(relpath: string): boolean {
   const lower = relpath.toLowerCase();
   if (!/(?:\.md|\.mdx)$/u.test(lower)) return false;
   return /(^|\/)(adr|adrs|decisions?)\//u.test(lower);
}

export async function checkAdrs(
   root: string,
   options: CheckOptions = {},
): Promise<CheckResult> {
   const excludes = options.excludes || [];
   const files = options.files ?? await walkRepo(root, excludes);
   const adrFiles = files.filter(isAdrFile).sort();

   if (adrFiles.length === 0) {
      return checkResult('adrs', [], 'No ADRs detected.');
   }

   const findings = [];

   const adrDirs = new Set(adrFiles.map((f) => path.posix.dirname(f)));
   for (const dir of adrDirs) {
      const hasIndex = files.some((f) => {
         const lower = f.toLowerCase();
         return lower === `${dir.toLowerCase()}/readme.md` || lower === `${dir.toLowerCase()}/index.md`;
      });
      if (!hasIndex) {
         findings.push(finding(
            SEVERITY_WARNING,
            dir,
            'ADR directory has no index (`README.md` or `index.md`).',
            `Add \`${dir}/README.md\` listing each ADR with title, date, and status.`,
         ));
      }
   }

   for (const adrPath of adrFiles) {
      const lower = path.posix.basename(adrPath).toLowerCase();
      if (lower === 'readme.md' || lower === 'index.md') continue;
      const text = await readText(path.join(root, adrPath));
      if (!text) continue;
      const parsed = parseMarkdown(text);
      const headings = new Set(parsed.headings.map((h) => h.text.toLowerCase().trim()));
      const sectionMatches = [ 'status', 'context', 'decision' ].filter((name) => {
         return Array.from(headings).some((h) => h === name || h.startsWith(`${name} `) || h.startsWith(`${name}:`));
      }).length;
      if (sectionMatches < 2) {
         findings.push(finding(
            SEVERITY_WARNING,
            adrPath,
            'ADR is missing standard sections (Status / Context / Decision).',
            'Add headings for Status, Context, and Decision so the record is self-explanatory.',
         ));
      }

      const supersededMatch = text.match(/superseded\s+by[^\n]*\[([^\]]+)\]\(([^)\s]+)\)/iu);
      if (supersededMatch) {
         const href = supersededMatch[2];
         if (!isExternalHref(href)) {
            const resolved = resolveLinkTarget(adrPath, href);
            if (resolved.target && !resolved.target.startsWith('..')) {
               const exists = await fileExistsInRepo(root, resolved.target);
               if (!exists) {
                  findings.push(finding(
                     SEVERITY_ERROR,
                     adrPath,
                     `ADR claims supersession by \`${href}\` but the target does not exist.`,
                     'Update the link to point at the actual successor ADR or remove the supersession claim.',
                  ));
               }
            }
         }
      }
   }

   const summary = findings.length === 0
      ? `All ${adrFiles.length} ADR${adrFiles.length === 1 ? '' : 's'} look healthy.`
      : `${findings.length} ADR finding${findings.length === 1 ? '' : 's'} across ${adrFiles.length} file${adrFiles.length === 1 ? '' : 's'}.`;

   return checkResult('adrs', findings, summary);
}

type CheckFn = (root: string, options?: CheckOptions) => Promise<CheckResult>;

export const AVAILABLE_CHECKS: Record<string, CheckFn> = {
   artifacts: checkArtifacts as CheckFn,
   links: checkLinks as CheckFn,
   commands: checkCommands as CheckFn,
   execplans: checkExecplans as CheckFn,
   agents_md: checkAgentsMd as CheckFn,
   cross_tool_aliases: checkCrossToolAliases as CheckFn,
   context_budget: checkContextBudget as CheckFn,
   readme_drift: checkReadmeDrift as CheckFn,
   nesting: checkNesting as CheckFn,
   repo_map: checkRepoMap as CheckFn,
   adrs: checkAdrs as CheckFn,
};

const CHECKS_USING_FILES = new Set([ 'links', 'commands', 'agents_md', 'nesting', 'adrs' ]);
const CHECKS_USING_SURFACE = new Set([ 'commands', 'agents_md' ]);

export async function runAudit(
   root: string,
   selectedChecks: string[],
   options: CheckOptions = {},
): Promise<AuditReport> {
   const results: Record<string, CheckResult> = {};
   const names = selectedChecks.length > 0 ? selectedChecks : Object.keys(AVAILABLE_CHECKS);

   for (const name of names) {
      if (!AVAILABLE_CHECKS[name]) {
         throw new Error(`Unknown check: ${name}. Valid checks: ${Object.keys(AVAILABLE_CHECKS).join(', ')}`);
      }
   }

   const shared: CheckOptions = { ...options };
   if (!shared.files && names.some((name) => CHECKS_USING_FILES.has(name))) {
      shared.files = await walkRepo(root, shared.excludes || []);
   }
   if (!shared.surfaceByRunner && shared.files && names.some((name) => CHECKS_USING_SURFACE.has(name))) {
      shared.surfaceByRunner = await collectTaskSurfaceByRunner(root, shared.files);
   }

   for (const name of names) {
      results[name] = await AVAILABLE_CHECKS[name](root, shared);
   }

   return auditReport(root, results);
}

export interface AuditCliArgs {
   repo: string;
   format: 'json' | 'markdown';
   checks: string[];
   runAll: boolean;
   staleThresholdDays?: number;
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
      } else if (arg === '--stale-threshold-days') {
         const value = argv[index + 1];
         if (!value || !/^\d+$/u.test(value) || Number.parseInt(value, 10) < 1) {
            throw new Error('--stale-threshold-days requires a positive integer number of days');
         }
         args.staleThresholdDays = Number.parseInt(value, 10);
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
   const options: CheckOptions = { staleThresholdDays: args.staleThresholdDays };

   if (singleCheck) {
      const name = checks[0];
      const runner = AVAILABLE_CHECKS[name];
      const result = await runner(root, options);
      const output = args.format === 'markdown'
         ? formatSingleCheckMarkdown(result)
         : formatSingleCheckJson(result);
      process.stdout.write(`${output}\n`);
      if (result.status === 'drift') {
         process.exitCode = 1;
      }
      return;
   }

   const report = await runAudit(root, checks, options);
   const output = args.format === 'markdown'
      ? formatAuditMarkdown(report)
      : formatJson(report);
   process.stdout.write(`${output}\n`);

   if (report.status === 'drift') {
      process.exitCode = 1;
   }
}
