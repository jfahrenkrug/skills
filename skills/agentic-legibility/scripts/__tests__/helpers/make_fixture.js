// Helpers for building temporary fixture repos in tests.
//
// Each helper returns an absolute path to a brand-new temp directory.  Callers
// are responsible for calling `cleanup(dir)` in their `after` hook.  Fixtures
// never share state; each test gets its own isolated tree.

import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export async function makeFixtureRoot(prefix = 'al-fixture-') {
   return await fs.mkdtemp(path.join(os.tmpdir(), prefix));
}

export async function cleanup(dir) {
   if (!dir) return;
   await fs.rm(dir, { recursive: true, force: true });
}

export async function writeFile(root, relpath, contents) {
   const abs = path.join(root, relpath);
   await fs.mkdir(path.dirname(abs), { recursive: true });
   await fs.writeFile(abs, contents);
   return abs;
}

export async function mkdir(root, relpath) {
   const abs = path.join(root, relpath);
   await fs.mkdir(abs, { recursive: true });
   return abs;
}

/**
 * Builds a repository with every required legibility artifact present.  Useful
 * as a baseline that each test can then partially degrade to simulate drift.
 */
export async function makeFullyLegibleRepo() {
   const root = await makeFixtureRoot('al-legible-');
   await writeFile(root, 'AGENTS.md', '# Agents\n\nShort map.\n');
   await writeFile(root, 'CLAUDE.md', '@AGENTS.md\n');
   await writeFile(root, '.agents/PLANS.md', '# ExecPlans spec\n');
   await writeFile(root, 'docs/README.md', '# Docs\n');
   await mkdir(root, 'docs/exec-plans/active');
   await mkdir(root, 'docs/exec-plans/completed');
   return root;
}

/**
 * Builds a bare repository with no legibility infrastructure.
 */
export async function makeBareRepo() {
   const root = await makeFixtureRoot('al-bare-');
   await writeFile(root, 'README.md', '# A repo\n');
   return root;
}

/**
 * Spawns a child process running the given node script with the given args.
 * Returns { status, stdout, stderr }.  Does not throw on non-zero exit so
 * callers can assert on the exit code directly.
 */
export async function runNode(scriptPath, args, options = {}) {
   const { spawn } = await import('node:child_process');
   return await new Promise((resolve) => {
      const child = spawn(process.execPath, [ scriptPath, ...args ], {
         cwd: options.cwd,
         env: { ...process.env, ...(options.env || {}) },
      });
      let stdout = '';
      let stderr = '';
      child.stdout.on('data', (chunk) => { stdout += chunk.toString('utf8'); });
      child.stderr.on('data', (chunk) => { stderr += chunk.toString('utf8'); });
      child.on('close', (status) => {
         resolve({ status: status ?? 0, stdout, stderr });
      });
   });
}
