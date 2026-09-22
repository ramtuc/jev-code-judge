import { NextResponse } from "next/server";
import { judgeLocally } from "@/lib/judge";
import { isJevConfigured, JevApiError, judgeWithJev } from "@/lib/jev";
import type { JudgePerspective } from "@/lib/experiment";

export async function POST(request: Request) {
  const body = (await request.json()) as { code?: unknown; perspective?: unknown };

  if (typeof body.code !== "string" || body.code.trim().length === 0) {
    return NextResponse.json({ error: "code is required" }, { status: 400 });
  }

  const perspective: JudgePerspective =
    body.perspective === "security" || body.perspective === "maintainability"
      ? body.perspective
      : "production";

  if (!isJevConfigured()) {
    return NextResponse.json(judgeLocally(body.code));
  }

  try {
    return NextResponse.json(await judgeWithJev(body.code, perspective));
  } catch (error) {
    const status = error instanceof JevApiError ? error.status : 502;
    const message = error instanceof Error ? error.message : "Jev request failed";
    return NextResponse.json({ error: message }, { status });
  }
}
