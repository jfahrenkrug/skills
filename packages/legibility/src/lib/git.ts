import path from 'node:path';
import { promises as fs } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export async function isGitRepo(root: string): Promise<boolean> {
   try {
      await execFileAsync('git', [ 'rev-parse', '--is-inside-work-tree' ], {
         cwd: root,
      });
      return true;
   } catch (_error) {
      return false;
   }
}

export async function lastGitCommitTimestamp(root: string, relpath: string): Promise<number | null> {
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

export async function lastActivityTimestamp(root: string, relpath: string): Promise<number | null> {
   const gitTimestamp = await lastGitCommitTimestamp(root, relpath);
   if (gitTimestamp !== null) return gitTimestamp;

   try {
      const stat = await fs.stat(path.join(root, relpath));
      return Math.floor(stat.mtimeMs / 1000);
   } catch (_error) {
      return null;
   }
}
