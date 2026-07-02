# gh-token-audit

Statically audit `GITHUB_TOKEN` permissions across a repo, org, or entire Enterprise, and find the workflows that will **break** when you flip the default token permission from read/write to **read-only**.

## Why

GitHub recommends setting the default `GITHUB_TOKEN` permission to read-only. But if you flip that switch enterprise-wide, every workflow job **without** an explicit `permissions:` block silently loses the write access it was implicitly inheriting, and breaks.

- Jobs **with** a `permissions:` block always win, so they're unaffected by the flip.
- Jobs **without** one inherit the org/enterprise default, so they're the risk.
- A code search for `permissions:` only finds the already-safe workflows. It can't find what's at risk.

Runtime monitors like [GitHubSecurityLab/actions-permissions](https://github.com/GitHubSecurityLab/actions-permissions) are accurate but require injecting a step into every job and re-running everything. This tool does a **static, enterprise-wide** pass with no workflow changes.

## What it does

Enumerates repos (enterprise → orgs → repos, or `--org` / `--repo`), parses every workflow, resolves the effective per-job permissions, and classifies each job:

| Class | Meaning |
| --- | --- |
| ⚪ **EXPLICIT** | Has a `permissions:` block. Unaffected by the flip. |
| 🔴 **BREAKS** | No block + a high-confidence write detected (known write-action or write pattern). |
| 🟡 **REVIEW** | No block + uses the token but the write couldn't be classified. Verify manually. |
| 🟢 **SAFE** | No block + only reads. |

It also reports the **current** default token setting for each org/enterprise.

## Migration path this enables

1. Run the audit across the Enterprise.
2. For every **BREAKS**/**REVIEW** job, add an explicit `permissions:` block preserving today's behavior.
3. Flip the org/enterprise default to read-only. Now a no-op, because explicit blocks win.

## Install & use

### gh CLI extension

```bash
gh extension install austenstone/gh-token-audit
gh token-audit --enterprise my-enterprise
gh token-audit --org my-org --format markdown --out audit.md
gh token-audit --repo owner/name
```

### npx

```bash
npx gh-token-audit --org my-org
```

### GitHub Action

```yaml
name: Token audit
on: workflow_dispatch
jobs:
  audit:
    runs-on: ubuntu-latest
    permissions:
      contents: read
    steps:
      - uses: austenstone/gh-token-audit@v1
        with:
          org: my-org
          fail-on: breaks
```

## Options (CLI)

| Flag | Description |
| --- | --- |
| `-e, --enterprise <slug>` | Enterprise slug (enumerates all orgs). |
| `-o, --org <org...>` | Organization(s) to audit. |
| `-r, --repo <owner/repo...>` | Specific repo(s). |
| `--include-archived` | Include archived repos. |
| `--max-repos <n>` | Cap repos scanned (quick sample). |
| `-f, --format <fmt>` | `markdown` (default), `json`, `csv`. |
| `--out <file>` | Write to a file instead of stdout. |
| `--token <token>` | Token (defaults to `GITHUB_TOKEN` / `GH_TOKEN`). |
| `--api-url <url>` | API base URL for GHES. |

Exit code is `1` if any job is classified **BREAKS**.

## Token scopes

- `--repo`: repo read.
- `--org`: org member + repo read + `read:org` (for the default setting).
- `--enterprise`: `read:enterprise` to enumerate orgs.

## Accuracy

Static heuristics. **BREAKS** is high confidence; **REVIEW** means "token is in scope but the write couldn't be pinned down." The heuristic knowledge base lives in [`src/heuristics.ts`](src/heuristics.ts) and is easy to extend. For jobs that stay **REVIEW**, complement with the runtime monitor.

## Develop

```bash
npm install
npm run typecheck
npm run build      # bundles dist/cli.mjs + dist/action.mjs
npm run dev -- --repo owner/name
```

`dist/` is committed on purpose. Both JS Actions and gh interpreted extensions run the repo as-is with no install step.
