import { describe, it, afterEach } from 'vitest';
import { expect } from 'vitest';

import { buildReport } from '../src/score_repo.js';
import { cleanup, makeFixtureRoot, writeFile } from './helpers/make_fixture.js';

describe('score_repo', () => {
   let root: string | undefined;

   afterEach(async () => {
      await cleanup(root);
      root = undefined;
   });

   it('detects .claude/hooks/ as an agent-hooks guardrail signal even though .claude/ is excluded from the walk', async () => {
      root = await makeFixtureRoot('al-guardrails-');
      await writeFile(root, '.claude/hooks/pre_tool_use.sh', '#!/bin/sh\necho guard\n');

      const report = await buildReport(root, [], [ 'guardrails_and_hooks' ], undefined);

      expect(report.metrics.guardrails_and_hooks.score).toBeGreaterThan(0);
      expect(report.metrics.guardrails_and_hooks.evidence).toContain('.claude/hooks/pre_tool_use.sh');
   });

   it('honors --exclude for .claude/hooks/ when scoring guardrails', async () => {
      root = await makeFixtureRoot('al-guardrails-excluded-');
      await writeFile(root, '.claude/hooks/pre_tool_use.sh', '#!/bin/sh\necho guard\n');

      const report = await buildReport(root, [ '.claude/hooks' ], [ 'guardrails_and_hooks' ], undefined);

      expect(report.metrics.guardrails_and_hooks.score).toBe(0);
      expect(report.metrics.guardrails_and_hooks.evidence).toEqual([]);
   });

   it('skips dependency dirs inside .claude/hooks/ and reports hook files sorted', async () => {
      root = await makeFixtureRoot('al-guardrails-deps-');
      await writeFile(root, '.claude/hooks/post_tool_use.sh', '#!/bin/sh\necho b\n');
      await writeFile(root, '.claude/hooks/pre_tool_use.sh', '#!/bin/sh\necho a\n');
      await writeFile(root, '.claude/hooks/node_modules/dep/index.js', '// dep\n');

      const report = await buildReport(root, [], [ 'guardrails_and_hooks' ], undefined);
      const { evidence } = report.metrics.guardrails_and_hooks;

      expect(evidence).toEqual([ '.claude/hooks/post_tool_use.sh', '.claude/hooks/pre_tool_use.sh' ]);
   });

   it('keeps compiled hook entrypoints under .claude/hooks/dist/', async () => {
      root = await makeFixtureRoot('al-guardrails-dist-');
      await writeFile(root, '.claude/hooks/dist/pre_tool_use.js', '// compiled hook\n');

      const report = await buildReport(root, [], [ 'guardrails_and_hooks' ], undefined);

      expect(report.metrics.guardrails_and_hooks.score).toBeGreaterThan(0);
      expect(report.metrics.guardrails_and_hooks.evidence).toContain('.claude/hooks/dist/pre_tool_use.js');
   });

   it('honors a root-relative --exclude in a scoped run', async () => {
      root = await makeFixtureRoot('al-guardrails-scoped-');
      await writeFile(root, 'packages/app/package.json', '{"name":"app"}\n');
      await writeFile(root, 'packages/app/.claude/hooks/pre_tool_use.sh', '#!/bin/sh\necho guard\n');

      const report = await buildReport(
         root,
         [ 'packages/app/.claude/hooks' ],
         [ 'guardrails_and_hooks' ],
         'packages/app',
      );

      expect(report.evaluated_scope).toBe('packages/app');
      expect(report.metrics.guardrails_and_hooks.score).toBe(0);
      expect(report.metrics.guardrails_and_hooks.evidence).toEqual([]);
   });

   it('scores zero guardrails when no hook mechanism is present', async () => {
      root = await makeFixtureRoot('al-no-guardrails-');
      await writeFile(root, 'README.md', '# hi\n');

      const report = await buildReport(root, [], [ 'guardrails_and_hooks' ], undefined);

      expect(report.metrics.guardrails_and_hooks.score).toBe(0);
   });
});
