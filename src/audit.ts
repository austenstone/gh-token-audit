import type { Octokit } from "@octokit/rest";
import type { AuditOptions, AuditReport, DefaultSetting, RepoFinding } from "./types.js";
import { analyzeWorkflow } from "./classify.js";
import {
  getEnterpriseDefault,
  getOrgDefault,
  getRepo,
  listOrgsForEnterprise,
  listReposForOrg,
  listWorkflowFiles,
} from "./enumerate.js";

export async function runAudit(octokit: Octokit, options: AuditOptions): Promise<AuditReport> {
  const log = options.onProgress ?? (() => {});
  const defaults: DefaultSetting[] = [];
  const orgs = new Set(options.orgs);

  if (options.enterprise) {
    log(`Resolving enterprise ${options.enterprise}…`);
    defaults.push(await getEnterpriseDefault(octokit, options.enterprise));
    for (const org of await listOrgsForEnterprise(octokit, options.enterprise)) orgs.add(org);
    log(`Found ${orgs.size} org(s) in enterprise.`);
  }

  const targets: Array<{ owner: string; repo: string; defaultBranch: string; archived: boolean }> = [];

  for (const org of orgs) {
    defaults.push(await getOrgDefault(octokit, org));
    log(`Listing repos in ${org}…`);
    const repos = await listReposForOrg(octokit, org, options.includeArchived);
    targets.push(...repos);
  }

  for (const spec of options.repos) {
    const [owner, repo] = spec.split("/");
    if (!owner || !repo) throw new Error(`Invalid --repo "${spec}", expected owner/repo`);
    if (!orgs.has(owner)) defaults.push(await getOrgDefault(octokit, owner));
    orgs.add(owner);
    targets.push(await getRepo(octokit, owner, repo));
  }

  const limited = options.maxRepos ? targets.slice(0, options.maxRepos) : targets;

  const repoFindings: RepoFinding[] = [];
  let processed = 0;
  for (const t of limited) {
    processed++;
    log(`[${processed}/${limited.length}] ${t.owner}/${t.repo}`);
    const files = await listWorkflowFiles(octokit, t.owner, t.repo, t.defaultBranch);
    if (files.length === 0) continue;
    repoFindings.push({
      owner: t.owner,
      repo: t.repo,
      defaultBranch: t.defaultBranch,
      archived: t.archived,
      workflows: files.map((f) => analyzeWorkflow(f.path, f.content)),
    });
  }

  const summary = { repos: repoFindings.length, workflows: 0, jobs: 0, breaks: 0, review: 0, safe: 0, explicit: 0 };
  for (const repo of repoFindings) {
    for (const wf of repo.workflows) {
      summary.workflows++;
      for (const job of wf.jobs) {
        summary.jobs++;
        if (job.classification === "BREAKS") summary.breaks++;
        else if (job.classification === "REVIEW") summary.review++;
        else if (job.classification === "SAFE") summary.safe++;
        else summary.explicit++;
      }
    }
  }

  const scope =
    options.enterprise ? `enterprise:${options.enterprise}` : options.orgs.length ? options.orgs.join(",") : options.repos.join(",");

  return {
    generatedAt: new Date().toISOString(),
    scope,
    defaults,
    repos: repoFindings,
    summary,
  };
}
