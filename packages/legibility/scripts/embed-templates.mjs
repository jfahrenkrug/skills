#!/usr/bin/env node
// Embeds skills/agentic-legibility/PLANS.md into
// packages/legibility/src/init/plans_template.ts so the bundle stays
// single-file and zero-dep at runtime.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../../..');
const sourcePath = resolve(repoRoot, 'skills/agentic-legibility/PLANS.md');
const targetPath = resolve(here, '../src/init/plans_template.ts');

const plansSource = readFileSync(sourcePath, 'utf8');

const banner = [
   '// GENERATED FILE — do not edit.',
   '// Source: skills/agentic-legibility/PLANS.md',
   '// Regenerate: cd packages/legibility && node scripts/embed-templates.mjs',
   '',
].join('\n');

const literal = JSON.stringify(plansSource);

const body = `${banner}export const PLANS_TEMPLATE: string = ${literal};\n`;

mkdirSync(dirname(targetPath), { recursive: true });
writeFileSync(targetPath, body, 'utf8');

console.log(`✓ Wrote ${targetPath} (${plansSource.length} chars from PLANS.md)`);
