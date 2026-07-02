import type { Octokit } from "@octokit/rest";
import type { DefaultSetting } from "./types.js";

export async function listOrgsForEnterprise(octokit: Octokit, enterprise: string): Promise<string[]> {
  const orgs: string[] = [];
  let cursor: string | null = null;
  const query = `query($slug:String!,$cursor:String){
    enterprise(slug:$slug){
      organizations(first:100, after:$cursor){
        nodes{ login }
        pageInfo{ hasNextPage endCursor }
      }
    }
  }`;
  // Paginate manually.
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const res: any = await octokit.graphql(query, { slug: enterprise, cursor });
    const conn = res?.enterprise?.organizations;
    if (!conn) break;
    for (const node of conn.nodes ?? []) if (node?.login) orgs.push(node.login);
    if (!conn.pageInfo?.hasNextPage) break;
    cursor = conn.pageInfo.endCursor;
  }
  return orgs;
}

export async function listReposForOrg(
  octokit: Octokit,
  org: string,
  includeArchived: boolean,
): Promise<Array<{ owner: string; repo: string; defaultBranch: string; archived: boolean }>> {
  const repos = await octokit.paginate(octokit.repos.listForOrg, {
    org,
    per_page: 100,
    type: "all",
  });
  return repos
    .filter((r) => includeArchived || !r.archived)
    .map((r) => ({
      owner: r.owner.login,
      repo: r.name,
      defaultBranch: r.default_branch ?? "main",
      archived: Boolean(r.archived),
    }));
}

export async function getRepo(
  octokit: Octokit,
  owner: string,
  repo: string,
): Promise<{ owner: string; repo: string; defaultBranch: string; archived: boolean }> {
  const { data } = await octokit.repos.get({ owner, repo });
  return {
    owner: data.owner.login,
    repo: data.name,
    defaultBranch: data.default_branch ?? "main",
    archived: Boolean(data.archived),
  };
}

export async function getEnterpriseDefault(octokit: Octokit, enterprise: string): Promise<DefaultSetting> {
  try {
    const { data } = await octokit.request(
      "GET /enterprises/{enterprise}/actions/permissions/workflow",
      { enterprise },
    );
    return {
      scope: "enterprise",
      name: enterprise,
      defaultWorkflowPermissions: data.default_workflow_permissions,
      canApprovePullRequestReviews: data.can_approve_pull_request_reviews,
    };
  } catch (err) {
    return { scope: "enterprise", name: enterprise, error: cleanError(err) };
  }
}

export async function getOrgDefault(octokit: Octokit, org: string): Promise<DefaultSetting> {
  try {
    const { data } = await octokit.request("GET /orgs/{org}/actions/permissions/workflow", { org });
    return {
      scope: "organization",
      name: org,
      defaultWorkflowPermissions: data.default_workflow_permissions,
      canApprovePullRequestReviews: data.can_approve_pull_request_reviews,
    };
  } catch (err) {
    return { scope: "organization", name: org, error: cleanError(err) };
  }
}

function cleanError(err: unknown): string {
  const status = (err as { status?: number }).status;
  if (status === 404) return "not readable (needs org/enterprise admin token)";
  if (status === 403) return "forbidden (token lacks permission)";
  return (err as Error).message.split(" - ")[0] ?? "error";
}

export async function listWorkflowFiles(
  octokit: Octokit,
  owner: string,
  repo: string,
  ref: string,
): Promise<Array<{ path: string; content: string }>> {
  let entries: any[];
  try {
    const { data } = await octokit.repos.getContent({
      owner,
      repo,
      path: ".github/workflows",
      ref,
    });
    entries = Array.isArray(data) ? data : [];
  } catch (err) {
    if ((err as { status?: number }).status === 404) return [];
    throw err;
  }

  const files = entries.filter(
    (e) => e.type === "file" && /\.ya?ml$/.test(e.name),
  );

  const results: Array<{ path: string; content: string }> = [];
  for (const file of files) {
    try {
      const { data } = await octokit.repos.getContent({ owner, repo, path: file.path, ref });
      if (!Array.isArray(data) && "content" in data && data.content) {
        const content = Buffer.from(data.content, "base64").toString("utf8");
        results.push({ path: file.path, content });
      }
    } catch {
      // Skip unreadable files.
    }
  }
  return results;
}
