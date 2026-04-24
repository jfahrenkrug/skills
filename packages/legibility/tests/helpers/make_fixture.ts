import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export async function makeFixtureRoot(prefix = 'al-fixture-'): Promise<string> {
   return await fs.mkdtemp(path.join(os.tmpdir(), prefix));
}

export async function cleanup(dir: string | undefined): Promise<void> {
   if (!dir) return;
   await fs.rm(dir, { recursive: true, force: true });
}

export async function writeFile(root: string, relpath: string, contents: string): Promise<string> {
   const abs = path.join(root, relpath);
   await fs.mkdir(path.dirname(abs), { recursive: true });
   await fs.writeFile(abs, contents);
   return abs;
}

export async function mkdir(root: string, relpath: string): Promise<string> {
   const abs = path.join(root, relpath);
   await fs.mkdir(abs, { recursive: true });
   return abs;
}

export async function makeFullyLegibleRepo(): Promise<string> {
   const root = await makeFixtureRoot('al-legible-');
   await writeFile(root, 'AGENTS.md', '# Agents\n\nShort map.\n');
   await writeFile(root, 'CLAUDE.md', '@AGENTS.md\n');
   await writeFile(root, '.agents/PLANS.md', '# ExecPlans spec\n');
   await writeFile(root, 'docs/README.md', '# Docs\n');
   await mkdir(root, 'docs/exec-plans/active');
   await mkdir(root, 'docs/exec-plans/completed');
   return root;
}

export async function makeBareRepo(): Promise<string> {
   const root = await makeFixtureRoot('al-bare-');
   await writeFile(root, 'README.md', '# A repo\n');
   return root;
}

export interface RunNodeResult {
   status: number;
   stdout: string;
   stderr: string;
}

export async function runNode(
   scriptPath: string,
   args: string[],
   options: { cwd?: string; env?: Record<string, string> } = {},
): Promise<RunNodeResult> {
   const { spawn } = await import('node:child_process');
   return await new Promise((resolve) => {
      const child = spawn(process.execPath, [ scriptPath, ...args ], {
         cwd: options.cwd,
         env: { ...process.env, ...(options.env || {}) },
      });
      let stdout = '';
      let stderr = '';
      child.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString('utf8'); });
      child.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString('utf8'); });
      child.on('close', (status: number | null) => {
         resolve({ status: status ?? 0, stdout, stderr });
      });
   });
}
