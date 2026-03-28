"use client"

import { useCallback, useEffect, useRef } from "react"

export type VisMode = "bars" | "line" | "spectrum"

interface ReactiveVisualizerProps {
  frequencyData: Uint8Array
  timeDomainData: Uint8Array
  mode: VisMode
  playing: boolean
}

/** Canvas DPR helper — draw at native resolution, display at CSS size. */
function setupCanvas(canvas: HTMLCanvasElement) {
  const dpr = window.devicePixelRatio || 1
  const rect = canvas.getBoundingClientRect()
  canvas.width = rect.width * dpr
  canvas.height = rect.height * dpr
  const ctx = canvas.getContext("2d")!
  ctx.scale(dpr, dpr)
  return { ctx, w: rect.width, h: rect.height }
}

const VIOLET = "rgba(139, 92, 246,"
const INDIGO = "rgba(99, 102, 241,"

export function ReactiveVisualizer({
  frequencyData,
  timeDomainData,
  mode,
  playing,
}: ReactiveVisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const prevDataRef = useRef<Uint8Array | null>(null)

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const { ctx, w, h } = setupCanvas(canvas)

    ctx.clearRect(0, 0, w, h)

    // When paused, blend toward the last frame to create a gentle freeze
    const data = playing
      ? frequencyData
      : prevDataRef.current ?? frequencyData

    if (playing) prevDataRef.current = new Uint8Array(frequencyData)

    if (mode === "bars") {
      drawBars(ctx, data, w, h)
    } else if (mode === "line") {
      drawLine(ctx, timeDomainData, w, h, playing)
    } else {
      drawSpectrum(ctx, data, w, h)
    }
  }, [frequencyData, timeDomainData, mode, playing])

  useEffect(() => {
    draw()
  }, [draw])

  // Redraw on resize
  useEffect(() => {
    const handler = () => draw()
    window.addEventListener("resize", handler)
    return () => window.removeEventListener("resize", handler)
  }, [draw])

  return (
    <canvas
      ref={canvasRef}
      className="h-16 w-full rounded-lg"
      aria-hidden
    />
  )
}

/* ── Bars: vertical equalizer ──────────────────────────────────────── */

function drawBars(
  ctx: CanvasRenderingContext2D,
  data: Uint8Array,
  w: number,
  h: number
) {
  const count = Math.min(data.length, 48)
  const gap = 2
  const barW = (w - gap * (count - 1)) / count

  for (let i = 0; i < count; i++) {
    const val = data[i] / 255
    const barH = Math.max(2, val * h * 0.9)
    const x = i * (barW + gap)
    const y = h - barH

    const grad = ctx.createLinearGradient(x, h, x, y)
    grad.addColorStop(0, `${VIOLET} 0.6)`)
    grad.addColorStop(1, `${INDIGO} 0.15)`)
    ctx.fillStyle = grad

    ctx.beginPath()
    ctx.roundRect(x, y, barW, barH, 1.5)
    ctx.fill()
  }
}

/* ── Line: analog oscilloscope ─────────────────────────────────────── */

function drawLine(
  ctx: CanvasRenderingContext2D,
  data: Uint8Array,
  w: number,
  h: number,
  playing: boolean
) {
  const len = data.length
  const sliceW = w / len

  ctx.lineWidth = 2
  ctx.strokeStyle = `${VIOLET} ${playing ? 0.7 : 0.3})`
  ctx.shadowColor = `${VIOLET} 0.4)`
  ctx.shadowBlur = playing ? 8 : 2

  ctx.beginPath()

  for (let i = 0; i < len; i++) {
    const v = data[i] / 128.0
    const y = (v * h) / 2
    if (i === 0) ctx.moveTo(0, y)
    else ctx.lineTo(i * sliceW, y)
  }

  ctx.stroke()
  ctx.shadowBlur = 0
}

/* ── Spectrum: digital reactive bands ──────────────────────────────── */

function drawSpectrum(
  ctx: CanvasRenderingContext2D,
  data: Uint8Array,
  w: number,
  h: number
) {
  const bands = 32
  const step = Math.floor(data.length / bands)
  const gap = 3
  const bandW = (w - gap * (bands - 1)) / bands

  for (let i = 0; i < bands; i++) {
    // Average a slice of frequency bins into one band
    let sum = 0
    for (let j = 0; j < step; j++) sum += data[i * step + j]
    const val = sum / step / 255

    const barH = Math.max(2, val * h * 0.85)
    const x = i * (bandW + gap)
    // Center vertically
    const y = (h - barH) / 2

    const grad = ctx.createLinearGradient(x, y, x, y + barH)
    grad.addColorStop(0, `${INDIGO} 0.5)`)
    grad.addColorStop(0.5, `${VIOLET} 0.6)`)
    grad.addColorStop(1, `${INDIGO} 0.15)`)
    ctx.fillStyle = grad

    ctx.beginPath()
    ctx.roundRect(x, y, bandW, barH, 2)
    ctx.fill()
  }
}
