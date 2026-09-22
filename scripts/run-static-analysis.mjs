import { ESLint } from "eslint";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const samples = {
  clean: `export function run(id: string) { return id.trim(); }`,
  any: `export function run(id: any) { return id.trim(); }`,
  validation: `export function run(id: string) { return id; }`,
  catch: `export async function run() { try { return await work(); } catch { return null; } }`,
  sql: "export function run(id: string) { return db.query(`SELECT * FROM users WHERE id = '${id}'`); }",
  eval: `export function run(id: string) { return eval(id); }`,
};

const eslint = new ESLint({
  overrideConfig: {
    rules: {
      "no-eval": "error",
      "@typescript-eslint/no-explicit-any": "error",
    },
  },
});

const report = [];
for (const [mutation, code] of Object.entries(samples)) {
  const [result] = await eslint.lintText(code, { filePath: `${mutation}.ts` });
  report.push({
    mutation,
    errorCount: result.errorCount,
    warnings: result.messages.map(({ ruleId, severity, message }) => ({ ruleId, severity, message })),
  });
}

const outputDir = path.resolve("docs/article/data");
await mkdir(outputDir, { recursive: true });
await writeFile(path.join(outputDir, "eslint-comparison.json"), JSON.stringify(report, null, 2), "utf8");
console.log(JSON.stringify(report, null, 2));
