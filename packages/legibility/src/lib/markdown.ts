const FENCE_OPEN = /^(\s*)(```+|~~~+)\s*([^\s`]*)\s*$/u;

function isClosingFence(line: string, marker: string): boolean {
   const trimmed = line.trimEnd();
   return trimmed === marker || trimmed.startsWith(marker);
}

export function toAnchor(headingText: string): string {
   const withoutLinks = headingText.replace(/\[([^\]]+)\]\([^)]*\)/gu, '$1');
   const stripped = withoutLinks.replace(/[*_`]+/gu, '');
   const lowered = stripped.toLowerCase();
   const cleaned = lowered.replace(/[^\p{L}\p{N}\s\-_]/gu, '');
   const hyphenated = cleaned.replace(/\s+/gu, '-');
   return hyphenated.replace(/^-+|-+$/gu, '');
}

function stripInlineCode(line: string): string {
   return line.replace(/`[^`\n]*`/gu, (match) => ' '.repeat(match.length));
}

export interface MarkdownLink {
   href: string;
   text: string;
   line: number;
   kind: 'inline' | 'reference' | 'shortcut';
}

export interface MarkdownHeading {
   text: string;
   level: number;
   line: number;
   anchor: string;
}

export interface ParseMarkdownResult {
   links: MarkdownLink[];
   headings: MarkdownHeading[];
   codeBlockRanges: Array<[number, number]>;
   referenceDefinitions: Map<string, string>;
}

export function parseMarkdown(text: string): ParseMarkdownResult {
   const lines = text.split(/\r?\n/u);
   const codeBlockRanges: Array<[number, number]> = [];
   const links: MarkdownLink[] = [];
   const headings: MarkdownHeading[] = [];
   const referenceDefinitions = new Map<string, string>();
   const seenAnchors = new Map<string, number>();
   let inFence = false;
   let fenceStart = 0;
   let fenceMarker = '';

   for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      const lineNumber = index + 1;

      if (inFence) {
         if (isClosingFence(line, fenceMarker)) {
            codeBlockRanges.push([ fenceStart, lineNumber ]);
            inFence = false;
            fenceMarker = '';
         }
         continue;
      }

      const fenceMatch = line.match(FENCE_OPEN);
      if (fenceMatch) {
         inFence = true;
         fenceStart = lineNumber;
         fenceMarker = fenceMatch[2];
         continue;
      }

      const headingMatch = line.match(/^(#{1,6})\s+(.*?)\s*#*\s*$/u);
      if (headingMatch) {
         const level = headingMatch[1].length;
         const textContent = headingMatch[2];
         let anchor = toAnchor(textContent);
         if (anchor) {
            const seen = seenAnchors.get(anchor) || 0;
            if (seen > 0) {
               const suffixed = `${anchor}-${seen}`;
               seenAnchors.set(anchor, seen + 1);
               anchor = suffixed;
            } else {
               seenAnchors.set(anchor, 1);
            }
         }
         headings.push({ text: textContent, level, line: lineNumber, anchor });
         continue;
      }

      const refDefMatch = line.match(/^\s{0,3}\[([^\]]+)\]:\s*(\S+)(?:\s+.*)?$/u);
      if (refDefMatch) {
         const label = refDefMatch[1].trim().toLowerCase();
         referenceDefinitions.set(label, refDefMatch[2]);
         continue;
      }

      const stripped = stripInlineCode(line);
      extractLineLinks(stripped, lineNumber, links);
   }

   return { links, headings, codeBlockRanges, referenceDefinitions };
}

function extractLineLinks(line: string, lineNumber: number, outLinks: MarkdownLink[]): void {
   const inlineRegex = /\[([^\]]+)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/gu;
   let match: RegExpExecArray | null;
   while ((match = inlineRegex.exec(line)) !== null) {
      outLinks.push({
         href: match[2],
         text: match[1],
         line: lineNumber,
         kind: 'inline',
      });
   }

   const fullReferenceRegex = /\[([^\]]+)\]\[([^\]]*)\]/gu;
   while ((match = fullReferenceRegex.exec(line)) !== null) {
      const text = match[1];
      const ref = match[2] || match[1];
      outLinks.push({
         href: `ref:${ref.toLowerCase()}`,
         text,
         line: lineNumber,
         kind: 'reference',
      });
   }
}

export function isExternalHref(href: string): boolean {
   return /^(?:[a-z][a-z0-9+.-]*:|\/\/)/iu.test(href);
}

export function splitHref(href: string): { target: string | null; anchor: string | null } {
   const hashIndex = href.indexOf('#');
   if (hashIndex === -1) {
      return { target: href, anchor: null };
   }
   const target = href.slice(0, hashIndex);
   const anchor = href.slice(hashIndex + 1);
   return {
      target: target.length > 0 ? target : null,
      anchor: anchor.length > 0 ? anchor : null,
   };
}

export function resolveReference(
   link: MarkdownLink,
   referenceDefinitions: Map<string, string>,
): string | null {
   if (link.kind !== 'reference') {
      return link.href;
   }
   const label = link.href.replace(/^ref:/u, '');
   return referenceDefinitions.get(label) ?? null;
}

export interface CodeSnippet {
   snippet: string;
   line: number;
}

