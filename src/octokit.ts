import { Octokit } from "@octokit/rest";

export function resolveToken(explicit?: string): string {
  const token = explicit || process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  if (!token) {
    throw new Error(
      "No token found. Set GITHUB_TOKEN / GH_TOKEN, pass --token, or run inside `gh` (which provides auth).",
    );
  }
  return token;
}

export function createOctokit(token: string, baseUrl?: string): Octokit {
  return new Octokit({
    auth: token,
    baseUrl: baseUrl || process.env.GITHUB_API_URL || undefined,
    userAgent: "gh-token-audit",
  });
}
