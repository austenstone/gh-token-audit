import * as core from "@actions/core";
import { createOctokit } from "./octokit.js";
import { runAudit } from "./audit.js";
import { renderJson, renderMarkdown } from "./report.js";
import type { AuditOptions } from "./types.js";

function list(input: string): string[] {
  return input
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

async function main(): Promise<void> {
  const token = core.getInput("token") || process.env.GITHUB_TOKEN || "";
  if (!token) throw new Error("No token provided (input `token` or GITHUB_TOKEN).");

  const options: AuditOptions = {
    enterprise: core.getInput("enterprise") || undefined,
    orgs: list(core.getInput("org")),
    repos: list(core.getInput("repo")),
    includeArchived: core.getBooleanInput("include-archived"),
    maxRepos: core.getInput("max-repos") ? parseInt(core.getInput("max-repos"), 10) : undefined,
    onProgress: (m) => core.info(m),
  };

  if (!options.enterprise && options.orgs.length === 0 && options.repos.length === 0) {
    // Default to the current repository.
    const repo = process.env.GITHUB_REPOSITORY;
    if (repo) options.repos = [repo];
    else throw new Error("Specify `enterprise`, `org`, or `repo`.");
  }

  const octokit = createOctokit(token, core.getInput("api-url") || undefined);
  const report = await runAudit(octokit, options);
  const s = report.summary;

  core.setOutput("breaks", s.breaks);
  core.setOutput("review", s.review);
  core.setOutput("safe", s.safe);
  core.setOutput("explicit", s.explicit);
  core.setOutput("json", renderJson(report));

  await core.summary.addRaw(renderMarkdown(report)).write();

  core.info(`BREAKS=${s.breaks} REVIEW=${s.review} SAFE=${s.safe} EXPLICIT=${s.explicit}`);

  const failOn = core.getInput("fail-on") || "none";
  if (failOn === "breaks" && s.breaks > 0) core.setFailed(`${s.breaks} job(s) would break on read-only default.`);
  else if (failOn === "review" && s.breaks + s.review > 0)
    core.setFailed(`${s.breaks + s.review} job(s) need attention.`);
}

main().catch((err) => core.setFailed((err as Error).message));
