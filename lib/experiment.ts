export type JudgePerspective = "production" | "security" | "maintainability";

export const PROMPT_VERSIONS: Record<JudgePerspective, string> = {
  production: "production-readiness-v1",
  security: "security-risk-v1",
  maintainability: "maintainability-risk-v1",
};

export const PROMPT_VERSION = PROMPT_VERSIONS.production;

export const TRIAL_OPTIONS = [1, 3, 5] as const;

export type TrialCount = (typeof TRIAL_OPTIONS)[number];
export type ExperimentMode = "cumulative" | "isolated";
