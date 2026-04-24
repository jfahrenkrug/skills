export type Severity = 'error' | 'warning' | 'info';

export interface Finding {
   severity: Severity;
   path: string;
   line?: number | null;
   message: string;
   remediation: string;
}

export type CheckStatus = 'ok' | 'drift';

export interface CheckResult {
   check: string;
   status: CheckStatus;
   findings: Finding[];
   summary: string;
}

export interface AuditReport {
   repo: string;
   status: CheckStatus;
   checks: Record<string, CheckResult>;
}

export const SEVERITY_ERROR: Severity = 'error';
export const SEVERITY_WARNING: Severity = 'warning';
export const SEVERITY_INFO: Severity = 'info';

export function finding(
   severity: Severity,
   pathValue: string,
   message: string,
   remediation: string,
   line: number | null = null,
): Finding {
   return {
      severity,
      path: pathValue,
      line,
      message,
      remediation,
   };
}

export function checkResult(name: string, findings: Finding[], summary: string): CheckResult {
   const hasError = findings.some((f) => f.severity === SEVERITY_ERROR);
   return {
      check: name,
      status: hasError ? 'drift' : 'ok',
      findings,
      summary,
   };
}

export function auditReport(repo: string, checks: Record<string, CheckResult>): AuditReport {
   const results = Object.values(checks);
   const hasDrift = results.some((r) => r.status === 'drift');
   return {
      repo,
      status: hasDrift ? 'drift' : 'ok',
      checks,
   };
}

export function formatJson(report: AuditReport): string {
   return JSON.stringify(report, null, 2);
}

function renderFindingsList(findings: Finding[]): string[] {
   if (findings.length === 0) {
      return [ '_No findings._' ];
   }

   const lines: string[] = [];

   for (const item of findings) {
      const location = item.line ? `${item.path}:${item.line}` : item.path;
      lines.push(`- **${item.severity.toUpperCase()}** \`${location}\` — ${item.message}`);
      if (item.remediation) {
         lines.push(`  - Fix: ${item.remediation}`);
      }
   }

   return lines;
}

export function formatAuditMarkdown(report: AuditReport): string {
   const lines = [
      '# Agentic Legibility Audit',
      '',
      `- Repository: \`${report.repo}\``,
      `- Status: **${report.status.toUpperCase()}**`,
      '',
   ];

   for (const [ name, result ] of Object.entries(report.checks)) {
      lines.push(`## ${name}`);
      lines.push('');
      lines.push(`Status: **${result.status.toUpperCase()}** — ${result.summary}`);
      lines.push('');
      lines.push(...renderFindingsList(result.findings));
      lines.push('');
   }

   return lines.join('\n');
}

export function formatSingleCheckJson(result: CheckResult): string {
   return JSON.stringify(result, null, 2);
}

export function formatSingleCheckMarkdown(result: CheckResult): string {
   const lines = [
      `# Check: ${result.check}`,
      '',
      `Status: **${result.status.toUpperCase()}** — ${result.summary}`,
      '',
      ...renderFindingsList(result.findings),
   ];
   return lines.join('\n');
}
