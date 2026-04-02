import { NextRequest, NextResponse } from "next/server"
import type { GenerateRequest, GeneratedResult } from "@/lib/types"

const ORCHESTRATOR_URL =
  process.env.ORCHESTRATOR_URL ?? "http://localhost:8100"

interface OrchestratorTask {
  status?: string
  error?: string | null
}

interface OrchestratorRunResponse {
  status?: string
  tasks?: Record<string, OrchestratorTask>
  outputs?: Partial<GeneratedResult>
}

/**
 * POST /api/generate-song
 *
 * Delegates to the Maestro orchestrator which runs the song_pipeline
 * workflow: generate → align → package.
 *
 * Falls back to direct Lyria generation if the orchestrator is unavailable.
 */
export async function POST(req: NextRequest) {
  let body: GenerateRequest
  try {
    body = await req.json()
  } catch {
    return NextResponse.json(
      { error: "Invalid request body." },
      { status: 400 }
    )
  }

  const { prompt, mood, length, vocals } = body

  if (!prompt?.trim()) {
    return NextResponse.json(
      { error: "Prompt is required." },
      { status: 400 }
    )
  }

  try {
    // ── Call Maestro orchestrator ────────────────────────────────
    const runRes = await fetch(`${ORCHESTRATOR_URL}/runs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        workflow: "song_pipeline",
        inputs: { prompt, mood, length, vocals },
      }),
      signal: AbortSignal.timeout(300_000),
    })

    if (!runRes.ok) {
      const errBody = await runRes.text().catch(() => "")
      return NextResponse.json(
        { error: `Orchestrator error: ${runRes.status} ${errBody.slice(0, 200)}` },
        { status: 502 }
      )
    }

    const run = (await runRes.json()) as OrchestratorRunResponse
    const tasks = run.tasks ?? {}
    const outputs = run.outputs ?? {}

    if (run.status === "failed") {
      const failedTasks = Object.entries(tasks)
        .filter(([, task]) => task.status === "failed")
        .map(([name, task]) => `${name}: ${task.error?.slice(0, 100)}`)
      return NextResponse.json(
        { error: `Pipeline failed: ${failedTasks.join("; ") || "unknown"}` },
        { status: 502 }
      )
    }

    // The orchestrator returns the packaged result in run.outputs
    return NextResponse.json({
      title: outputs.title ?? "Untitled",
      promptUsed: outputs.promptUsed ?? "",
      lyricsOrStructure: outputs.lyricsOrStructure ?? "",
      lyricSync: outputs.lyricSync ?? null,
      audioBase64: outputs.audioBase64 ?? "",
      audioMimeType: outputs.audioMimeType ?? "audio/wav",
    })
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Orchestrator unreachable"
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
