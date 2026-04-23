// Shared shapes and helpers for audit-check output.
//
// Every audit check returns a CheckResult and contributes to an aggregate
// AuditReport.  A single Finding describes one thing wrong in the repository,
// with enough detail (severity, path, optional line number, short message, and
// an imperative remediation) for an agent to act on without re-deriving what
// the problem is.

/**
 * @typedef {"error"|"warning"|"info"} Severity
 * @typedef {Object} Finding
 * @property {Severity} severity
 * @property {string} path          // repo-relative path the finding is anchored to
 * @property {number|null} [line]   // optional 1-based line number
 * @property {string} message
 * @property {string} remediation
 *
 * @typedef {"ok"|"drift"} CheckStatus
 * @typedef {Object} CheckResult
 * @property {string} check
 * @property {CheckStatus} status
 * @property {Finding[]} findings
 * @property {string} summary
 *
 * @typedef {Object} AuditReport
 * @property {string} repo
 * @property {CheckStatus} status
 * @property {Record<string, CheckResult>} checks
 */

export const SEVERITY_ERROR = 'error';
export const SEVERITY_WARNING = 'warning';
export const SEVERITY_INFO = 'info';

export function finding(severity, pathValue, message, remediation, line = null) {
   return {
      severity,
      path: pathValue,
      line,
      message,
      remediation,
   };
}

export function checkResult(name, findings, summary) {
   const hasError = findings.some((f) => f.severity === SEVERITY_ERROR);
   return {
      check: name,
      status: hasError ? 'drift' : 'ok',
      findings,
      summary,
   };
}

export function auditReport(repo, checks) {
   const results = Object.values(checks);
   const hasDrift = results.some((r) => r.status === 'drift');
   return {
      repo,
      status: hasDrift ? 'drift' : 'ok',
      checks,
   };
}

export function formatJson(report) {
   return JSON.stringify(report, null, 2);
}

function renderFindingsList(findings) {
   if (findings.length === 0) {
      return [ '_No findings._' ];
   }

   const lines = [];

   for (const item of findings) {
      const location = item.line ? `${item.path}:${item.line}` : item.path;
      lines.push(`- **${item.severity.toUpperCase()}** \`${location}\` — ${item.message}`);
      if (item.remediation) {
         lines.push(`  - Fix: ${item.remediation}`);
      }
   }

   return lines;
}

export function formatAuditMarkdown(report) {
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

export function formatSingleCheckJson(result) {
   return JSON.stringify(result, null, 2);
}

export function formatSingleCheckMarkdown(result) {
   const lines = [
      `# Check: ${result.check}`,
      '',
      `Status: **${result.status.toUpperCase()}** — ${result.summary}`,
      '',
      ...renderFindingsList(result.findings),
   ];
   return lines.join('\n');
}
