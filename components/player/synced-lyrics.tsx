"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { ActiveLineResult, LyricSync } from "@/lib/types"
import { parseLyrics } from "@/lib/lyrics/parse-lyrics"
import {
  determineLyricMode,
  resolveActiveLine,
  findCurrentSection,
} from "@/lib/lyrics/resolve-active"
import { LyricDebugPanel } from "@/components/player/lyric-debug-panel"

interface SyncedLyricsProps {
  rawText: string
  lyricSync?: LyricSync
  currentTime: number
  onSeek: (time: number) => void
}

const SCROLL_THROTTLE_MS = 300

export function SyncedLyrics({
  rawText,
  lyricSync,
  currentTime,
  onSeek,
}: SyncedLyricsProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const itemRefs = useRef<Map<string, HTMLElement>>(new Map())
  const lastScrollTime = useRef(0)
  const [showDebug, setShowDebug] = useState(false)
  const [scrollDecision, setScrollDecision] = useState("—")

  // A. Parse lyrics, passing aligned lines if the aligner returned synced
  const syncedLines =
    lyricSync?.mode === "synced" ? lyricSync.lines : undefined

  const { items, filtered } = useMemo(
    () => parseLyrics(rawText, syncedLines),
    [rawText, syncedLines]
  )

  // B. Determine mode from parsed items (validates timing quality)
  const modeInfo = useMemo(() => determineLyricMode(items), [items])
  const isTimed = modeInfo.mode === "timed"

  // Propagate aligner warnings into modeInfo
  const enrichedModeInfo = useMemo(() => {
    const alignerWarnings = lyricSync?.warnings ?? []
    const alignerReason =
      lyricSync?.mode === "unsynced" && lyricSync.reason
        ? lyricSync.reason
        : null

    return {
      ...modeInfo,
      warnings: [
        ...modeInfo.warnings,
        ...alignerWarnings,
        ...(alignerReason && !isTimed
          ? [`aligner: ${alignerReason}`]
          : []),
      ],
    }
  }, [modeInfo, lyricSync, isTimed])

  // C. Resolve active line (timed mode only)
  const activeResult: ActiveLineResult | null = useMemo(() => {
    if (!isTimed) return null
    return resolveActiveLine(items, currentTime)
  }, [items, currentTime, isTimed])

  const setScrollDecisionDeferred = useCallback((value: string) => {
    requestAnimationFrame(() => {
      setScrollDecision((prev) => (prev === value ? prev : value))
    })
  }, [])

  const currentSection =
    isTimed && activeResult?.activeLineId
      ? findCurrentSection(items, activeResult.activeLineId)
      : null

  // D. Scroll by id (timed mode only)
  useEffect(() => {
    if (!isTimed || !activeResult?.activeLineId) return

    const now = Date.now()
    if (now - lastScrollTime.current < SCROLL_THROTTLE_MS) {
      setScrollDecisionDeferred("throttled")
      return
    }

    const el = itemRefs.current.get(activeResult.activeLineId)
    const container = containerRef.current
    if (!el || !container) {
      setScrollDecisionDeferred("ref missing")
      return
    }

    const scrollTop = container.scrollTop
    const containerHeight = container.clientHeight
    const elHeight = el.offsetHeight
    const elTop =
      el.getBoundingClientRect().top -
      container.getBoundingClientRect().top +
      scrollTop

    const viewTop = scrollTop + containerHeight * 0.2
    const viewBottom = scrollTop + containerHeight * 0.8
    const elCenter = elTop + elHeight / 2

    if (elCenter >= viewTop && elCenter <= viewBottom) {
      setScrollDecisionDeferred("in view")
      return
    }

    const target = elTop - containerHeight / 2 + elHeight / 2
    container.scrollTo({ top: Math.max(0, target), behavior: "smooth" })
    lastScrollTime.current = now
    setScrollDecisionDeferred(`scrolled to ${activeResult.activeLineId}`)
  }, [isTimed, activeResult, setScrollDecisionDeferred])

  const setRef = useCallback(
    (id: string) => (el: HTMLElement | null) => {
      if (el) itemRefs.current.set(id, el)
      else itemRefs.current.delete(id)
    },
    []
  )

  // ── Empty ────────────────────────────────────────────────────
  if (items.length === 0) {
    return (
      <p className="text-sm text-zinc-500 italic">No lyrics available.</p>
    )
  }

  // ── Untimed mode ─────────────────────────────────────────────
  if (!isTimed) {
    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="inline-flex items-center gap-1.5 rounded-md bg-white/5 px-2 py-0.5 text-[10px] text-zinc-500">
            Unsynced lyrics
          </span>
          <button
            onClick={() => setShowDebug((v) => !v)}
            className="text-[10px] text-zinc-600 hover:text-zinc-400 transition-colors"
          >
            {showDebug ? "Hide debug" : "Debug"}
          </button>
        </div>

        <div className="flex gap-3">
          <div className="flex-1 space-y-1 max-h-52 overflow-y-auto scrollbar-thin scrollbar-track-transparent scrollbar-thumb-white/10">
            {items.map((item) =>
              item.type === "section" ? (
                <p
                  key={item.id}
                  className="pt-3 pb-1 text-[10px] font-semibold uppercase tracking-widest text-zinc-600"
                >
                  {item.text}
                </p>
              ) : (
                <p
                  key={item.id}
                  className="text-sm leading-relaxed text-zinc-400"
                >
                  {item.text}
                </p>
              )
            )}
          </div>

          {showDebug && (
            <LyricDebugPanel
              items={items}
              modeInfo={enrichedModeInfo}
              activeResult={null}
              currentSection={null}
              currentTime={currentTime}
              filtered={filtered}
              scrollDecision="disabled (untimed)"
            />
          )}
        </div>
      </div>
    )
  }

  // ── Timed mode ───────────────────────────────────────────────
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {currentSection && (
            <span className="text-[10px] font-semibold uppercase tracking-widest text-violet-400/60">
              {currentSection}
            </span>
          )}
          <span className="inline-flex items-center gap-1 rounded-md bg-violet-500/10 px-2 py-0.5 text-[10px] text-violet-400">
            Synced
          </span>
        </div>
        <button
          onClick={() => setShowDebug((v) => !v)}
          className="text-[10px] text-zinc-600 hover:text-zinc-400 transition-colors"
        >
          {showDebug ? "Hide debug" : "Debug"}
        </button>
      </div>

      <div className="flex gap-3">
        <div
          ref={containerRef}
          className="max-h-52 flex-1 overflow-y-auto scroll-smooth scrollbar-thin scrollbar-track-transparent scrollbar-thumb-white/10"
        >
          <div className="space-y-0.5 py-2">
            {items.map((item) => {
              if (item.type === "section") {
                return (
                  <p
                    key={item.id}
                    ref={setRef(item.id)}
                    className="pt-3 pb-1 text-[10px] font-semibold uppercase tracking-widest text-zinc-600"
                  >
                    {item.text}
                  </p>
                )
              }

              const isActive = activeResult?.activeLineId === item.id
              const isPast =
                activeResult?.activeLineId &&
                item.timingSource === "real" &&
                item.end !== undefined &&
                currentTime > item.end

              const canSeek =
                item.timingSource === "real" && item.start !== undefined

              return (
                <button
                  key={item.id}
                  ref={setRef(item.id)}
                  onClick={() => {
                    if (canSeek) onSeek(item.start!)
                  }}
                  disabled={!canSeek}
                  className={`
                    block w-full rounded-md px-3 py-1.5 text-left text-sm leading-relaxed
                    transition-all duration-300
                    focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-violet-500
                    ${canSeek ? "cursor-pointer" : "cursor-default"}
                    ${
                      isActive
                        ? "bg-violet-500/10 text-white font-medium"
                        : isPast
                          ? "text-zinc-600 hover:text-zinc-400"
                          : "text-zinc-500 hover:text-zinc-300"
                    }
                  `}
                  aria-current={isActive ? "true" : undefined}
                >
                  {item.text || "\u00A0"}
                </button>
              )
            })}
          </div>
        </div>

        {showDebug && (
          <LyricDebugPanel
            items={items}
            modeInfo={enrichedModeInfo}
            activeResult={activeResult}
            currentSection={currentSection}
            currentTime={currentTime}
            filtered={filtered}
            scrollDecision={scrollDecision}
          />
        )}
      </div>
    </div>
  )
}
