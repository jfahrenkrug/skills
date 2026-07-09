import { describe, it } from 'vitest';
import { expect } from 'vitest';

import {
   parseMarkdown,
   toAnchor,
   isExternalHref,
   splitHref,
   resolveReference,
   extractTaskReferences,
} from '../src/lib/markdown.js';

describe('markdown', () => {
   describe('toAnchor', () => {
      it('lowercases and replaces spaces with hyphens', () => {
         expect(toAnchor('Hello World')).toBe('hello-world');
      });

      it('strips punctuation other than hyphens and underscores', () => {
         expect(toAnchor('Foo, Bar!')).toBe('foo-bar');
      });

      it('keeps unicode letters', () => {
         expect(toAnchor('Über Café')).toBe('über-café');
      });

      it('collapses multiple whitespace into a single hyphen', () => {
         expect(toAnchor('A   B')).toBe('a-b');
      });

      it('strips common emphasis and inline code markers', () => {
         expect(toAnchor('**bold** `code`')).toBe('bold-code');
      });

      it('strips Markdown link wrappers but keeps the link text', () => {
         expect(toAnchor('See [docs](/docs/) for more')).toBe('see-docs-for-more');
      });
   });

   describe('isExternalHref', () => {
      it('returns true for http/https/mailto', () => {
         expect(isExternalHref('https://example.com')).toBe(true);
         expect(isExternalHref('http://x.y')).toBe(true);
         expect(isExternalHref('mailto:a@b.com')).toBe(true);
      });

      it('returns false for relative paths and anchors', () => {
         expect(isExternalHref('docs/intro.md')).toBe(false);
         expect(isExternalHref('./foo.md')).toBe(false);
         expect(isExternalHref('#heading')).toBe(false);
      });
   });

   describe('splitHref', () => {
      it('splits a path-with-anchor into target and anchor', () => {
         expect(splitHref('docs/intro.md#setup')).toEqual({ target: 'docs/intro.md', anchor: 'setup' });
      });

      it('handles anchor-only hrefs', () => {
         expect(splitHref('#setup')).toEqual({ target: null, anchor: 'setup' });
      });

      it('handles hrefs without anchors', () => {
         expect(splitHref('docs/intro.md')).toEqual({ target: 'docs/intro.md', anchor: null });
      });
   });

   describe('parseMarkdown: headings', () => {
      it('extracts heading text, level, line number, and anchor', () => {
         const md = [ '# Top', '', '## Sub Heading', '', '### Deep' ].join('\n');
         const { headings } = parseMarkdown(md);
         expect(headings.length).toBe(3);
         expect(headings[0]).toEqual({ text: 'Top', level: 1, line: 1, anchor: 'top' });
         expect(headings[1]).toEqual({ text: 'Sub Heading', level: 2, line: 3, anchor: 'sub-heading' });
         expect(headings[2]).toEqual({ text: 'Deep', level: 3, line: 5, anchor: 'deep' });
      });

      it('disambiguates duplicate anchors with numeric suffix', () => {
         const md = [ '# Foo', '## Foo', '### Foo' ].join('\n');
         const { headings } = parseMarkdown(md);
         expect(headings.map((h) => h.anchor)).toEqual([ 'foo', 'foo-1', 'foo-2' ]);
      });
   });

   describe('parseMarkdown: links', () => {
      it('extracts inline links', () => {
         const md = 'See [docs](docs/intro.md) and [home](../README.md).';
         const { links } = parseMarkdown(md);
         expect(links.length).toBe(2);
         expect(links[0]).toEqual({ href: 'docs/intro.md', text: 'docs', line: 1, kind: 'inline' });
         expect(links[1]).toEqual({ href: '../README.md', text: 'home', line: 1, kind: 'inline' });
      });

      it('ignores links inside fenced code blocks', () => {
         const md = [
            'Real [link](real.md).',
            '```',
            'Fake [link](fake.md)',
            '```',
            'Another [real](r2.md).',
         ].join('\n');
         const { links, codeBlockRanges } = parseMarkdown(md);
         expect(codeBlockRanges).toEqual([[ 2, 4 ]]);
         expect(links.map((l) => l.href).sort()).toEqual([ 'r2.md', 'real.md' ]);
      });

      it('ignores links inside inline code spans', () => {
         const md = 'Talk about `[ignored](oops.md)` but use [real](real.md).';
         const { links } = parseMarkdown(md);
         expect(links.length).toBe(1);
         expect(links[0].href).toBe('real.md');
      });

      it('extracts reference definitions and reference links', () => {
         const md = [
            'See [docs][intro].',
            '',
            '[intro]: docs/intro.md',
         ].join('\n');
         const { links, referenceDefinitions } = parseMarkdown(md);
         expect(referenceDefinitions.get('intro')).toBe('docs/intro.md');
         expect(links.length).toBe(1);
         expect(links[0].kind).toBe('reference');
         const resolved = resolveReference(links[0], referenceDefinitions);
         expect(resolved).toBe('docs/intro.md');
      });

      it('handles inline links with titles', () => {
         const md = 'See [docs](docs/intro.md "the intro").';
         const { links } = parseMarkdown(md);
         expect(links[0].href).toBe('docs/intro.md');
      });
   });

   describe('extractTaskReferences', () => {
      it('maps JavaScript package-manager run commands to the JavaScript task surface', () => {
         const refs = extractTaskReferences('Run `npm run typo` and `pnpm run build`.');
         expect(refs.map((ref) => ({ runner: ref.runner, token: ref.token }))).toEqual([
            { runner: 'javascript', token: 'typo' },
            { runner: 'javascript', token: 'build' },
         ]);
      });

      it('does not treat common ecosystem built-ins as custom task references', () => {
         const refs = extractTaskReferences([
            'Use `mvn test`, `composer install`, and `./gradlew build`.',
            'Custom tasks are still checked: `composer qa`, `composer run lint`, `composer run audit`, `composer run-script install`, and `./gradlew releaseDocs`.',
         ].join('\n'));
         expect(refs.map((ref) => ({ runner: ref.runner, token: ref.token }))).toEqual([
            { runner: 'composer', token: 'qa' },
            { runner: 'composer', token: 'lint' },
            { runner: 'composer', token: 'audit' },
            { runner: 'composer', token: 'install' },
            { runner: 'gradle', token: 'releaseDocs' },
         ]);
      });
   });
});
