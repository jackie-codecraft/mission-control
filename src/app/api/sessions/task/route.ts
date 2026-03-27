import { NextRequest, NextResponse } from "next/server";
import { readFile } from "fs/promises";
import { join } from "path";
import { getOpenClawHome } from "@/lib/paths";

export const dynamic = "force-dynamic";

/**
 * GET /api/sessions/task?sessionId=<sessionId>&agentId=<agentId>
 * Returns the task brief (first user message) from a subagent session JSONL file.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const sessionId = (searchParams.get("sessionId") || "").trim();
  const agentId = (searchParams.get("agentId") || "main").trim();

  if (!sessionId) {
    return NextResponse.json({ error: "Missing sessionId" }, { status: 400 });
  }

  try {
    const home = getOpenClawHome();
    const sessionFile = join(home, "agents", agentId, "sessions", `${sessionId}.jsonl`);
    const content = await readFile(sessionFile, "utf-8");

    // Parse JSONL lines to find the first user message
    const lines = content.split("\n").filter((l) => l.trim());
    let taskText: string | null = null;

    for (const line of lines) {
      try {
        const entry = JSON.parse(line) as Record<string, unknown>;
        if (entry.type !== "message") continue;
        const msg = entry.message as Record<string, unknown> | null;
        if (!msg || msg.role !== "user") continue;

        // Extract text content from the message
        const msgContent = msg.content;
        if (typeof msgContent === "string") {
          taskText = msgContent;
        } else if (Array.isArray(msgContent)) {
          const textParts = msgContent
            .filter((c: unknown) => {
              const cp = c as Record<string, unknown>;
              return cp && cp.type === "text" && typeof cp.text === "string";
            })
            .map((c: unknown) => (c as Record<string, unknown>).text as string);
          if (textParts.length > 0) {
            taskText = textParts.join("\n");
          }
        }

        if (taskText) break;
      } catch {
        // Skip malformed lines
      }
    }

    return NextResponse.json({ task: taskText });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
