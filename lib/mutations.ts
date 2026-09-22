import type { MutationId } from "./types";

export const cleanCode = `type User = {
  id: string;
  email: string;
};

export async function findUser(id: string): Promise<User | null> {
  if (!id.trim()) {
    throw new Error("id is required");
  }

  try {
    const result = await db.query(
      "SELECT id, email FROM users WHERE id = ?",
      [id]
    );

    return result.rows[0] ?? null;
  } catch (error) {
    logger.error({ error, id }, "Failed to find user");
    throw error;
  }
}`;

export type MutationDefinition = {
  id: MutationId;
  label: string;
  shortLabel: string;
  description: string;
  apply: (code: string) => string;
};

export const mutations: MutationDefinition[] = [
  {
    id: "any-type",
    label: "Replace type with any",
    shortLabel: "any",
    description: "引数の型安全性を外す",
    apply: (code) => code.replace("id: string", "id: any"),
  },
  {
    id: "remove-validation",
    label: "Remove validation",
    shortLabel: "validation",
    description: "空のIDを拒否する処理を削除",
    apply: (code) =>
      code.replace(/\n  if \(!id\.trim\(\)\) \{\n    throw new Error\("id is required"\);\n  \}\n/, "\n"),
  },
  {
    id: "swallow-exception",
    label: "Swallow exception",
    shortLabel: "catch",
    description: "例外の記録と再送出を止める",
    apply: (code) =>
      code.replace(
        /  \} catch \(error\) \{\n    logger\.error\(\{ error, id \}, "Failed to find user"\);\n    throw error;\n  \}/,
        "  } catch {\n    return null;\n  }",
      ),
  },
  {
    id: "sql-concat",
    label: "SQL concatenation",
    shortLabel: "SQL",
    description: "SQLへ入力値を直接埋め込む",
    apply: (code) =>
      code.replace(
        /"SELECT id, email FROM users WHERE id = \?",\n      \[id\]/,
        "`SELECT id, email FROM users WHERE id = '${id}'`",
      ),
  },
  {
    id: "add-eval",
    label: "Add eval",
    shortLabel: "eval",
    description: "入力値をevalへ渡す",
    apply: (code) =>
      code.replace(
        "export async function findUser(id:",
        "export async function findUser(id:",
      ).replace("  try {", "  eval(id);\n\n  try {"),
  },
];
