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

   it('scores zero guardrails when no hook mechanism is present', async () => {
      root = await makeFixtureRoot('al-no-guardrails-');
      await writeFile(root, 'README.md', '# hi\n');

      const report = await buildReport(root, [], [ 'guardrails_and_hooks' ], undefined);

      expect(report.metrics.guardrails_and_hooks.score).toBe(0);
   });
});
