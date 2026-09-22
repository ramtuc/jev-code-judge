export type Verdict = "SHIP" | "CAUTION" | "REJECT";

export type Scores = {
  ship: number;
  caution: number;
  reject: number;
};

export type Judgment = {
  verdict: Verdict;
  scores: Scores;
  summary: string;
  signals: string[];
  source: "local-simulator" | "jev-direct" | "vercel-ai-gateway";
  promptVersion: string;
  model?: string;
  elapsedMs?: number;
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
  };
};

export type MutationId =
  | "any-type"
  | "remove-validation"
  | "swallow-exception"
  | "sql-concat"
  | "add-eval";

export type ExperimentRecord = Judgment & {
  id: string;
  experimentId: string;
  step: number;
  trialNumber: number;
  experimentMode: "cumulative" | "isolated";
  perspective: "production" | "security" | "maintainability";
  mutation: MutationId | "clean" | "manual";
  mutationLabel: string;
  mutationOrder: MutationId[];
  code: string;
  createdAt: string;
};
