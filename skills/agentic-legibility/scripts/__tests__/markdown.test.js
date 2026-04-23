import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
   parseMarkdown,
   toAnchor,
   isExternalHref,
   splitHref,
   resolveReference,
} from '../lib/markdown.js';

describe('markdown', () => {
   describe('toAnchor', () => {
      it('lowercases and replaces spaces with hyphens', () => {
         assert.equal(toAnchor('Hello World'), 'hello-world');
      });

      it('strips punctuation other than hyphens and underscores', () => {
         assert.equal(toAnchor('Foo, Bar!'), 'foo-bar');
      });

      it('keeps unicode letters', () => {
         assert.equal(toAnchor('Über Café'), 'über-café');
      });

      it('collapses multiple whitespace into a single hyphen', () => {
         assert.equal(toAnchor('A   B'), 'a-b');
      });

      it('strips common emphasis and inline code markers', () => {
         assert.equal(toAnchor('**bold** `code`'), 'bold-code');
      });

      it('strips Markdown link wrappers but keeps the link text', () => {
         assert.equal(toAnchor('See [docs](/docs/) for more'), 'see-docs-for-more');
      });
   });

   describe('isExternalHref', () => {
      it('returns true for http/https/mailto', () => {
         assert.equal(isExternalHref('https://example.com'), true);
         assert.equal(isExternalHref('http://x.y'), true);
         assert.equal(isExternalHref('mailto:a@b.com'), true);
      });

      it('returns false for relative paths and anchors', () => {
         assert.equal(isExternalHref('docs/intro.md'), false);
         assert.equal(isExternalHref('./foo.md'), false);
         assert.equal(isExternalHref('#heading'), false);
      });
   });

   describe('splitHref', () => {
      it('splits a path-with-anchor into target and anchor', () => {
         assert.deepEqual(splitHref('docs/intro.md#setup'), { target: 'docs/intro.md', anchor: 'setup' });
      });

      it('handles anchor-only hrefs', () => {
         assert.deepEqual(splitHref('#setup'), { target: null, anchor: 'setup' });
      });

      it('handles hrefs without anchors', () => {
         assert.deepEqual(splitHref('docs/intro.md'), { target: 'docs/intro.md', anchor: null });
      });
   });

   describe('parseMarkdown: headings', () => {
      it('extracts heading text, level, line number, and anchor', () => {
         const md = [ '# Top', '', '## Sub Heading', '', '### Deep' ].join('\n');
         const { headings } = parseMarkdown(md);
         assert.equal(headings.length, 3);
         assert.deepEqual(headings[0], { text: 'Top', level: 1, line: 1, anchor: 'top' });
         assert.deepEqual(headings[1], { text: 'Sub Heading', level: 2, line: 3, anchor: 'sub-heading' });
         assert.deepEqual(headings[2], { text: 'Deep', level: 3, line: 5, anchor: 'deep' });
      });

      it('disambiguates duplicate anchors with numeric suffix', () => {
         const md = [ '# Foo', '## Foo', '### Foo' ].join('\n');
         const { headings } = parseMarkdown(md);
         assert.deepEqual(headings.map((h) => h.anchor), [ 'foo', 'foo-1', 'foo-2' ]);
      });
   });

   describe('parseMarkdown: links', () => {
      it('extracts inline links', () => {
         const md = 'See [docs](docs/intro.md) and [home](../README.md).';
         const { links } = parseMarkdown(md);
         assert.equal(links.length, 2);
         assert.deepEqual(links[0], { href: 'docs/intro.md', text: 'docs', line: 1, kind: 'inline' });
         assert.deepEqual(links[1], { href: '../README.md', text: 'home', line: 1, kind: 'inline' });
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
         assert.deepEqual(codeBlockRanges, [[ 2, 4 ]]);
         assert.deepEqual(links.map((l) => l.href).sort(), [ 'r2.md', 'real.md' ]);
      });

      it('ignores links inside inline code spans', () => {
         const md = 'Talk about `[ignored](oops.md)` but use [real](real.md).';
         const { links } = parseMarkdown(md);
         assert.equal(links.length, 1);
         assert.equal(links[0].href, 'real.md');
      });

      it('extracts reference definitions and reference links', () => {
         const md = [
            'See [docs][intro].',
            '',
            '[intro]: docs/intro.md',
         ].join('\n');
         const { links, referenceDefinitions } = parseMarkdown(md);
         assert.equal(referenceDefinitions.get('intro'), 'docs/intro.md');
         assert.equal(links.length, 1);
         assert.equal(links[0].kind, 'reference');
         const resolved = resolveReference(links[0], referenceDefinitions);
         assert.equal(resolved, 'docs/intro.md');
      });

      it('handles inline links with titles', () => {
         const md = 'See [docs](docs/intro.md "the intro").';
         const { links } = parseMarkdown(md);
         assert.equal(links[0].href, 'docs/intro.md');
      });
   });
});
