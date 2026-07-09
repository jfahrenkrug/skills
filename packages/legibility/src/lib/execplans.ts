import { parseMarkdown } from './markdown.js';

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

function normalizeHeading(text: string): string {
   return text.trim().replace(/\s+/gu, ' ').toLowerCase();
}

export interface ExecPlanProgress {
   total: number;
   done: number;
   remaining: number;
}

export interface ParsedExecPlan {
   headings: string[];
   presentSections: Set<string>;
   missingSections: string[];
   progress: ExecPlanProgress;
   sectionBodies: Record<string, string>;
}

function isFencedLine(lineNumber: number, codeBlockRanges: Array<[number, number]>): boolean {
   return codeBlockRanges.some(([ start, end ]) => lineNumber >= start && lineNumber <= end);
}

function extractSectionBodies(
   lines: string[],
   headings: Array<{ text: string; level: number; line: number }>,
): Record<string, string> {
   const bodies: Record<string, string> = {};
   const sectionHeadings = headings.filter((h) => h.level === 2);
   for (let i = 0; i < sectionHeadings.length; i += 1) {
      const start = sectionHeadings[i].line;
      const end = i + 1 < sectionHeadings.length ? sectionHeadings[i + 1].line - 1 : lines.length;
      const body = lines.slice(start, end).join('\n').trim();
      // Key by the canonical section name when the heading matches one (case-
      // and whitespace-insensitively), so lookups by REQUIRED_SECTIONS names
      // agree with the presentSections check.
      const canonical = REQUIRED_SECTIONS.find((name) => {
         return normalizeHeading(name) === normalizeHeading(sectionHeadings[i].text);
      });
      bodies[canonical ?? sectionHeadings[i].text.trim()] = body;
   }
   return bodies;
}

export function parseExecPlan(text: string): ParsedExecPlan {
   const { headings, codeBlockRanges } = parseMarkdown(text);
   const presentHeadings = new Set(headings.map((h) => normalizeHeading(h.text)));

   const presentSections = new Set<string>();
   const missingSections: string[] = [];

   for (const name of REQUIRED_SECTIONS) {
      if (presentHeadings.has(normalizeHeading(name))) {
         presentSections.add(name);
      } else {
         missingSections.push(name);
      }
   }

   const lines = text.split(/\r?\n/u);
   const progress: ExecPlanProgress = { total: 0, done: 0, remaining: 0 };
   for (let index = 0; index < lines.length; index += 1) {
      if (isFencedLine(index + 1, codeBlockRanges)) continue;
      const match = lines[index].match(CHECKBOX_REGEX);
      if (!match) continue;
      progress.total += 1;
      if (match[1] === 'x' || match[1] === 'X') {
         progress.done += 1;
      } else {
         progress.remaining += 1;
      }
   }

   const sectionBodies = extractSectionBodies(lines, headings);

   return {
      headings: headings.map((h) => h.text),
      presentSections,
      missingSections,
      progress,
      sectionBodies,
   };
}