export function extractCodeSnippets(text: string): CodeSnippet[] {
   const lines = text.split(/\r?\n/u);
   const snippets: CodeSnippet[] = [];
   let inFence = false;
   let fenceMarker = '';

   for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      const lineNumber = index + 1;

      if (inFence) {
         if (isClosingFence(line, fenceMarker)) {
            inFence = false;
            fenceMarker = '';
            continue;
         }
         snippets.push({ snippet: line, line: lineNumber });
         continue;
      }

      const fenceMatch = line.match(FENCE_OPEN);
      if (fenceMatch) {
         inFence = true;
         fenceMarker = fenceMatch[2];
         continue;
      }

      const inlineRegex = /`([^`\n]+)`/gu;
      let match: RegExpExecArray | null;
      while ((match = inlineRegex.exec(line)) !== null) {
         snippets.push({ snippet: match[1], line: lineNumber });
      }
   }

   return snippets;
}

export interface InlineCodeSpan {
   content: string;
   line: number;
}

export function extractInlineCodeSpans(text: string): InlineCodeSpan[] {
   const lines = text.split(/\r?\n/u);
   const spans: InlineCodeSpan[] = [];
   let inFence = false;
   let fenceMarker = '';

   for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      const lineNumber = index + 1;

      if (inFence) {
         if (isClosingFence(line, fenceMarker)) {
            inFence = false;
            fenceMarker = '';
         }
         continue;
      }

      const fenceMatch = line.match(FENCE_OPEN);
      if (fenceMatch) {
         inFence = true;
         fenceMarker = fenceMatch[2];
         continue;
      }

      const regex = /`([^`\n]+)`/gu;
      let match: RegExpExecArray | null;
      while ((match = regex.exec(line)) !== null) {
         spans.push({ content: match[1], line: lineNumber });
      }
   }

   return spans;
}

const TASK_REFERENCE_PATTERNS = [
   { runner: 'npm', regex: /(?:^|[\s&;|(])(?:npm|pnpm|yarn|bun)\s+run(?:-script)?\s+([A-Za-z0-9_.:-]+)/gu },
   { runner: 'make', regex: /(?:^|[\s&;|(])make\s+([A-Za-z0-9_.:-]+)/gu },
   { runner: 'just', regex: /(?:^|[\s&;|(])just\s+([A-Za-z0-9_.:-]+)/gu },
   { runner: 'task', regex: /(?:^|[\s&;|(])task\s+([A-Za-z0-9_.:-]+)/gu },
   { runner: 'cargo', regex: /(?:^|[\s&;|(])cargo\s+([A-Za-z0-9_.:-]+)/gu },
   { runner: 'gradle', regex: /(?:^|[\s&;|(])(?:\.\/)?gradlew?\s+([A-Za-z0-9_.:-]+)/gu },
   { runner: 'maven', regex: /(?:^|[\s&;|(])(?:mvn|mvnw|\.\/mvnw)\s+([A-Za-z0-9_.:-]+)/gu },
   { runner: 'composer', regex: /(?:^|[\s&;|(])composer\s+(?:run(?:-script)?\s+)?([A-Za-z0-9_.:-]+)/gu },
   { runner: 'rake', regex: /(?:^|[\s&;|(])(?:bundle\s+exec\s+)?rake\s+([A-Za-z0-9_.:-]+)/gu },
   { runner: 'nx', regex: /(?:^|[\s&;|(])(?:npx\s+|pnpm\s+|yarn\s+)?nx\s+(?:run\s+)?([A-Za-z0-9_.:-]+)/gu },
   { runner: 'turbo', regex: /(?:^|[\s&;|(])(?:npx\s+|pnpm\s+|yarn\s+)?turbo\s+(?:run\s+)?([A-Za-z0-9_.:-]+)/gu },
   { runner: 'mise', regex: /(?:^|[\s&;|(])mise\s+run\s+([A-Za-z0-9_.:-]+)/gu },
   { runner: 'mix', regex: /(?:^|[\s&;|(])mix\s+([A-Za-z0-9_.:-]+)/gu },
];

function isPlaceholderToken(token: string): boolean {
   if (/^[A-Z]$/u.test(token)) return true;
   if (/^[A-Z][A-Z0-9_-]*$/u.test(token) && token.length <= 8) return true;
   return false;
}

const MAKE_BUILTINS = new Set([ 'clean', 'all', 'install', 'help' ]);
const CARGO_BUILTINS = new Set([
   'build', 'check', 'clean', 'doc', 'fetch', 'fix', 'generate-lockfile',
   'init', 'install', 'locate-project', 'login', 'logout', 'metadata', 'new',
   'owner', 'package', 'pkgid', 'publish', 'read-manifest', 'remove', 'run',
   'rustc', 'rustdoc', 'search', 'test', 'tree', 'uninstall', 'update', 'vendor',
   'verify-project', 'version', 'yank',
   'clippy', 'fmt', 'miri', 'audit', 'expand', 'bench',
]);

export interface TaskReference {
   runner: string;
   token: string;
   line: number;
   raw: string;
}

export function extractTaskReferences(text: string): TaskReference[] {
   const snippets = extractCodeSnippets(text);
   const references: TaskReference[] = [];

   for (const { snippet, line } of snippets) {
      for (const { runner, regex } of TASK_REFERENCE_PATTERNS) {
         regex.lastIndex = 0;
         let match: RegExpExecArray | null;
         while ((match = regex.exec(snippet)) !== null) {
            const token = match[1];
            if (isPlaceholderToken(token)) continue;
            if (runner === 'make' && MAKE_BUILTINS.has(token)) continue;
            if (runner === 'cargo' && CARGO_BUILTINS.has(token)) continue;
            references.push({
               runner,
               token,
               line,
               raw: match[0].trimStart(),
            });
         }
      }
   }

   return references;
}
