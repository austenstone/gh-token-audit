export type Classification = "EXPLICIT" | "BREAKS" | "REVIEW" | "SAFE";

export type PermissionMode = "explicit" | "inherit";

export interface DetectedWrite {
  scope: string;
  reason: string;
}

export interface JobFinding {
  jobId: string;
  classification: Classification;
  permissionMode: PermissionMode;
  permissionSource: "job" | "workflow" | "default";
  explicitGrantsWrite: boolean;
  detectedWrites: DetectedWrite[];
  usesToken: boolean;
}

export interface WorkflowFinding {
  path: string;
  parseError?: string;
  jobs: JobFinding[];
}

export interface RepoFinding {
  owner: string;
  repo: string;
  defaultBranch: string;
  archived: boolean;
  workflows: WorkflowFinding[];
}

export interface DefaultSetting {
  scope: "enterprise" | "organization";
  name: string;
  defaultWorkflowPermissions?: "read" | "write";
  canApprovePullRequestReviews?: boolean;
  error?: string;
}

export interface AuditReport {
  generatedAt: string;
  scope: string;
  defaults: DefaultSetting[];
  repos: RepoFinding[];
  summary: {
    repos: number;
    workflows: number;
    jobs: number;
    breaks: number;
    review: number;
    safe: number;
    explicit: number;
  };
}

export interface AuditOptions {
  enterprise?: string;
  orgs: string[];
  repos: string[];
  includeArchived: boolean;
  maxRepos?: number;
  onProgress?: (message: string) => void;
}
