// ExecPlan section and checkbox extraction.
//
// An ExecPlan (see skills/agentic-legibility/PLANS.md) is a Markdown file
// with a fixed set of required sections, a `Progress` checklist, and a
// series of narrative sections.  The audit `--check-execplans` check parses
// these plans and reports on missing sections, progress counts, and
// completion state.  This module stays purely text-based; filesystem and
// git concerns live in `audit_repo.js` and `lib/git.js`.

import { parseMarkdown } from './markdown.js';

/**
 * The twelve sections every ExecPlan must contain.  Spelling and spacing
 * come directly from PLANS.md — in particular the ampersand in "Surprises
 * & Discoveries" and the slash in "Purpose / Big Picture" must match
 * exactly, since we key on the heading text.
 */
export const REQUIRED_SECTIONS = [
   'Purpose / Big Picture',
   'Progress',
   'Surprises & Discoveries',
   'Decision Log',
   'Outcomes & Retrospective',
   'Context and Orientation',
   'Plan of Work',
   'Concrete Steps',
   'Validation and Acceptance',
   'Idempotence and Recovery',
   'Artifacts and Notes',
   'Interfaces and Dependencies',
];

const CHECKBOX_REGEX = /^\s*[*-]\s+\[([ xX])\]/u;

function normalizeHeading(text) {
   return text.trim().replace(/\s+/gu, ' ').toLowerCase();
}

/**
 * Parse an ExecPlan's Markdown text into a structured summary:
 *   {
 *     headings: string[],                 // every heading level 1-6 encountered, in order
 *     presentSections: Set<string>,       // the normalized names of required sections found
 *     missingSections: string[],          // required sections not found (preserves PLANS.md casing)
 *     progress: { total, done, remaining }
 *   }
 *
 * The progress counts scan the entire document for GitHub-style checklist
 * items.  The rationale is that in practice PLANS.md places the `Progress`
 * list at the top and nowhere else uses `[ ]`/`[x]` markers, so scanning
 * the whole file stays accurate and avoids fragile section-boundary logic.
 */
export function parseExecPlan(text) {
   const { headings } = parseMarkdown(text);
   const presentHeadings = new Set(headings.map((h) => normalizeHeading(h.text)));

   const presentSections = new Set();
   const missingSections = [];

   for (const name of REQUIRED_SECTIONS) {
      if (presentHeadings.has(normalizeHeading(name))) {
         presentSections.add(name);
      } else {
         missingSections.push(name);
      }
   }

   const progress = { total: 0, done: 0, remaining: 0 };
   for (const line of text.split(/\r?\n/u)) {
      const match = line.match(CHECKBOX_REGEX);
      if (!match) continue;
      progress.total += 1;
      if (match[1] === 'x' || match[1] === 'X') {
         progress.done += 1;
      } else {
         progress.remaining += 1;
      }
   }

   return {
      headings: headings.map((h) => h.text),
      presentSections,
      missingSections,
      progress,
   };
}
