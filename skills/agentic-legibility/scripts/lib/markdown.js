// Lightweight Markdown parsing for audit checks.
//
// This is not a full CommonMark implementation.  It is a small, dependency-free
// parser that finds the things the audit needs: fenced code blocks (so we can
// skip their contents), inline and reference-style links, heading anchors, and
// optionally code-fence contents.  Behavior is kept close to how GitHub
// renders Markdown so that anchor slugs line up with reality.

const FENCE_OPEN = /^(\s*)(```+|~~~+)\s*([^\s`]*)\s*$/u;

function isClosingFence(line, marker) {
   const trimmed = line.trimEnd();
   return trimmed === marker || trimmed.startsWith(marker);
}

/**
 * Compute a GitHub-style anchor slug from heading text.
 *   "## Foo Bar!"  -> "foo-bar"
 *   "### `code` & stuff" -> "code--stuff"
 * Close enough to GitHub's behavior for audit purposes.
 */
export function toAnchor(headingText) {
   // Strip Markdown link wrappers but keep the link text: [text](url) -> text
   const withoutLinks = headingText.replace(/\[([^\]]+)\]\([^)]*\)/gu, '$1');
   // Strip common emphasis markers and inline code ticks
   const stripped = withoutLinks.replace(/[*_`]+/gu, '');
   const lowered = stripped.toLowerCase();
   // Drop characters that aren't alphanumeric, spaces, hyphens, or underscores.
   // Unicode letters are allowed.
   const cleaned = lowered.replace(/[^\p{L}\p{N}\s\-_]/gu, '');
   const hyphenated = cleaned.replace(/\s+/gu, '-');
   return hyphenated.replace(/^-+|-+$/gu, '');
}

function stripInlineCode(line) {
   // Remove inline code spans so links inside them are ignored.
   return line.replace(/`[^`\n]*`/gu, (match) => ' '.repeat(match.length));
}

/**
 * Parse a Markdown document into its links, headings, code-block ranges, and
 * reference definitions.  Callers receive enough detail to ignore content
 * inside code fences when it matters.
 *
 * @param {string} text
 * @returns {{
 *   links: Array<{ href: string, text: string, line: number, kind: "inline"|"reference"|"shortcut" }>,
 *   headings: Array<{ text: string, level: number, line: number, anchor: string }>,
 *   codeBlockRanges: Array<[number, number]>,
 *   referenceDefinitions: Map<string, string>,
 * }}
 */
export function parseMarkdown(text) {
   const lines = text.split(/\r?\n/u);
   const codeBlockRanges = [];
   const links = [];
   const headings = [];
   const referenceDefinitions = new Map();
   const seenAnchors = new Map();
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

function extractLineLinks(line, lineNumber, outLinks) {
   const inlineRegex = /\[([^\]]+)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/gu;
   let match;
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

/**
 * Returns true when a link target is an absolute URL or an external scheme we
 * do not resolve to the filesystem (http, https, mailto, tel, ftp, etc.).
 */
export function isExternalHref(href) {
   return /^(?:[a-z][a-z0-9+.-]*:|\/\/)/iu.test(href);
}

/**
 * Split a link href into its filesystem target and optional anchor fragment.
 * Returns { target, anchor } where either may be null.
 */
export function splitHref(href) {
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

/**
 * Resolve a reference-style link to its real href using the document's
 * reference-definition map.  Returns null if the reference is unresolvable.
 */
export function resolveReference(link, referenceDefinitions) {
   if (link.kind !== 'reference') {
      return link.href;
   }
   const label = link.href.replace(/^ref:/u, '');
   return referenceDefinitions.get(label) ?? null;
}
