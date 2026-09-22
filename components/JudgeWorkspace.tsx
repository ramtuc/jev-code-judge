"use client";

import { useMemo, useState } from "react";
import {
  Activity,
  Braces,
  Check,
  ChevronRight,
  Download,
  FlaskConical,
  RotateCcw,
  ShieldAlert,
  Sparkles,
} from "lucide-react";
import { CodeEditor } from "./CodeEditor";
import { JudgmentChart } from "./JudgmentChart";
import { cleanCode, mutations } from "@/lib/mutations";
import { judgeLocally } from "@/lib/judge";
import { PROMPT_VERSIONS, TRIAL_OPTIONS } from "@/lib/experiment";
import type { ExperimentMode, JudgePerspective, TrialCount } from "@/lib/experiment";
import type { ExperimentRecord, Judgment, MutationId, Scores, Verdict } from "@/lib/types";

const initialJudgment = judgeLocally(cleanCode);

const initialRecord: ExperimentRecord = {
  ...initialJudgment,
  id: "initial-clean-judgment",
  experimentId: "local-preview",
  step: 0,
  trialNumber: 1,
  experimentMode: "cumulative",
  perspective: "production",
  mutation: "clean",
  mutationLabel: "Clean",
  mutationOrder: [],
  code: cleanCode,
  createdAt: new Date(0).toISOString(),
};

type RunDefinition = {
  code: string;
  mutation: MutationId | "clean" | "manual";
  label: string;
  step: number;
  mutationOrder: MutationId[];
};

function makeRecord(
  judgment: Judgment,
  definition: RunDefinition,
  experimentId: string,
  experimentMode: ExperimentMode,
  perspective: JudgePerspective,
  trialNumber: number,
): ExperimentRecord {
  return {
    ...judgment,
    id: crypto.randomUUID(),
    experimentId,
    step: definition.step,
    trialNumber,
    experimentMode,
    perspective,
    mutation: definition.mutation,
    mutationLabel: definition.label,
    mutationOrder: definition.mutationOrder,
    code: definition.code,
    createdAt: new Date().toISOString(),
  };
}

function averageJudgments(judgments: Judgment[]): Judgment {
  const average = (key: keyof Scores) =>
    Math.round(judgments.reduce((sum, judgment) => sum + judgment.scores[key], 0) / judgments.length);
  const scores = {
    ship: average("ship"),
    caution: average("caution"),
    reject: average("reject"),
  };
  const verdict = (Object.entries(scores) as [Lowercase<Verdict>, number][])
    .sort((left, right) => right[1] - left[1])[0][0].toUpperCase() as Verdict;
  const last = judgments.at(-1)!;
  const usage = {
    inputTokens: judgments.reduce((sum, item) => sum + (item.usage?.inputTokens ?? 0), 0),
    outputTokens: judgments.reduce((sum, item) => sum + (item.usage?.outputTokens ?? 0), 0),
  };

  return {
    ...last,
    verdict,
    scores,
    signals: Array.from(new Set(judgments.flatMap((item) => item.signals))),
    summary:
      judgments.length === 1
        ? last.summary
        : `${judgments.length}回の試行結果を平均しました。`,
    elapsedMs: Math.round(
      judgments.reduce((sum, item) => sum + (item.elapsedMs ?? 0), 0) / judgments.length,
    ),
    usage,
  };
}

function escapeCsv(value: unknown) {
  const text = Array.isArray(value) ? value.join(">") : String(value ?? "");
  return `"${text.replaceAll('"', '""')}"`;
}

type JudgeWorkspaceProps = {
  jevConfigured: boolean;
};

