import { parse } from "yaml";
import type { Classification, DetectedWrite, JobFinding, PermissionMode, WorkflowFinding } from "./types.js";
import { RUN_WRITE_PATTERNS, TOKEN_ENV_KEYS, TOKEN_REFERENCE, matchKnownAction } from "./heuristics.js";

type PermissionsValue = string | Record<string, string> | null | undefined;

interface RawStep {
  uses?: string;
  run?: string;
  with?: Record<string, unknown>;
  env?: Record<string, unknown>;
}

interface RawJob {
  permissions?: PermissionsValue;
  env?: Record<string, unknown>;
  steps?: RawStep[];
  uses?: string; // reusable workflow call
}

interface RawWorkflow {
  permissions?: PermissionsValue;
  env?: Record<string, unknown>;
  jobs?: Record<string, RawJob>;
}

function grantsWrite(perms: PermissionsValue): boolean {
  if (perms == null) return false;
  if (typeof perms === "string") return perms === "write-all";
  return Object.values(perms).some((v) => v === "write");
}

function envHasToken(env: Record<string, unknown> | undefined): boolean {
  if (!env) return false;
  return Object.keys(env).some((k) => TOKEN_ENV_KEYS.includes(k));
}

function jobHasCheckoutWithPersistedCreds(job: RawJob): boolean {
  return (job.steps ?? []).some((s) => {
    if (!s.uses) return false;
    const ref = s.uses.split("@")[0] ?? "";
    if (ref !== "actions/checkout") return false;
    const persist = s.with?.["persist-credentials"];
    return persist !== false && persist !== "false";
  });
}

function classifyJob(
  jobId: string,
  job: RawJob,
  workflow: RawWorkflow,
): JobFinding {
  let permissionMode: PermissionMode;
  let permissionSource: "job" | "workflow" | "default";
  let effective: PermissionsValue;

  if (job.permissions !== undefined) {
    permissionMode = "explicit";
    permissionSource = "job";
    effective = job.permissions;
  } else if (workflow.permissions !== undefined) {
    permissionMode = "explicit";
    permissionSource = "workflow";
    effective = workflow.permissions;
  } else {
    permissionMode = "inherit";
    permissionSource = "default";
  }

  const tokenAvailable =
    envHasToken(workflow.env) ||
    envHasToken(job.env) ||
    (job.steps ?? []).some((s) => envHasToken(s.env));

  const detectedWrites: DetectedWrite[] = [];
  let usesToken = tokenAvailable;

  const hasCheckoutCreds = jobHasCheckoutWithPersistedCreds(job);

  for (const step of job.steps ?? []) {
    if (step.uses) {
      const scopes = matchKnownAction(step.uses);
      if (scopes) {
        usesToken = true;
        for (const scope of scopes) {
          detectedWrites.push({ scope, reason: `uses: ${step.uses}` });
        }
      }
    }
    if (step.run) {
      const stepTokenInScope =
        tokenAvailable || envHasToken(step.env) || TOKEN_REFERENCE.test(step.run);
      for (const rp of RUN_WRITE_PATTERNS) {
        if (!rp.pattern.test(step.run)) continue;
        const isGitPush = rp.label === "git push";
        const tokenForThis = isGitPush ? hasCheckoutCreds || stepTokenInScope : stepTokenInScope;
        if (!tokenForThis) continue;
        usesToken = true;
        for (const scope of rp.scopes) {
          detectedWrites.push({ scope, reason: rp.label });
        }
      }
      if (/\bgh\s/.test(step.run) && (stepTokenInScope || tokenAvailable)) {
        usesToken = true;
      }
    }
  }

  const explicitGrantsWrite = permissionMode === "explicit" && grantsWrite(effective);

  let classification: Classification;
  if (permissionMode === "explicit") {
    classification = "EXPLICIT";
  } else if (detectedWrites.length > 0) {
    classification = "BREAKS";
  } else if (usesToken) {
    classification = "REVIEW";
  } else {
    classification = "SAFE";
  }

  // Dedupe detected writes by scope+reason.
  const seen = new Set<string>();
  const deduped = detectedWrites.filter((d) => {
    const key = `${d.scope}|${d.reason}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return {
    jobId,
    classification,
    permissionMode,
    permissionSource,
    explicitGrantsWrite,
    detectedWrites: deduped,
    usesToken,
  };
}

export function analyzeWorkflow(path: string, content: string): WorkflowFinding {
  let doc: RawWorkflow;
  try {
    doc = (parse(content) ?? {}) as RawWorkflow;
  } catch (err) {
    return { path, parseError: (err as Error).message, jobs: [] };
  }
  if (!doc || typeof doc !== "object" || !doc.jobs) {
    return { path, jobs: [] };
  }
  const jobs: JobFinding[] = [];
  for (const [jobId, job] of Object.entries(doc.jobs)) {
    if (!job || typeof job !== "object") continue;
    // Reusable workflow calls inherit permissions from the caller; note but skip step analysis.
    jobs.push(classifyJob(jobId, job, doc));
  }
  return { path, jobs };
}
