import { GoogleGenAI } from "@google/genai"
import { NextRequest, NextResponse } from "next/server"
import { writeFile, mkdir } from "fs/promises"
import { join } from "path"
import { tmpdir } from "os"
import type { GenerateRequest, LyricSync } from "@/lib/types"

const ALIGNMENT_URL =
  process.env.ALIGNMENT_SERVICE_URL ?? "http://localhost:8090"

export async function POST(req: NextRequest) {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    return NextResponse.json(
      { error: "GEMINI_API_KEY is not configured on the server." },
      { status: 500 }
    )
  }

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

  const MODEL_MAP: Record<string, string> = {
    "Lyria 3 Pro (~3 min)": "lyria-3-pro-preview",
    "Lyria 3 Clip (~30 sec)": "lyria-3-clip-preview",
  }
  const model = (length && MODEL_MAP[length]) ?? "lyria-3-pro-preview"

  const composedPrompt = [
    "Create a polished original song.",
    mood ? `Mood: ${mood}.` : "",
    `Vocals: ${vocals ? "yes" : "instrumental only"}.`,
    `Inspiration: ${prompt.trim()}.`,
  ]
    .filter(Boolean)
    .join(" ")

  const ai = new GoogleGenAI({ apiKey })

  try {
    // ── 1. Generate song via Lyria ────────────────────────────────
    const response = await ai.models.generateContent({
      model,
      contents: [{ role: "user", parts: [{ text: composedPrompt }] }],
      config: {
        responseModalities: ["AUDIO", "TEXT"],
      },
    })

    let lyricsOrStructure = ""
    let audioBase64 = ""
    let audioMimeType = "audio/wav"

    for (const part of response.candidates?.[0]?.content?.parts ?? []) {
      if (part.text) {
        lyricsOrStructure += part.text
      } else if (part.inlineData && !audioBase64) {
        audioBase64 = part.inlineData.data ?? ""
        audioMimeType = part.inlineData.mimeType ?? "audio/wav"
      }
    }

    if (!audioBase64) {
      return NextResponse.json(
        { error: "No audio was returned from the provider." },
        { status: 502 }
      )
    }

    // ── 2. Extract title ──────────────────────────────────────────
    let title = ""
    const titleMatch = lyricsOrStructure.match(/^title:\s*(.+)/im)
    if (titleMatch) {
      title = titleMatch[1].trim()
      lyricsOrStructure = lyricsOrStructure
        .replace(/^title:\s*.+\n?/im, "")
        .trim()
    }
    if (!title) {
      const words = prompt.trim().split(/\s+/).slice(0, 4).join(" ")
      title = words.charAt(0).toUpperCase() + words.slice(1)
    }

    const trimmedLyrics =
      lyricsOrStructure.trim() || "No lyrics generated."

    // ── 3. Save audio to temp file for alignment ──────────────────
    const ext = audioMimeType.includes("wav") ? "wav" : "mp3"
    const audioDir = join(tmpdir(), "maestro-audio")
    await mkdir(audioDir, { recursive: true })
    const audioPath = join(
      audioDir,
      `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
    )
    await writeFile(audioPath, Buffer.from(audioBase64, "base64"))

    // ── 4. Call alignment service (best-effort) ───────────────────
    let lyricSync: LyricSync | undefined

    try {
      const alignRes = await fetch(`${ALIGNMENT_URL}/align-lyrics`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          audioPath,
          lyricsText: trimmedLyrics,
        }),
        signal: AbortSignal.timeout(120_000),
      })

      if (alignRes.ok) {
        lyricSync = (await alignRes.json()) as LyricSync
      } else {
        const errBody = await alignRes.text().catch(() => "")
        lyricSync = {
          mode: "unsynced",
          reason: `alignment service returned ${alignRes.status}: ${errBody.slice(0, 120)}`,
          lines: [],
          warnings: [],
        }
      }
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : "alignment service unreachable"
      lyricSync = {
        mode: "unsynced",
        reason: msg,
        lines: [],
        warnings: [],
      }
    }

    // ── 5. Return result ──────────────────────────────────────────
    return NextResponse.json({
      title,
      promptUsed: composedPrompt,
      lyricsOrStructure: trimmedLyrics,
      lyricSync,
      audioBase64,
      audioMimeType,
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Provider error."
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