export function JudgeWorkspace({ jevConfigured }: JudgeWorkspaceProps) {
  const [code, setCode] = useState(cleanCode);
  const [judgment, setJudgment] = useState(initialJudgment);
  const [records, setRecords] = useState<ExperimentRecord[]>([initialRecord]);
  const [applied, setApplied] = useState<MutationId[]>([]);
  const [experimentMode, setExperimentMode] = useState<ExperimentMode>("cumulative");
  const [trialCount, setTrialCount] = useState<TrialCount>(1);
  const [perspective, setPerspective] = useState<JudgePerspective>("production");
  const [lastTrialCount, setLastTrialCount] = useState(1);
  const [experimentId, setExperimentId] = useState("local-preview");
  const [isJudging, setIsJudging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const commitResults = (
    results: Judgment[],
    definition: RunDefinition,
    activeExperimentId: string,
  ) => {
    if (results.length === 0) return;
    const nextRecords = results.map((result, index) =>
      makeRecord(
        result,
        definition,
        activeExperimentId,
        experimentMode,
        perspective,
        index + 1,
      ),
    );
    setJudgment(averageJudgments(results));
    setLastTrialCount(results.length);
    setRecords((current) => {
      const containsOnlySimulation = current.every(
        (record) => record.source === "local-simulator",
      );
      const isLiveResult = results[0].source !== "local-simulator";
      return isLiveResult && containsOnlySimulation
        ? nextRecords
        : [...current, ...nextRecords];
    });
  };

  const runTrials = async (definition: RunDefinition) => {
    if (isJudging) return;
    setIsJudging(true);
    setError(null);

    const activeExperimentId =
      experimentId === "local-preview" ? crypto.randomUUID() : experimentId;
    if (activeExperimentId !== experimentId) setExperimentId(activeExperimentId);
    const results: Judgment[] = [];

    try {
      for (let trial = 1; trial <= trialCount; trial += 1) {
        const response = await fetch("/api/judge", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code: definition.code, perspective }),
        });
        const payload = (await response.json()) as Judgment | { error?: string };

        if (!response.ok) {
          const message = "error" in payload ? payload.error : undefined;
          throw new Error(message || "判定リクエストに失敗しました");
        }
        results.push(payload as Judgment);
      }
      commitResults(results, definition, activeExperimentId);
    } catch (cause) {
      commitResults(results, definition, activeExperimentId);
      const suffix = results.length > 0 ? `（${results.length}/${trialCount}回は保存済み）` : "";
      setError(
        `${cause instanceof Error ? cause.message : "判定中にエラーが発生しました"}${suffix}`,
      );
    } finally {
      setIsJudging(false);
    }
  };

  const applyMutation = async (mutationId: MutationId) => {
    const mutation = mutations.find((item) => item.id === mutationId);
    if (!mutation || applied.includes(mutationId) || isJudging) return;

    const baseCode = experimentMode === "isolated" ? cleanCode : code;
    const nextCode = mutation.apply(baseCode);
    if (nextCode === baseCode) {
      setError("Mutationの適用対象が見つかりませんでした。コードをResetしてください。");
      return;
    }

    const nextOrder =
      experimentMode === "isolated" ? [mutationId] : [...applied, mutationId];
    setCode(nextCode);
    setApplied((current) => [...current, mutationId]);
    await runTrials({
      code: nextCode,
      mutation: mutation.id,
      label: mutation.shortLabel,
      step: applied.length + 1,
      mutationOrder: nextOrder,
    });
  };

  const reset = (
    nextMode: ExperimentMode = experimentMode,
    nextPerspective: JudgePerspective = perspective,
  ) => {
    if (isJudging) return;
    const nextExperimentId = crypto.randomUUID();
    setCode(cleanCode);
    setApplied([]);
    setExperimentMode(nextMode);
    setPerspective(nextPerspective);
    setExperimentId(nextExperimentId);
    setJudgment(initialJudgment);
    setLastTrialCount(1);
    setError(null);
    setRecords([
      {
        ...initialRecord,
        id: crypto.randomUUID(),
        experimentId: nextExperimentId,
        experimentMode: nextMode,
        perspective: nextPerspective,
        promptVersion: PROMPT_VERSIONS[nextPerspective],
        createdAt: new Date().toISOString(),
      },
    ]);
  };

  const runCurrentJudgment = async () => {
    await runTrials({
      code,
      mutation: applied.length === 0 ? "clean" : "manual",
      label: applied.length === 0 ? "Clean" : "Manual",
      step: applied.length === 0 ? 0 : applied.length,
      mutationOrder: [...applied],
    });
  };

  const exportData = (format: "json" | "csv") => {
    const headers = [
      "experimentId",
      "experimentMode",
      "perspective",
      "step",
      "trialNumber",
      "mutation",
      "mutationOrder",
      "verdict",
      "ship",
      "caution",
      "reject",
      "source",
      "model",
      "promptVersion",
      "elapsedMs",
      "inputTokens",
      "outputTokens",
      "createdAt",
      "code",
    ];
    const contents =
      format === "json"
        ? JSON.stringify(records, null, 2)
        : [
            headers.map(escapeCsv).join(","),
            ...records.map((record) =>
              [
                record.experimentId,
                record.experimentMode,
                record.perspective,
                record.step,
                record.trialNumber,
                record.mutation,
                record.mutationOrder,
                record.verdict,
                record.scores.ship,
                record.scores.caution,
                record.scores.reject,
                record.source,
                record.model,
                record.promptVersion,
                record.elapsedMs,
                record.usage?.inputTokens,
                record.usage?.outputTokens,
                record.createdAt,
                record.code,
              ]
                .map(escapeCsv)
                .join(","),
            ),
          ].join("\n");
    const blob = new Blob([contents], {
      type: format === "json" ? "application/json" : "text/csv",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `jev-experiment-${experimentId}.${format}`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const activeScore = useMemo(
    () => ({
      SHIP: judgment.scores.ship,
      CAUTION: judgment.scores.caution,
      REJECT: judgment.scores.reject,
    }),
    [judgment],
  );
  const isLiveJev = judgment.source !== "local-simulator";
  const modeLabel = isLiveJev ? "JEV LIVE" : jevConfigured ? "JEV READY" : "LOCAL SIMULATOR";

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand-lockup">
          <div className="brand-mark"><Braces size={19} /></div>
          <div>
            <h1>JEV CODE JUDGE</h1>
            <p>Break the code. Find the boundary.</p>
          </div>
        </div>
        <div className="header-actions">
          <span className={`mode-badge ${isLiveJev ? "mode-live" : ""}`}>
            <span className="live-dot" /> {modeLabel}
          </span>
          <button className="ghost-button" onClick={() => exportData("json")} disabled={!records.length}>
            <Download size={15} /> Export
          </button>
        </div>
      </header>

      <section className="hero-strip">
        <div>
          <span className="eyebrow"><FlaskConical size={14} /> EXPERIMENT 01</span>
          <h2>コードを壊す。<span>境界を見つける。</span></h2>
        </div>
        <p>Mutationを一つずつ適用して、<br />本番投入可否の判定が変わる地点を観察します。</p>
      </section>

      <div className="workspace-grid">
        <section className="panel editor-panel">
          <div className="panel-heading">
            <div><span className="panel-index">01</span><h3>CODE UNDER TEST</h3></div>
            <span className="file-label">find-user.ts</span>
          </div>
          <div className="editor-frame"><CodeEditor value={code} onChange={setCode} /></div>
        </section>

        <section className="panel verdict-panel">
          <div className="panel-heading">
            <div><span className="panel-index">02</span><h3>VERDICT</h3></div>
            <button className="judge-button" onClick={() => void runCurrentJudgment()} disabled={isJudging}>
              <Activity size={14} /> {isJudging ? "Judging" : `Run × ${trialCount}`}
            </button>
          </div>

          <div className={`verdict verdict-${judgment.verdict.toLowerCase()}`}>
            <span className="verdict-kicker">
              {perspective.toUpperCase()} JUDGE {lastTrialCount > 1 && `/ AVG OF ${lastTrialCount}`}
            </span>
            <strong>{isJudging ? "JUDGING" : judgment.verdict}</strong>
            <div className="verdict-score">{activeScore[judgment.verdict]}<span>%</span></div>
          </div>

          <div className="score-list">
            {(["SHIP", "CAUTION", "REJECT"] as const).map((label) => (
              <div className="score-row" key={label}>
                <div><span>{label}</span><b>{activeScore[label]}%</b></div>
                <div className="score-track">
                  <span className={`score-fill fill-${label.toLowerCase()}`} style={{ width: `${activeScore[label]}%` }} />
                </div>
              </div>
            ))}
          </div>

          <div className="signal-box">
            <div className="signal-title"><ShieldAlert size={15} /> SIGNALS</div>
            <p>{judgment.summary}</p>
            {judgment.signals.slice(0, 3).map((signal) => <span key={signal}>{signal}</span>)}
            {isLiveJev && (
              <div className="jev-meta">
                <span>{judgment.source === "vercel-ai-gateway" ? "Vercel AI Gateway" : "TypeSafe Direct"}</span>
                <span>{judgment.model}</span>
                <span>{PROMPT_VERSIONS[perspective]}</span>
                {judgment.elapsedMs !== undefined && <span>{judgment.elapsedMs} ms avg</span>}
                {judgment.usage?.inputTokens !== undefined && (
                  <span>{judgment.usage.inputTokens} input tokens total</span>
                )}
              </div>
            )}
            {error && <span className="error-text">{error}</span>}
          </div>
        </section>

        <section className="panel mutation-panel">
          <div className="panel-heading">
            <div><span className="panel-index">03</span><h3>APPLY MUTATION</h3></div>
            <button className="text-button" onClick={() => reset()} disabled={isJudging}>
              <RotateCcw size={14} /> Reset
            </button>
          </div>
          <div className="experiment-controls">
            <div className="control-group">
              <span>JUDGE</span>
              {(["production", "security", "maintainability"] as const).map((item) => (
                <button
                  className={perspective === item ? "is-selected" : ""}
                  key={item}
                  onClick={() => reset(experimentMode, item)}
                  disabled={isJudging}
                >
                  {item === "production" ? "Prod" : item === "security" ? "Security" : "Maintain"}
                </button>
              ))}
            </div>
            <div className="control-group">
              <span>MODE</span>
              <button
                className={experimentMode === "cumulative" ? "is-selected" : ""}
                onClick={() => reset("cumulative")}
                disabled={isJudging}
              >
                Cumulative
              </button>
              <button
                className={experimentMode === "isolated" ? "is-selected" : ""}
                onClick={() => reset("isolated")}
                disabled={isJudging}
              >
                Isolated
              </button>
            </div>
            <div className="control-group">
              <span>TRIALS</span>
              {TRIAL_OPTIONS.map((count) => (
                <button
                  className={trialCount === count ? "is-selected" : ""}
                  key={count}
                  onClick={() => setTrialCount(count)}
                  disabled={isJudging}
                >
                  {count}
                </button>
              ))}
            </div>
          </div>
          <div className="mutation-list">
            {mutations.map((mutation, index) => {
              const isApplied = applied.includes(mutation.id);
              return (
                <button
                  className={`mutation-button ${isApplied ? "is-applied" : ""}`}
                  key={mutation.id}
                  onClick={() => void applyMutation(mutation.id)}
                  disabled={isApplied || isJudging}
                >
                  <span className="mutation-number">{isApplied ? <Check size={15} /> : String(index + 1).padStart(2, "0")}</span>
                  <span><b>{mutation.label}</b><small>{mutation.description}</small></span>
                  <ChevronRight className="mutation-arrow" size={17} />
                </button>
              );
            })}
          </div>
        </section>

        <section className="panel chart-panel">
          <div className="panel-heading">
            <div><span className="panel-index">04</span><h3>REJECT SCORE</h3></div>
            <span className="chart-legend"><i /> AVERAGE %</span>
          </div>
          <JudgmentChart records={records} />
        </section>

        <section className="panel timeline-panel">
          <div className="panel-heading">
            <div><span className="panel-index">05</span><h3>EXPERIMENT RUNS</h3></div>
            <div className="export-buttons">
              <button onClick={() => exportData("csv")} disabled={!records.length}>CSV</button>
              <button onClick={() => exportData("json")} disabled={!records.length}>JSON</button>
            </div>
          </div>
          <div className="timeline">
            {records.map((record) => (
              <div className="timeline-item" key={record.id}>
                <span className="timeline-step">{String(record.step).padStart(2, "0")}</span>
                <span className="timeline-dot" />
                <div>
                  <b>{record.mutationLabel} / T{record.trialNumber}</b>
                  <small>{record.verdict} · {record.experimentMode}</small>
                </div>
                <strong className={`timeline-score score-${record.verdict.toLowerCase()}`}>{record.scores.reject}%</strong>
              </div>
            ))}
            {records.length === 0 && <div className="empty-state"><Sparkles size={16} /> Waiting for the first judgment</div>}
          </div>
        </section>
      </div>

      <footer>
        <span>JEV CODE JUDGE / {PROMPT_VERSIONS[perspective]}</span>
        <span>{isLiveJev ? "CONNECTED TO JEV" : "LOCAL SIMULATOR — CONFIGURE A JEV PROVIDER FOR LIVE MODE"}</span>
      </footer>
    </main>
  );
}
