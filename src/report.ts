import type { AuditReport } from "./types.js";

export function renderJson(report: AuditReport): string {
  return JSON.stringify(report, null, 2);
}

export function renderCsv(report: AuditReport): string {
  const rows: string[] = ["owner,repo,workflow,job,classification,permission_source,detected_scopes"];
  for (const repo of report.repos) {
    for (const wf of repo.workflows) {
      for (const job of wf.jobs) {
        const scopes = [...new Set(job.detectedWrites.map((d) => d.scope))].join("|");
        rows.push(
          [repo.owner, repo.repo, wf.path, job.jobId, job.classification, job.permissionSource, scopes]
            .map((v) => `"${String(v).replace(/"/g, '""')}"`)
            .join(","),
        );
      }
    }
  }
  return rows.join("\n");
}

export function renderMarkdown(report: AuditReport): string {
  const s = report.summary;
  const lines: string[] = [];
  lines.push(`# GITHUB_TOKEN permissions audit`);
  lines.push("");
  lines.push(`Scope: \`${report.scope}\` · generated ${report.generatedAt}`);
  lines.push("");

  lines.push(`## Current default settings`);
  lines.push("");
  lines.push(`| Scope | Name | Default token perms | Can approve PRs |`);
  lines.push(`| --- | --- | --- | --- |`);
  for (const d of report.defaults) {
    const perms = d.error ? `⚠️ ${d.error}` : (d.defaultWorkflowPermissions ?? "?");
    const flag = perms === "write" ? "⚠️ permissive" : perms === "read" ? "✅ read-only" : perms;
    lines.push(`| ${d.scope} | ${d.name} | ${flag} | ${d.canApprovePullRequestReviews ?? "?"} |`);
  }
  lines.push("");

  lines.push(`## Summary`);
  lines.push("");
  lines.push(`- Repos with workflows: **${s.repos}** · Workflows: **${s.workflows}** · Jobs: **${s.jobs}**`);
  lines.push(`- 🔴 **BREAKS** (no \`permissions\`, writes detected): **${s.breaks}**`);
  lines.push(`- 🟡 **REVIEW** (no \`permissions\`, uses token, unclassified): **${s.review}**`);
  lines.push(`- 🟢 **SAFE** (no \`permissions\`, read-only): **${s.safe}**`);
  lines.push(`- ⚪ **EXPLICIT** (has \`permissions\`, unaffected by flip): **${s.explicit}**`);
  lines.push("");

  const risky = report.repos
    .flatMap((repo) =>
      repo.workflows.flatMap((wf) =>
        wf.jobs
          .filter((j) => j.classification === "BREAKS" || j.classification === "REVIEW")
          .map((j) => ({ repo, wf, j })),
      ),
    )
    .sort((a, b) => (a.j.classification === "BREAKS" ? -1 : 1));

  if (risky.length > 0) {
    lines.push(`## Action required (${risky.length})`);
    lines.push("");
    lines.push(`| Repo | Workflow | Job | Class | Detected writes |`);
    lines.push(`| --- | --- | --- | --- | --- |`);
    for (const { repo, wf, j } of risky) {
      const icon = j.classification === "BREAKS" ? "🔴" : "🟡";
      const writes = [...new Set(j.detectedWrites.map((d) => `${d.scope} (${d.reason})`))].join("<br>") || "—";
      lines.push(
        `| ${repo.owner}/${repo.repo} | \`${wf.path.replace(".github/workflows/", "")}\` | \`${j.jobId}\` | ${icon} ${j.classification} | ${writes} |`,
      );
    }
    lines.push("");
  }

  const parseErrors = report.repos.flatMap((repo) =>
    repo.workflows.filter((w) => w.parseError).map((w) => `${repo.owner}/${repo.repo}:${w.path} — ${w.parseError}`),
  );
  if (parseErrors.length) {
    lines.push(`## Parse errors (${parseErrors.length})`);
    lines.push("");
    for (const e of parseErrors) lines.push(`- ${e}`);
    lines.push("");
  }

  lines.push(`---`);
  lines.push(
    `Static heuristic audit. **BREAKS** = high confidence. **REVIEW** = token used but write couldn't be classified (verify manually or run the [GitHubSecurityLab monitor](https://github.com/GitHubSecurityLab/actions-permissions)). Migration path: add explicit \`permissions:\` blocks preserving current behavior, then flip the default to read-only (explicit always wins).`,
  );
  return lines.join("\n");
}
