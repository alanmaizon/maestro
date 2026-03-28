"use client"

import { useState } from "react"
import { Song } from "@/lib/mock-data"
import { Badge } from "@/components/ui/badge"
import { Play, Pause } from "lucide-react"

interface SongCardProps {
  song: Song
}

export function SongCard({ song }: SongCardProps) {
  const [playing, setPlaying] = useState(false)

  return (
    <div className="group relative overflow-hidden rounded-xl border border-white/6 bg-zinc-900/40 p-4 transition-all duration-200 hover:border-white/12 hover:bg-zinc-900/70">
      <div className="flex items-center gap-3">
        {/* Mini cover */}
        <div className="relative shrink-0">
          <div
            className={`h-12 w-12 rounded-lg bg-gradient-to-br ${song.coverGradient} ring-1 ring-white/10`}
          />
          <button
            onClick={() => setPlaying(!playing)}
            className="absolute inset-0 flex items-center justify-center rounded-lg bg-black/50 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
            aria-label={playing ? "Pause" : "Play"}
          >
            {playing ? (
              <Pause className="h-4 w-4 text-white" />
            ) : (
              <Play className="h-4 w-4 translate-x-0.5 text-white" />
            )}
          </button>
        </div>

        {/* Info */}
        <div className="min-w-0 flex-1 space-y-1">
          <p className="truncate text-sm font-medium text-white">{song.title}</p>
          <div className="flex items-center gap-2">
            <Badge
              variant="secondary"
              className="bg-white/5 text-zinc-500 border-white/8 text-[10px] px-1.5 py-0"
            >
              {song.genre}
            </Badge>
            <span className="text-[11px] text-zinc-600">{song.duration}</span>
          </div>
        </div>
      </div>
    </div>
  )
}
