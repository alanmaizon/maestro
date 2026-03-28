"use client"

import { useCallback, useRef, useState } from "react"

interface WaveformTimelineProps {
  /** Normalized amplitude bars (0–1), one per bar */
  bars: number[]
  /** 0–1 progress through the track */
  progress: number
  /** Called with a 0–1 ratio when user clicks/drags */
  onSeek: (ratio: number) => void
}

export function WaveformTimeline({
  bars,
  progress,
  onSeek,
}: WaveformTimelineProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [hoverRatio, setHoverRatio] = useState<number | null>(null)
  const [dragging, setDragging] = useState(false)

  const ratioFromEvent = useCallback(
    (e: React.MouseEvent | MouseEvent) => {
      const el = containerRef.current
      if (!el) return 0
      const rect = el.getBoundingClientRect()
      return Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
    },
    []
  )

  const handlePointerDown = useCallback(
    (e: React.MouseEvent) => {
      setDragging(true)
      const r = ratioFromEvent(e)
      onSeek(r)

      const handleMove = (ev: MouseEvent) => {
        onSeek(ratioFromEvent(ev))
      }
      const handleUp = () => {
        setDragging(false)
        window.removeEventListener("mousemove", handleMove)
        window.removeEventListener("mouseup", handleUp)
      }

      window.addEventListener("mousemove", handleMove)
      window.addEventListener("mouseup", handleUp)
    },
    [onSeek, ratioFromEvent]
  )

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!dragging) setHoverRatio(ratioFromEvent(e))
    },
    [dragging, ratioFromEvent]
  )

  return (
    <div
      ref={containerRef}
      role="slider"
      tabIndex={0}
      aria-label="Track timeline"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(progress * 100)}
      className="group relative flex h-12 cursor-pointer items-end gap-[1.5px] rounded-lg px-0.5"
      onMouseDown={handlePointerDown}
      onMouseMove={handleMouseMove}
      onMouseLeave={() => setHoverRatio(null)}
      onKeyDown={(e) => {
        if (e.key === "ArrowRight") onSeek(Math.min(1, progress + 0.02))
        if (e.key === "ArrowLeft") onSeek(Math.max(0, progress - 0.02))
      }}
    >
      {bars.map((amp, i) => {
        const ratio = i / bars.length
        const isPlayed = ratio < progress
        const isHovered =
          hoverRatio !== null && ratio <= hoverRatio && ratio >= progress

        // Min 6% height so silence is still visible as a thin bar
        const height = `${Math.max(6, amp * 100)}%`

        return (
          <div
            key={i}
            className="flex-1 origin-bottom rounded-[1px] transition-colors duration-150"
            style={{ height }}
          >
            <div
              className={`h-full w-full rounded-[1px] transition-colors duration-150 ${
                isPlayed
                  ? "bg-violet-500"
                  : isHovered
                    ? "bg-violet-500/35"
                    : "bg-white/12 group-hover:bg-white/16"
              }`}
            />
          </div>
        )
      })}

      {/* Playhead line */}
      <div
        className="pointer-events-none absolute top-0 h-full w-[2px] rounded-full bg-white shadow-[0_0_6px_rgba(139,92,246,0.5)] transition-[left] duration-100"
        style={{ left: `${progress * 100}%` }}
      />
    </div>
  )
}
