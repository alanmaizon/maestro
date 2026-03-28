"use client"

import { useCallback, useMemo, useRef, useState } from "react"
import type { GeneratedResult } from "@/lib/types"
import { useWaveformData, useAnalyser } from "@/lib/use-audio-analysis"
import { WaveformTimeline } from "@/components/player/waveform-timeline"
import {
  ReactiveVisualizer,
  type VisMode,
} from "@/components/player/reactive-visualizer"
import { SyncedLyrics } from "@/components/player/synced-lyrics"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Activity,
  AudioLines,
  BarChart3,
  Download,
  Pause,
  Play,
  Share2,
  Sparkles,
} from "lucide-react"

/* ── helpers ─────────────────────────────────────────────────────── */

interface SongResultProps {
  result: GeneratedResult | null
  loading: boolean
  error: string | null
}

function fmt(seconds: number) {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, "0")}`
}

const VIS_MODES: { value: VisMode; icon: typeof BarChart3; label: string }[] = [
  { value: "bars", icon: BarChart3, label: "Bars" },
  { value: "line", icon: Activity, label: "Line" },
  { value: "spectrum", icon: AudioLines, label: "Spectrum" },
]

/* ── component ───────────────────────────────────────────────────── */

export function SongResult({ result, loading, error }: SongResultProps) {
  const audioRef = useRef<HTMLAudioElement>(null)
  const [playing, setPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [visMode, setVisMode] = useState<VisMode>("bars")

  const audioSrc = useMemo(
    () =>
      result
        ? `data:${result.audioMimeType};base64,${result.audioBase64}`
        : "",
    [result]
  )

  const waveformBars = useWaveformData(audioSrc)
  const { frequencyData, timeDomainData } = useAnalyser(audioRef, playing)

  const toggle = useCallback(() => {
    const audio = audioRef.current
    if (!audio) return
    if (playing) {
      audio.pause()
      setPlaying(false)
    } else {
      audio.play().catch(() => {})
      setPlaying(true)
    }
  }, [playing])

  const seek = useCallback(
    (time: number) => {
      const audio = audioRef.current
      if (!audio) return
      audio.currentTime = time
      setCurrentTime(time)
      if (!audio.paused) return
      audio.play().catch(() => {})
      setPlaying(true)
    },
    []
  )

  const seekRatio = useCallback(
    (ratio: number) => {
      if (duration > 0) seek(ratio * duration)
    },
    [duration, seek]
  )

  /* ── empty / loading / error states ──────────────────────────── */

  if (loading) {
    return (
      <div className="flex min-h-[320px] flex-col items-center justify-center gap-4 rounded-2xl border border-white/5 bg-zinc-900/40">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-white/10 border-t-violet-500" />
        <div className="space-y-1 text-center">
          <p className="text-sm font-medium text-white">Composing your song…</p>
          <p className="text-xs text-zinc-500">This usually takes a moment</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex min-h-[320px] flex-col items-center justify-center gap-3 rounded-2xl border border-red-500/20 bg-red-950/20">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-900/40">
          <Sparkles className="h-5 w-5 text-red-400" />
        </div>
        <div className="space-y-1 text-center">
          <p className="text-sm font-medium text-red-300">Generation failed</p>
          <p className="max-w-sm text-xs text-red-400/70">{error}</p>
        </div>
      </div>
    )
  }

  if (!result) {
    return (
      <div className="flex min-h-[320px] flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-white/10 bg-zinc-900/20">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-zinc-800/60">
          <Sparkles className="h-5 w-5 text-zinc-500" />
        </div>
        <div className="space-y-1 text-center">
          <p className="text-sm font-medium text-zinc-300">
            Your song will appear here
          </p>
          <p className="text-xs text-zinc-600">
            Describe what you&apos;re imagining and hit Generate
          </p>
        </div>
      </div>
    )
  }

  /* ── generated result ────────────────────────────────────────── */

  const progress = duration > 0 ? currentTime / duration : 0

  return (
    <div className="overflow-hidden rounded-2xl border border-white/8 bg-zinc-900/60">
      {/* Shared audio element */}
      <audio
        ref={audioRef}
        src={audioSrc}
        onTimeUpdate={() =>
          setCurrentTime(audioRef.current?.currentTime ?? 0)
        }
        onLoadedMetadata={() =>
          setDuration(audioRef.current?.duration ?? 0)
        }
        onEnded={() => setPlaying(false)}
      />

      <div className="flex flex-col gap-6 p-6 md:flex-row md:gap-8">
        {/* Cover art */}
        <div className="shrink-0">
          <div className="h-40 w-40 rounded-xl bg-gradient-to-br from-violet-900 via-indigo-900 to-slate-900 ring-1 ring-white/10" />
        </div>

        {/* Main info + player */}
        <div className="flex flex-1 flex-col gap-4">
          <div className="space-y-2">
            <Badge
              variant="secondary"
              className="bg-violet-500/15 text-violet-300 border-violet-500/20 text-[11px]"
            >
              AI Generated
            </Badge>
            <h2 className="text-xl font-semibold text-white">
              {result.title}
            </h2>
          </div>

          {/* Waveform timeline (seekable) */}
          <div className="space-y-1.5">
            {waveformBars ? (
              <WaveformTimeline
                bars={waveformBars}
                progress={progress}
                onSeek={seekRatio}
              />
            ) : (
              /* Fallback: thin progress bar while waveform decodes */
              <div className="relative h-12 flex items-end rounded-lg">
                <div className="relative h-1 w-full overflow-hidden rounded-full bg-white/10">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-violet-500 to-indigo-500 transition-all duration-200"
                    style={{ width: `${progress * 100}%` }}
                  />
                </div>
              </div>
            )}
            <div className="flex justify-between text-[11px] text-zinc-500">
              <span>{fmt(currentTime)}</span>
              <span>{duration > 0 ? fmt(duration) : "--:--"}</span>
            </div>
          </div>

          {/* Transport controls + vis mode toggle */}
          <div className="flex items-center justify-between">
            {/* Vis mode selector */}
            <div className="flex gap-0.5 rounded-lg bg-white/5 p-0.5">
              {VIS_MODES.map(({ value, icon: Icon, label }) => (
                <button
                  key={value}
                  onClick={() => setVisMode(value)}
                  aria-label={label}
                  className={`rounded-md p-1.5 transition-colors ${
                    visMode === value
                      ? "bg-violet-500/20 text-violet-300"
                      : "text-zinc-500 hover:text-zinc-300"
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                </button>
              ))}
            </div>

            {/* Play / pause */}
            <button
              onClick={toggle}
              className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-zinc-900 transition-all hover:scale-105 hover:bg-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-900"
              aria-label={playing ? "Pause" : "Play"}
            >
              {playing ? (
                <Pause className="h-4 w-4" />
              ) : (
                <Play className="h-4 w-4 translate-x-0.5" />
              )}
            </button>

            {/* Spacer to center play button */}
            <div className="w-[76px]" aria-hidden />
          </div>

          {/* Reactive visualizer */}
          <ReactiveVisualizer
            frequencyData={frequencyData}
            timeDomainData={timeDomainData}
            mode={visMode}
            playing={playing}
          />

          {/* Actions */}
          <div className="flex gap-2">
            <a
              href={audioSrc}
              download={`${result.title}.wav`}
              className="inline-flex h-9 items-center gap-1.5 rounded-md px-3 text-sm bg-white/6 text-zinc-300 hover:bg-white/10 hover:text-white transition-colors"
            >
              <Download className="h-3.5 w-3.5" />
              Download
            </a>
            <Button
              size="sm"
              variant="secondary"
              className="gap-1.5 bg-white/6 text-zinc-300 hover:bg-white/10 hover:text-white border-0"
            >
              <Share2 className="h-3.5 w-3.5" />
              Share
            </Button>
          </div>
        </div>
      </div>

      {/* Lyrics panel */}
      <div className="border-t border-white/5 bg-black/20 px-6 py-4">
        <p className="mb-2 text-[11px] font-medium uppercase tracking-wider text-zinc-500">
          Lyrics
        </p>
        <SyncedLyrics
          rawText={result.lyricsOrStructure}
          lyricSync={result.lyricSync}
          currentTime={currentTime}
          onSeek={seek}
        />
      </div>
    </div>
  )
}
