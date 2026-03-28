"use client"

import type {
  ActiveLineResult,
  LyricModeInfo,
  ParsedLyricItem,
} from "@/lib/types"

interface LyricDebugPanelProps {
  items: ParsedLyricItem[]
  modeInfo: LyricModeInfo
  activeResult: ActiveLineResult | null
  currentSection: string | null
  currentTime: number
  filtered: string[]
  scrollDecision: string
}

export function LyricDebugPanel({
  items,
  modeInfo,
  activeResult,
  currentSection,
  currentTime,
  filtered,
  scrollDecision,
}: LyricDebugPanelProps) {
  const lines = items.filter((it) => it.type === "line")
  const sections = items.filter((it) => it.type === "section")
  const realTimed = lines.filter(
    (it) => it.type === "line" && it.timingSource === "real"
  )
  const synthetic = lines.filter(
    (it) => it.type === "line" && it.timingSource === "synthetic"
  )

  const activeItem = activeResult?.activeLineId
    ? items.find((it) => it.id === activeResult.activeLineId)
    : null

  const prevItem = activeResult?.previousLineId
    ? items.find((it) => it.id === activeResult.previousLineId)
    : null
  const nextItem = activeResult?.nextLineId
    ? items.find((it) => it.id === activeResult.nextLineId)
    : null

  return (
    <div className="w-56 shrink-0 overflow-y-auto rounded-lg border border-white/5 bg-black/40 p-3 text-[10px] font-mono leading-relaxed text-zinc-500 max-h-52 scrollbar-thin scrollbar-track-transparent scrollbar-thumb-white/10">
      <p className="mb-2 font-sans text-[9px] font-semibold uppercase tracking-widest text-zinc-600">
        Lyric Debug
      </p>

      <Row label="time" value={currentTime.toFixed(2) + "s"} />
      <Row
        label="mode"
        value={modeInfo.mode}
        highlight={modeInfo.mode === "timed"}
      />
      <Row label="mode reason" value={modeInfo.reason} />
      <Row label="section" value={currentSection ?? "—"} />

      <div className="my-1.5 border-t border-white/5" />

      <Row
        label="active id"
        value={activeResult?.activeLineId ?? "none"}
        highlight={!!activeResult?.activeLineId}
      />
      <Row
        label="active text"
        value={
          activeItem?.type === "line"
            ? trunc(activeItem.text, 26)
            : "—"
        }
      />
      <Row label="reason" value={activeResult?.reason ?? "—"} />

      {activeItem?.type === "line" &&
        activeItem.start !== undefined && (
          <Row
            label="timing"
            value={`${activeItem.start.toFixed(1)}–${activeItem.end?.toFixed(1) ?? "?"}s (${activeItem.timingSource})`}
          />
        )}

      <div className="my-1.5 border-t border-white/5" />

      <Row
        label="prev line"
        value={prevItem ? trunc(prevItem.text, 24) : "—"}
      />
      <Row
        label="next line"
        value={nextItem ? trunc(nextItem.text, 24) : "—"}
      />
      <Row label="scroll" value={scrollDecision} />

      <div className="my-1.5 border-t border-white/5" />

      <Row label="total items" value={String(items.length)} />
      <Row label="sections" value={String(sections.length)} />
      <Row label="lines" value={String(lines.length)} />
      <Row label="real timed" value={String(realTimed.length)} />
      <Row label="syncable" value={String(modeInfo.syncableCount)} />

      {synthetic.length > 0 && (
        <Row
          label="synthetic"
          value={`${synthetic.length} (ignored)`}
        />
      )}

      {modeInfo.warnings.length > 0 && (
        <>
          <div className="my-1.5 border-t border-white/5" />
          <p className="mb-1 text-amber-600">warnings:</p>
          {modeInfo.warnings.map((w, i) => (
            <p key={i} className="text-amber-700 break-words">
              {w}
            </p>
          ))}
        </>
      )}

      {filtered.length > 0 && (
        <>
          <div className="my-1.5 border-t border-white/5" />
          <p className="mb-1 text-zinc-600">
            filtered ({filtered.length}):
          </p>
          {filtered.slice(0, 5).map((f, i) => (
            <p key={i} className="truncate text-zinc-700">
              {f}
            </p>
          ))}
          {filtered.length > 5 && (
            <p className="text-zinc-700">
              …+{filtered.length - 5} more
            </p>
          )}
        </>
      )}
    </div>
  )
}

function Row({
  label,
  value,
  highlight,
}: {
  label: string
  value: string
  highlight?: boolean
}) {
  return (
    <div className="flex justify-between gap-2">
      <span className="text-zinc-600 shrink-0">{label}</span>
      <span
        className={`truncate text-right ${highlight ? "text-violet-400" : ""}`}
      >
        {value}
      </span>
    </div>
  )
}

function trunc(s: string, n: number): string {
  return s.length > n ? s.slice(0, n) + "…" : s
}
