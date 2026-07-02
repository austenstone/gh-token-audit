// Curated heuristics for detecting GITHUB_TOKEN write usage via static analysis.
// Not exhaustive by design — the maps are meant to be extended over time.

/** Marketplace/first-party actions that write using the automatic token by default. */
export const KNOWN_WRITE_ACTIONS: Record<string, string[]> = {
  "softprops/action-gh-release": ["contents"],
  "ncipollo/release-action": ["contents"],
  "svenstaro/upload-release-action": ["contents"],
  "release-drafter/release-drafter": ["contents", "pull-requests"],
  "googleapis/release-please-action": ["contents", "pull-requests"],
  "google-github-actions/release-please-action": ["contents", "pull-requests"],
  "changesets/action": ["contents", "pull-requests"],
  "peter-evans/create-pull-request": ["contents", "pull-requests"],
  "peter-evans/create-or-update-comment": ["issues", "pull-requests"],
  "stefanzweifel/git-auto-commit-action": ["contents"],
  "EndBug/add-and-commit": ["contents"],
  "ad-m/github-push-action": ["contents"],
  "JamesIves/github-pages-deploy-action": ["contents"],
  "crazy-max/ghaction-github-pages": ["contents"],
  "peaceiris/actions-gh-pages": ["contents"],
  "actions/stale": ["issues", "pull-requests"],
  "actions/labeler": ["pull-requests"],
  "actions/deploy-pages": ["pages", "id-token"],
  "actions/attest-build-provenance": ["id-token", "attestations"],
  "github/codeql-action/analyze": ["security-events"],
  "github/codeql-action/upload-sarif": ["security-events"],
  "dorny/test-reporter": ["checks"],
  "mikepenz/action-junit-report": ["checks"],
  "EnricoMi/publish-unit-test-result-action": ["checks", "pull-requests"],
  "thollander/actions-comment-pull-request": ["pull-requests"],
  "marocchino/sticky-pull-request-comment": ["pull-requests"],
};

export interface RunPattern {
  pattern: RegExp;
  scopes: string[];
  label: string;
}

/** Write operations detectable inside `run:` steps (only counted when a token is in scope). */
export const RUN_WRITE_PATTERNS: RunPattern[] = [
  { pattern: /\bgh\s+release\s+(create|edit|delete|upload)/, scopes: ["contents"], label: "gh release write" },
  { pattern: /\bgh\s+pr\s+(create|edit|close|merge|comment|review|ready|reopen|lock)/, scopes: ["pull-requests"], label: "gh pr write" },
  { pattern: /\bgh\s+issue\s+(create|edit|close|comment|delete|reopen|lock|pin|unpin|transfer)/, scopes: ["issues"], label: "gh issue write" },
  { pattern: /\bgh\s+label\s+(create|edit|delete|clone)/, scopes: ["issues"], label: "gh label write" },
  { pattern: /\bgh\s+(workflow\s+(run|enable|disable)|run\s+(rerun|cancel|delete)|cache\s+delete)/, scopes: ["actions"], label: "gh actions write" },
  { pattern: /\bgh\s+api\b[^\n]*(--method\s+|(-X|--request)\s+)(POST|PUT|PATCH|DELETE)/i, scopes: ["unknown (gh api write)"], label: "gh api write verb" },
  { pattern: /\bgit\s+push\b/, scopes: ["contents"], label: "git push" },
  { pattern: /\bnpm\s+publish\b/, scopes: ["packages"], label: "npm publish" },
  { pattern: /\bdocker\s+push\s+ghcr\.io/, scopes: ["packages"], label: "docker push ghcr" },
];

/** Signals that a run/env block has the automatic token available. */
export const TOKEN_ENV_KEYS = ["GITHUB_TOKEN", "GH_TOKEN"];
export const TOKEN_REFERENCE = /github\.token|secrets\.GITHUB_TOKEN/;

/** Strip a `uses:` value to `owner/repo` (drop subpath and @ref). */
export function normalizeActionRef(uses: string): string {
  const noRef = uses.split("@")[0] ?? uses;
  const parts = noRef.split("/");
  if (parts.length <= 2) return noRef;
  return `${parts[0]}/${parts[1]}`;
}

/** Some actions live under a subpath (e.g. github/codeql-action/analyze); match those too. */
export function matchKnownAction(uses: string): string[] | undefined {
  const noRef = uses.split("@")[0] ?? uses;
  if (KNOWN_WRITE_ACTIONS[noRef]) return KNOWN_WRITE_ACTIONS[noRef];
  return KNOWN_WRITE_ACTIONS[normalizeActionRef(uses)];
}
