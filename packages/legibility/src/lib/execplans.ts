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

function extractSectionBodies(text: string, headingTexts: string[]): Record<string, string> {
   const bodies: Record<string, string> = {};
   const lines = text.split(/\r?\n/u);
   const headingLines: Array<{ index: number; text: string }> = [];
   for (let i = 0; i < lines.length; i += 1) {
      const m = lines[i].match(/^##\s+(.*?)\s*#*\s*$/u);
      if (m) {
         headingLines.push({ index: i, text: m[1] });
      }
   }
   for (let i = 0; i < headingLines.length; i += 1) {
      const start = headingLines[i].index + 1;
      const end = i + 1 < headingLines.length ? headingLines[i + 1].index : lines.length;
      const body = lines.slice(start, end).join('\n').trim();
      bodies[headingLines[i].text.trim()] = body;
   }
   return bodies;
}

export function parseExecPlan(text: string): ParsedExecPlan {
   const { headings } = parseMarkdown(text);
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

   const progress: ExecPlanProgress = { total: 0, done: 0, remaining: 0 };
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

   const sectionBodies = extractSectionBodies(text, headings.map((h) => h.text));

   return {
      headings: headings.map((h) => h.text),
      presentSections,
      missingSections,
      progress,
      sectionBodies,
   };
}
