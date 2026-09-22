import type { Judgment, Scores, Verdict } from "./types";
import { PROMPT_VERSION } from "./experiment";

type Signal = {
  test: (code: string) => boolean;
  weight: number;
  message: string;
};

const signals: Signal[] = [
  {
    test: (code) => /id:\s*any/.test(code),
    weight: 8,
    message: "引数がany型になっています",
  },
  {
    test: (code) => !/id\.trim\(\)/.test(code),
    weight: 14,
    message: "入力値の検証がありません",
  },
  {
    test: (code) => /catch\s*\{[\s\S]*?return null;/.test(code),
    weight: 18,
    message: "例外が記録されず、正常系と区別できません",
  },
  {
    test: (code) => /WHERE id = '\$\{id\}'/.test(code),
    weight: 35,
    message: "SQL Injectionにつながる文字列埋め込みがあります",
  },
  {
    test: (code) => /eval\s*\(/.test(code),
    weight: 45,
    message: "任意コード実行につながるevalがあります",
  },
];

function normalizeScores(reject: number): Scores {
  const boundedReject = Math.min(97, reject);
  const caution = Math.min(38, Math.round(12 + boundedReject * 0.18));
  const ship = Math.max(1, 100 - boundedReject - caution);
  const total = ship + caution + boundedReject;

  return {
    ship: Math.round((ship / total) * 100),
    caution: Math.round((caution / total) * 100),
    reject: Math.round((boundedReject / total) * 100),
  };
}

export function judgeLocally(code: string): Judgment {
  const matched = signals.filter((signal) => signal.test(code));
  const risk = matched.reduce((total, signal) => total + signal.weight, 3);
  const scores = normalizeScores(risk);
  const verdict: Verdict = scores.reject >= 50 ? "REJECT" : scores.reject >= 20 ? "CAUTION" : "SHIP";

  return {
    verdict,
    scores,
    summary:
      matched.length === 0
        ? "明確なリスクシグナルは見つかりませんでした。"
        : `${matched.length}件のリスクシグナルを検出しました。`,
    signals: matched.map((signal) => signal.message),
    source: "local-simulator",
    promptVersion: PROMPT_VERSION,
  };
}
