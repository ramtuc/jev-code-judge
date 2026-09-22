import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const baseUrl = process.env.CAPTURE_BASE_URL ?? "http://localhost:3000";
const outputDir = path.resolve("docs/article/data");

const stages = [
  {
    step: 0,
    label: "All mutations",
    code: `type User = { id: any; email: string };
export async function findUser(id: string): Promise<User | null> {
  eval(id);
  try {
    const result = await db.query(\`SELECT id, email FROM users WHERE id = '\${id}'\`);
    return result.rows[0] ?? null;
  } catch { return null; }
}`,
  },
  {
    step: 1,
    label: "Remove eval",
    code: `type User = { id: any; email: string };
export async function findUser(id: string): Promise<User | null> {
  try {
    const result = await db.query(\`SELECT id, email FROM users WHERE id = '\${id}'\`);
    return result.rows[0] ?? null;
  } catch { return null; }
}`,
  },
  {
    step: 2,
    label: "Parameterize SQL",
    code: `type User = { id: any; email: string };
export async function findUser(id: string): Promise<User | null> {
  try {
    const result = await db.query("SELECT id, email FROM users WHERE id = ?", [id]);
    return result.rows[0] ?? null;
  } catch { return null; }
}`,
  },
  {
    step: 3,
    label: "Restore exception handling",
    code: `type User = { id: any; email: string };
export async function findUser(id: string): Promise<User | null> {
  try {
    const result = await db.query("SELECT id, email FROM users WHERE id = ?", [id]);
    return result.rows[0] ?? null;
  } catch (error) {
    logger.error({ error, id }, "Failed to find user");
    throw error;
  }
}`,
  },
  {
    step: 4,
    label: "Restore validation",
    code: `type User = { id: any; email: string };
export async function findUser(id: string): Promise<User | null> {
  if (!id.trim()) throw new Error("id is required");
  try {
    const result = await db.query("SELECT id, email FROM users WHERE id = ?", [id]);
    return result.rows[0] ?? null;
  } catch (error) {
    logger.error({ error, id }, "Failed to find user");
    throw error;
  }
}`,
  },
  {
    step: 5,
    label: "Restore type",
    code: `type User = { id: string; email: string };
export async function findUser(id: string): Promise<User | null> {
  if (!id.trim()) throw new Error("id is required");
  try {
    const result = await db.query("SELECT id, email FROM users WHERE id = ?", [id]);
    return result.rows[0] ?? null;
  } catch (error) {
    logger.error({ error, id }, "Failed to find user");
    throw error;
  }
}`,
  },
];

const results = [];
for (const stage of stages) {
  for (let trial = 1; trial <= 3; trial += 1) {
    const response = await fetch(`${baseUrl}/api/judge`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: stage.code, perspective: "production" }),
    });
    if (!response.ok) throw new Error(`Repair experiment failed: ${response.status}`);
    results.push({ ...stage, trial, ...(await response.json()) });
  }
}

await mkdir(outputDir, { recursive: true });
await writeFile(
  path.join(outputDir, "repair-experiment.json"),
  JSON.stringify(results, null, 2),
  "utf8",
);
console.log("Saved repair experiment results.");
