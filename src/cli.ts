import { Command } from "commander";
import { writeFileSync } from "node:fs";
import { createOctokit, resolveToken } from "./octokit.js";
import { runAudit } from "./audit.js";
import { renderCsv, renderJson, renderMarkdown } from "./report.js";
import type { AuditOptions } from "./types.js";

const program = new Command();

program
  .name("gh-token-audit")
  .description(
    "Statically audit GITHUB_TOKEN permissions across an Enterprise/org and find workflows that\n" +
      "would break if the default token permission is flipped to read-only.",
  )
  .option("-e, --enterprise <slug>", "Enterprise slug (enumerates all orgs)")
  .option("-o, --org <org...>", "Organization(s) to audit", [])
  .option("-r, --repo <owner/repo...>", "Specific repo(s) to audit", [])
  .option("--include-archived", "Include archived repositories", false)
  .option("--max-repos <n>", "Cap number of repos (useful for a quick sample)", (v) => parseInt(v, 10))
  .option("-f, --format <format>", "Output format: markdown | json | csv", "markdown")
  .option("--out <file>", "Write output to a file instead of stdout")
  .option("--token <token>", "Token (defaults to GITHUB_TOKEN / GH_TOKEN)")
  .option("--api-url <url>", "GitHub API base URL (for GHES)")
  .option("-q, --quiet", "Suppress progress output", false);

program.parse();
const opts = program.opts();

if (!opts.enterprise && opts.org.length === 0 && opts.repo.length === 0) {
  console.error("Error: specify at least one of --enterprise, --org, or --repo.\n");
  program.help({ error: true });
}

const auditOptions: AuditOptions = {
  enterprise: opts.enterprise,
  orgs: opts.org,
  repos: opts.repo,
  includeArchived: opts.includeArchived,
  maxRepos: opts.maxRepos,
  onProgress: opts.quiet ? undefined : (m) => process.stderr.write(`${m}\n`),
};

try {
  const octokit = createOctokit(resolveToken(opts.token), opts.apiUrl);
  const report = await runAudit(octokit, auditOptions);

  const output =
    opts.format === "json" ? renderJson(report) : opts.format === "csv" ? renderCsv(report) : renderMarkdown(report);

  if (opts.out) {
    writeFileSync(opts.out, output);
    process.stderr.write(`Wrote ${opts.out}\n`);
  } else {
    process.stdout.write(output + "\n");
  }

  if (report.summary.breaks > 0) process.exitCode = 1;
} catch (err) {
  console.error(`\n✖ ${(err as Error).message}`);
  process.exit(2);
}
