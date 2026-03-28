import { recentSongs } from "@/lib/mock-data"
import { SongCard } from "@/components/song-card"
import { Clock } from "lucide-react"

export function RecentSongs() {
  return (
    <section className="space-y-4">
      <div className="flex items-center gap-2">
        <Clock className="h-4 w-4 text-zinc-500" />
        <h2 className="text-sm font-medium text-zinc-400">Recent Songs</h2>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {recentSongs.map((song) => (
          <SongCard key={song.id} song={song} />
        ))}
      </div>
    </section>
  )
}
