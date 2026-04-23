// Tiny wrapper around `git log` for extracting per-file commit timestamps.
//
// The audit `--check-execplans` uses this to compute staleness: if an active
// ExecPlan has not been touched in N days, flag it.  We prefer git's
// committer timestamp over filesystem mtime because `git clone` resets every
// file's mtime to the clone time, which would break staleness detection on
// freshly-cloned repos.  When the target is not in a git working tree (or
// the file is untracked), we fall back to filesystem mtime.

import path from 'node:path';
import { promises as fs } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

/**
 * Returns true if `root` is inside a git working tree.
 */
export async function isGitRepo(root) {
   try {
      await execFileAsync('git', [ 'rev-parse', '--is-inside-work-tree' ], {
         cwd: root,
      });
      return true;
   } catch (_error) {
      return false;
   }
}

/**
 * Returns the last commit committer-timestamp (Unix seconds) for `relpath`
 * within `root`, or null when the file is untracked or `root` is not a git
 * working tree.
 */
export async function lastGitCommitTimestamp(root, relpath) {
   try {
      const { stdout } = await execFileAsync(
         'git',
         [ 'log', '-1', '--format=%ct', '--', relpath ],
         { cwd: root },
      );
      const trimmed = stdout.trim();
      if (!trimmed) return null;
      const parsed = Number.parseInt(trimmed, 10);
      return Number.isFinite(parsed) ? parsed : null;
   } catch (_error) {
      return null;
   }
}

/**
 * Returns the last modification time of `relpath` inside `root` as Unix
 * seconds.  Prefers git's committer timestamp and falls back to filesystem
 * mtime when git metadata is unavailable.
 */
export async function lastActivityTimestamp(root, relpath) {
   const gitTimestamp = await lastGitCommitTimestamp(root, relpath);
   if (gitTimestamp !== null) return gitTimestamp;

   try {
      const stat = await fs.stat(path.join(root, relpath));
      return Math.floor(stat.mtimeMs / 1000);
   } catch (_error) {
      return null;
   }
}
