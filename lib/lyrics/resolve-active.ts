import type {
  ActiveLineResult,
  LyricModeInfo,
  ParsedLyricItem,
} from "@/lib/types"

/** Hysteresis — hold on the current line this long after its `end`. */
const HYSTERESIS_S = 0.25

/** Tolerance — consider a recently-started line active this far past its end. */
const TOLERANCE_S = 1.0

/** Minimum real-timed lines required to activate timed mode. */
const MIN_TIMED_LINES = 2

type LineItem = Extract<ParsedLyricItem, { type: "line" }>

// ─── helpers ──────────────────────────────────────────────────────

function getLines(items: ParsedLyricItem[]): LineItem[] {
  return items.filter(
    (it): it is LineItem => it.type === "line"
  )
}

/** Lines with real timing and valid finite start/end where end > start. */
function getSyncableLines(items: ParsedLyricItem[]): LineItem[] {
  return getLines(items).filter(
    (l) =>
      l.timingSource === "real" &&
      l.start !== undefined &&
      l.end !== undefined &&
      Number.isFinite(l.start) &&
      Number.isFinite(l.end) &&
      l.end > l.start
  )
}

// ─── mode determination ───────────────────────────────────────────

/**
 * Determine whether lyrics should be shown in timed or untimed mode.
 * Timed mode requires >= MIN_TIMED_LINES with real, valid, mostly
 * monotonic timing.
 */
export function determineLyricMode(
  items: ParsedLyricItem[]
): LyricModeInfo {
  const allLines = getLines(items)
  const syncable = getSyncableLines(items)
  const warnings: string[] = []

  if (syncable.length < MIN_TIMED_LINES) {
    return {
      mode: "untimed",
      reason:
        syncable.length === 0
          ? "no real-timed lines"
          : `only ${syncable.length} timed line (need ${MIN_TIMED_LINES}+)`,
      syncableCount: syncable.length,
      totalLines: allLines.length,
      warnings,
    }
  }

  // Check monotonicity — allow some out-of-order but warn
  let outOfOrder = 0
  for (let i = 1; i < syncable.length; i++) {
    if (syncable[i].start! < syncable[i - 1].start!) outOfOrder++
  }
  if (outOfOrder > syncable.length * 0.3) {
    warnings.push(
      `${outOfOrder}/${syncable.length} lines out of order — timing may be unreliable`
    )
  }
  if (outOfOrder > syncable.length * 0.5) {
    return {
      mode: "untimed",
      reason: `timing mostly non-monotonic (${outOfOrder}/${syncable.length} reversed)`,
      syncableCount: syncable.length,
      totalLines: allLines.length,
      warnings,
    }
  }

  // Check for synthetic-looking patterns (all equal gaps)
  const gaps = new Set<string>()
  for (let i = 0; i < syncable.length; i++) {
    const gap = (syncable[i].end! - syncable[i].start!).toFixed(2)
    gaps.add(gap)
  }
  if (syncable.length > 4 && gaps.size === 1) {
    warnings.push("all lines have identical duration — timing may be synthetic")
  }

  return {
    mode: "timed",
    reason: `${syncable.length} real-timed lines`,
    syncableCount: syncable.length,
    totalLines: allLines.length,
    warnings,
  }
}

// ─── active line resolver ─────────────────────────────────────────

/**
 * Resolve the currently active lyric line from syncable lines only.
 * Returns ids, never array indexes.
 *
 * Only call this when mode === "timed".
 */
export function resolveActiveLine(
  items: ParsedLyricItem[],
  currentTime: number
): ActiveLineResult {
  const syncable = getSyncableLines(items)

  if (syncable.length === 0) {
    return { activeLineId: null, reason: "no syncable lines", previousLineId: null, nextLineId: null }
  }

  // 1. Exact match: currentTime within [start, end)
  // If multiple overlap, prefer the one with the latest start.
  let exact: LineItem | null = null
  for (const line of syncable) {
    if (currentTime >= line.start! && currentTime < line.end!) {
      if (!exact || line.start! > exact.start!) {
        exact = line
      }
    }
  }

  if (exact) {
    const { prev, next } = neighbors(syncable, exact)
    return {
      activeLineId: exact.id,
      reason: `exact: ${exact.start!.toFixed(1)}–${exact.end!.toFixed(1)}s`,
      previousLineId: prev?.id ?? null,
      nextLineId: next?.id ?? null,
    }
  }

  // 2. Hysteresis: hold the most recently ended line briefly
  let held: LineItem | null = null
  for (const line of syncable) {
    if (
      currentTime >= line.end! &&
      currentTime < line.end! + HYSTERESIS_S
    ) {
      if (!held || line.end! > held.end!) {
        held = line
      }
    }
  }

  if (held) {
    const { prev, next } = neighbors(syncable, held)
    return {
      activeLineId: held.id,
      reason: `hysteresis: holding past ${held.end!.toFixed(1)}s`,
      previousLineId: prev?.id ?? null,
      nextLineId: next?.id ?? null,
    }
  }

  // 3. Nearest recently-started line within tolerance
  let best: LineItem | null = null
  for (const line of syncable) {
    const elapsed = currentTime - line.start!
    const lineDuration = line.end! - line.start!
    if (elapsed >= 0 && elapsed < lineDuration + TOLERANCE_S) {
      if (!best || line.start! > best.start!) {
        best = line
      }
    }
  }

  if (best) {
    const { prev, next } = neighbors(syncable, best)
    return {
      activeLineId: best.id,
      reason: `nearest: started at ${best.start!.toFixed(1)}s`,
      previousLineId: prev?.id ?? null,
      nextLineId: next?.id ?? null,
    }
  }

  return {
    activeLineId: null,
    reason: "no line matches currentTime",
    previousLineId: null,
    nextLineId: null,
  }
}

function neighbors(lines: LineItem[], current: LineItem) {
  const idx = lines.indexOf(current)
  return {
    prev: idx > 0 ? lines[idx - 1] : null,
    next: idx < lines.length - 1 ? lines[idx + 1] : null,
  }
}

/**
 * Find the section header that precedes a given item id.
 */
export function findCurrentSection(
  items: ParsedLyricItem[],
  activeId: string
): string | null {
  const idx = items.findIndex((it) => it.id === activeId)
  if (idx === -1) return null
  for (let i = idx - 1; i >= 0; i--) {
    if (items[i].type === "section") return items[i].text
  }
  return null
}
