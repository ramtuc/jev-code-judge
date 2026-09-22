import "server-only";

import type { Judgment, Scores, Verdict } from "./types";
import { PROMPT_VERSIONS, type JudgePerspective } from "./experiment";

const DEFAULT_ENDPOINT = "https://api.typesafe.ai/v1/systemone";
const DEFAULT_MODEL = "jev-latest";
const VERCEL_ENDPOINT = "https://ai-gateway.vercel.sh/v1/evaluate";
const VERCEL_MODEL = "typesafe-ai/jev";
const RETRYABLE_STATUS = new Set([429, 529]);

type JevProvider = "typesafe" | "vercel";

type JevChoiceAnswer = {
  type: "choice";
  choice: string;
  probabilities: Record<string, number>;
  confidence: number;
};

type JevNoulAnswer = {
  type: "noul";
  noul: number;
};

type JevBooleanAnswer = {
  type: "boolean";
  probability: number;
};

type JevResponse = {
  model?: string;
  answers?: Record<string, JevChoiceAnswer | JevNoulAnswer | JevBooleanAnswer>;
  result?: {
    answers?: Record<string, JevChoiceAnswer | JevNoulAnswer | JevBooleanAnswer>;
    usage?: {
      input_tokens?: number;
      output_tokens?: number;
      inputTokens?: number;
      outputTokens?: number;
    };
  };
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    inputTokens?: number;
    outputTokens?: number;
  };
  elapsed?: number;
  elapsedMs?: number;
};

export class JevApiError extends Error {
  constructor(
    message: string,
    readonly status = 502,
  ) {
    super(message);
    this.name = "JevApiError";
  }
}

function toPercent(value: number | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  return Math.round(Math.max(0, Math.min(1, value)) * 100);
}

function normalizeScores(probabilities: Record<string, number>): Scores {
  const raw = {
    ship: toPercent(probabilities.ship),
    caution: toPercent(probabilities.caution),
    reject: toPercent(probabilities.reject),
  };
  const total = raw.ship + raw.caution + raw.reject;

  if (total === 0) throw new JevApiError("Jev returned empty verdict probabilities");

  return {
    ship: Math.round((raw.ship / total) * 100),
    caution: Math.round((raw.caution / total) * 100),
    reject: Math.round((raw.reject / total) * 100),
  };
}

function getNoulProbability(answer: JevNoulAnswer | JevBooleanAnswer | JevChoiceAnswer | undefined) {
  if (answer?.type === "noul") return answer.noul;
  if (answer?.type === "boolean") return answer.probability;
  return undefined;
}

function parseResponse(
  payload: JevResponse,
  requestMs: number,
  provider: JevProvider,
  perspective: JudgePerspective,
): Judgment {
  const answers = payload.answers ?? payload.result?.answers;
  const verdictAnswer = answers?.production_verdict;

  if (!verdictAnswer || verdictAnswer.type !== "choice") {
    throw new JevApiError("Jev response did not include a production verdict");
  }

  const verdict = verdictAnswer.choice.toUpperCase() as Verdict;
  if (!(["SHIP", "CAUTION", "REJECT"] as string[]).includes(verdict)) {
    throw new JevApiError("Jev returned an unknown verdict");
  }

  const securityAnswer = answers?.has_security_risk;
  const maintainabilityAnswer = answers?.has_maintainability_risk;
  const securityProbability = getNoulProbability(securityAnswer);
  const maintainabilityProbability = getNoulProbability(maintainabilityAnswer);
  const signals: string[] = [];

  if (securityProbability !== undefined && securityProbability >= 0.5) {
    signals.push(`セキュリティリスク ${toPercent(securityProbability)}%`);
  }
  if (maintainabilityProbability !== undefined && maintainabilityProbability >= 0.5) {
    signals.push(`保守性リスク ${toPercent(maintainabilityProbability)}%`);
  }

  const usage = payload.usage ?? payload.result?.usage;

  return {
    verdict,
    scores: normalizeScores(verdictAnswer.probabilities),
    summary:
      signals.length === 0
        ? "Jevは重大なリスクシグナルを示しませんでした。"
        : `Jevが${signals.length}件のリスクシグナルを示しました。`,
    signals,
    source: provider === "vercel" ? "vercel-ai-gateway" : "jev-direct",
    promptVersion: PROMPT_VERSIONS[perspective],
    model:
      payload.model ??
      process.env.JEV_MODEL ??
      (provider === "vercel" ? VERCEL_MODEL : DEFAULT_MODEL),
    elapsedMs: payload.elapsedMs ?? payload.elapsed ?? requestMs,
    usage: usage
      ? {
          inputTokens: usage.input_tokens ?? usage.inputTokens,
          outputTokens: usage.output_tokens ?? usage.outputTokens,
        }
      : undefined,
  };
}

