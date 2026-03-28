"use client"

import { useState } from "react"
import { Play, Pause, SkipBack, SkipForward, Volume2 } from "lucide-react"

interface AudioPlayerProps {
  duration: string
}

export function AudioPlayer({ duration }: AudioPlayerProps) {
  const [playing, setPlaying] = useState(false)
  const [progress] = useState(34)

  return (
    <div className="space-y-3">
      {/* Progress bar */}
      <div className="space-y-1.5">
        <div className="relative h-1 w-full overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full rounded-full bg-gradient-to-r from-violet-500 to-indigo-500 transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
          <div
            className="absolute top-1/2 h-3 w-3 -translate-y-1/2 rounded-full bg-white shadow-md transition-all duration-300"
            style={{ left: `calc(${progress}% - 6px)` }}
          />
        </div>
        <div className="flex justify-between text-[11px] text-zinc-500">
          <span>1:16</span>
          <span>{duration}</span>
        </div>
      </div>

      {/* Controls */}
      <div className="flex items-center justify-between">
        <button className="text-zinc-500 transition-colors hover:text-zinc-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 rounded">
          <Volume2 className="h-4 w-4" />
        </button>

        <div className="flex items-center gap-4">
          <button className="text-zinc-400 transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 rounded">
            <SkipBack className="h-4 w-4" />
          </button>

          <button
            onClick={() => setPlaying(!playing)}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-zinc-900 transition-all hover:scale-105 hover:bg-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-900"
            aria-label={playing ? "Pause" : "Play"}
          >
            {playing ? (
              <Pause className="h-4 w-4" />
            ) : (
              <Play className="h-4 w-4 translate-x-0.5" />
            )}
          </button>

          <button className="text-zinc-400 transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 rounded">
            <SkipForward className="h-4 w-4" />
          </button>
        </div>

        <div className="w-4" aria-hidden />
      </div>
    </div>
  )
}
