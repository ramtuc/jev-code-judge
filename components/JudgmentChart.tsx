"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { ExperimentRecord } from "@/lib/types";

type JudgmentChartProps = {
  records: ExperimentRecord[];
};

export function JudgmentChart({ records }: JudgmentChartProps) {
  const groups = new Map<string, ExperimentRecord[]>();
  for (const record of records) {
    const key = `${record.experimentId}:${record.step}:${record.mutationLabel}`;
    groups.set(key, [...(groups.get(key) ?? []), record]);
  }
  const data = Array.from(groups.values()).map((group) => {
    const values = group.map((record) => record.scores.reject);
    return {
      step: group[0].step === 0 ? "Clean" : group[0].mutationLabel,
      reject: Math.round(values.reduce((sum, value) => sum + value, 0) / values.length),
      min: Math.min(...values),
      max: Math.max(...values),
      trials: values.length,
    };
  });

  return (
    <div className="chart-wrap">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 14, right: 16, left: -18, bottom: 0 }}>
          <defs>
            <linearGradient id="rejectGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#ff6347" stopOpacity={0.36} />
              <stop offset="100%" stopColor="#ff6347" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="#27302f" strokeDasharray="3 5" vertical={false} />
          <XAxis
            dataKey="step"
            stroke="#77817e"
            tick={{ fill: "#9ba4a1", fontSize: 11 }}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            domain={[0, 100]}
            ticks={[0, 25, 50, 75, 100]}
            stroke="#77817e"
            tick={{ fill: "#77817e", fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            tickFormatter={(value) => `${value}%`}
          />
          <Tooltip
            contentStyle={{
              background: "#171d1c",
              border: "1px solid #36413f",
              borderRadius: 10,
              color: "#f0f4f2",
              fontSize: 12,
            }}
            formatter={(value, name, item) => {
              const payload = item.payload as { min: number; max: number; trials: number };
              return [`${value}% (min ${payload.min} / max ${payload.max}, n=${payload.trials})`, name === "reject" ? "REJECT AVG" : name];
            }}
          />
          <Area
            type="monotone"
            dataKey="reject"
            stroke="#ff735c"
            strokeWidth={2.5}
            fill="url(#rejectGradient)"
            dot={{ fill: "#111615", stroke: "#ff735c", strokeWidth: 2, r: 4 }}
            activeDot={{ r: 6, fill: "#ff735c" }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