const perspectiveQuestions: Record<
  JudgePerspective,
  {
    context: string;
    instructions: string;
    criteria: Record<"ship" | "caution" | "reject", string>;
  }
> = {
  production: {
    context: "This code is being reviewed immediately before a production deployment.",
    instructions:
      "Is this code ready to deploy to production? Judge the code as provided. Select exactly one verdict.",
    criteria: {
      ship: "Safe and sufficiently robust to deploy as-is.",
      caution: "Deploy only after review or a non-critical improvement.",
      reject: "Do not deploy because of a material security, correctness, or reliability risk.",
    },
  },
  security: {
    context: "This code is undergoing a focused security review before deployment.",
    instructions:
      "Does this code pass a production security review? Judge only material security risk and select exactly one verdict.",
    criteria: {
      ship: "No material security vulnerability is evident.",
      caution: "A plausible security concern requires manual review.",
      reject: "A material exploitable security vulnerability is evident.",
    },
  },
  maintainability: {
    context: "This code is undergoing a focused long-term maintainability review.",
    instructions:
      "Is this code sufficiently maintainable for long-term production use? Select exactly one verdict.",
    criteria: {
      ship: "Clear, robust, and sufficiently maintainable as-is.",
      caution: "A concrete but non-critical maintainability issue should be improved.",
      reject: "A material maintainability problem makes long-term operation unsafe or impractical.",
    },
  },
};

function createRequest(code: string, provider: JevProvider, perspective: JudgePerspective) {
  const booleanType = provider === "vercel" ? "boolean" : "noul";
  const focusedQuestion = perspectiveQuestions[perspective];
  return {
    model:
      process.env.JEV_MODEL ??
      (provider === "vercel" ? VERCEL_MODEL : DEFAULT_MODEL),
    state: {
      language: "TypeScript",
      code,
      context: focusedQuestion.context,
    },
    questions: {
      production_verdict: {
        type: "choice",
        instructions: focusedQuestion.instructions,
        criteria: focusedQuestion.criteria,
      },
      has_security_risk: {
        type: booleanType,
        instructions: "Does this code contain a material security vulnerability?",
        criteria: {
          true: "A realistic vulnerability exists in the code as provided.",
          false: "No material security vulnerability is evident in the code as provided.",
        },
      },
      has_maintainability_risk: {
        type: booleanType,
        instructions: "Does this code have a material long-term maintainability risk?",
        criteria: {
          true: "The code has a concrete issue likely to make maintenance materially harder.",
          false: "No material long-term maintainability issue is evident.",
        },
      },
    },
  };
}

async function wait(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function getProvider(): JevProvider {
  return process.env.JEV_PROVIDER?.toLowerCase() === "vercel" ? "vercel" : "typesafe";
}

export function isJevConfigured() {
  const provider = getProvider();
  return provider === "vercel"
    ? Boolean(process.env.AI_GATEWAY_API_KEY)
    : Boolean(process.env.TYPESAFE_API_KEY);
}

export async function judgeWithJev(
  code: string,
  perspective: JudgePerspective = "production",
): Promise<Judgment> {
  const provider = getProvider();
  const apiKey =
    provider === "vercel" ? process.env.AI_GATEWAY_API_KEY : process.env.TYPESAFE_API_KEY;
  if (!apiKey) {
    const variable = provider === "vercel" ? "AI_GATEWAY_API_KEY" : "TYPESAFE_API_KEY";
    throw new JevApiError(`${variable} is not configured`, 503);
  }

  const endpoint =
    process.env.JEV_API_URL ?? (provider === "vercel" ? VERCEL_ENDPOINT : DEFAULT_ENDPOINT);
  const startedAt = Date.now();

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(createRequest(code, provider, perspective)),
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });

    if (response.ok) {
      const payload = (await response.json()) as JevResponse;
      return parseResponse(payload, Date.now() - startedAt, provider, perspective);
    }

    if (RETRYABLE_STATUS.has(response.status) && attempt < 2) {
      await wait(300 * 2 ** attempt);
      continue;
    }

    if (response.status === 401) {
      throw new JevApiError("Jev API key was rejected", 502);
    }
    if (response.status === 403 && provider === "vercel") {
      throw new JevApiError(
        "Vercel AI Gateway denied inference. Check Gateway credits, API-key budget, and team access.",
        502,
      );
    }
    if (response.status === 422) {
      throw new JevApiError("Jev rejected the judgment request format", 502);
    }

    throw new JevApiError(`Jev request failed with status ${response.status}`, 502);
  }

  throw new JevApiError("Jev remained unavailable after retries", 503);
}
