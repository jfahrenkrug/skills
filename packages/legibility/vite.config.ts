import { defineConfig } from 'vite';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync, writeFileSync, chmodSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));

const BANNER = [
   '#!/usr/bin/env node',
   '// GENERATED FILE — do not edit.',
   '// Source: packages/legibility/src/',
   '// Rebuild: cd packages/legibility && npm run build',
   '',
].join('\n');

const OUTPUT_PATH = resolve(__dirname, '../../skills/agentic-legibility/scripts/legibility.js');

const copyBundlePlugin = {
   name: 'copy-bundle',
   closeBundle() {
      const src = resolve(__dirname, 'dist/legibility.js');
      const content = readFileSync(src, 'utf8');
      writeFileSync(OUTPUT_PATH, BANNER + content, 'utf8');
      try { chmodSync(OUTPUT_PATH, 0o755); } catch (_) { /* ignore on platforms that don't support */ }
      console.log(`\n✓ Bundle written to ${OUTPUT_PATH}`);
   },
};

export default defineConfig({
   build: {
      lib: {
         entry: resolve(__dirname, 'src/legibility.ts'),
         formats: ['es'],
         fileName: 'legibility',
      },
      rollupOptions: {
         external: /^node:/u,
         output: {
            banner: '',
         },
      },
      target: 'node20',
      minify: false,
   },
   plugins: [copyBundlePlugin],
   test: {
      environment: 'node',
   },
});
