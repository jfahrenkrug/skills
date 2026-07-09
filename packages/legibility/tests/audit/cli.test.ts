import { describe, expect, it } from 'vitest';
import { parseCliArgs } from '../../src/audit_repo.js';

describe('parseCliArgs', () => {
   it('accepts --stale-threshold-days with a positive integer', () => {
      const args = parseCliArgs([ '--check-execplans', '--stale-threshold-days', '60', '.' ]);
      expect(args.staleThresholdDays).toBe(60);
      expect(args.checks).toEqual([ 'execplans' ]);
      expect(args.repo).toBe('.');
   });

   it('rejects --stale-threshold-days without a positive integer value', () => {
      expect(() => parseCliArgs([ '--check-execplans', '--stale-threshold-days', 'soon' ])).toThrow(/positive integer/u);
      expect(() => parseCliArgs([ '--check-execplans', '--stale-threshold-days', '0' ])).toThrow(/positive integer/u);
      expect(() => parseCliArgs([ '--check-execplans', '--stale-threshold-days' ])).toThrow(/positive integer/u);
   });

   it('still rejects unknown options', () => {
      expect(() => parseCliArgs([ '--check-all', '--bogus' ])).toThrow(/Unknown option/u);
   });
});
