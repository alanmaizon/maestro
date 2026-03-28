import type { ParsedLyricItem, SyncedLine, TimingSource } from "@/lib/types"
import {
  normalizeLyricText,
  shouldFilterLyricLine,
} from "@/lib/lyrics/clean-raw-lyrics"

/**
 * Section headers: [Verse], [Chorus 2], (Bridge), **Outro**, etc.
 * Tested AFTER timestamp stripping and markdown removal, so these
 * won't false-match numeric brackets like [0.0:2.6].
 */
const SECTION_RE =
  /^\s*(?:\[|\(|\*{1,2})\s*(verse|chorus|bridge|outro|intro|pre[- ]?chorus|hook|refrain|interlude|solo|instrumental|breakdown|post[- ]?chorus|tag|coda)(?:\s*\d*)?\s*(?:\]|\)|\*{1,2})\s*$/i

const BARE_SECTION_RE =
  /^\s*(verse|chorus|bridge|outro|intro|pre[- ]?chorus|hook|refrain|interlude|solo|instrumental|breakdown|post[- ]?chorus|tag|coda)(?:\s*\d*)?\s*[:\-]?\s*$/i

function isSection(text: string): boolean {
  return SECTION_RE.test(text) || BARE_SECTION_RE.test(text)
}

export interface ParseResult {
  items: ParsedLyricItem[]
  filtered: string[]
}

/**
 * Parse raw lyrics text into structured display items.
 *
 * Every line is first cleaned via normalizeLyricText (strips timestamps,
 * markdown, metadata) then checked via shouldFilterLyricLine. Only
 * singable lines and section headers survive.
 *
 * If `syncedLines` (from the alignment service) is provided, timing
 * is matched to lines by stable id. Lines that match get
 * `timingSource: "real"` with confidence; others get "none".
 */
export function parseLyrics(
  rawText: string,
  syncedLines?: SyncedLine[]
): ParseResult {
  const items: ParsedLyricItem[] = []
  const filtered: string[] = []

  // Build timing lookup keyed by id from the aligner
  const timingById = new Map<
    string,
    { start: number; end: number; confidence: number }
  >()
  const timingTextById = new Map<string, string>()
  // Also build a fallback lookup by normalized text
  const timingByText = new Map<
    string,
    { start: number; end: number; confidence: number }
  >()
  const ambiguousTextKeys = new Set<string>()

  if (syncedLines) {
    for (const sl of syncedLines) {
      const key = normalizeLyricText(sl.text).toLowerCase()

      timingById.set(sl.id, {
        start: sl.start,
        end: sl.end,
        confidence: sl.confidence,
      })

      if (key) {
        timingTextById.set(sl.id, key)
      }

      if (!key || ambiguousTextKeys.has(key)) {
        continue
      }

      if (timingByText.has(key)) {
        timingByText.delete(key)
        ambiguousTextKeys.add(key)
      } else {
        timingByText.set(key, {
          start: sl.start,
          end: sl.end,
          confidence: sl.confidence,
        })
      }
    }
  }

  const sourceLines = rawText.split("\n")
  let sectionCount = 0
  let lineCount = 0

  for (let i = 0; i < sourceLines.length; i++) {
    const raw = sourceLines[i]

    // Normalize: strip timestamps, markdown, collapse whitespace
    const normalized = normalizeLyricText(raw)

    // Skip empty lines
    if (!normalized) continue

    // Skip metadata, arrangement prose, junk, directions, prose
    if (shouldFilterLyricLine(normalized)) {
      filtered.push(normalized)
      continue
    }

    // Section headers
    if (isSection(normalized)) {
      sectionCount++
      items.push({
        id: `sec-${sectionCount}`,
        type: "section",
        text: normalized.replace(/^[[\]()*]+|[[\]()*]+$/g, "").trim(),
        normalizedText: normalized.toLowerCase(),
        originalIndex: i,
      })
      continue
    }

    // Singable lyric line
    lineCount++
    const lineId = `ln-${lineCount}`
    const normKey = normalized.toLowerCase()

    const idTiming = timingById.get(lineId)
    const idTimingText = timingTextById.get(lineId)
    const hasTrustedIdMatch = idTiming && idTimingText === normKey

    // Trust id matches only when the cleaned text also lines up.
    // Otherwise fall back to unique text matches to avoid shifted timing.
    const timing =
      (hasTrustedIdMatch ? idTiming : undefined) ?? timingByText.get(normKey)
    const timingSource: TimingSource = timing ? "real" : "none"

    items.push({
      id: lineId,
      type: "line",
      text: normalized,
      normalizedText: normKey,
      originalIndex: i,
      start: timing?.start,
      end: timing?.end,
      confidence: timing?.confidence,
      timingSource,
    })
  }

  return { items, filtered }
}
