export interface Song {
  id: string
  title: string
  genre: string
  duration: string
  mood: string
  lyricsPreview: string
  coverGradient: string
}

export const generatedSong: Song = {
  id: "gen-1",
  title: "Midnight Drive",
  genre: "Lo-fi Hip Hop",
  duration: "3:42",
  mood: "Melancholic",
  lyricsPreview: `Streetlights blur as the city sleeps
Headlights cut through the quiet streets
Radio hum and the engine's breath
Somewhere between the alive and the dead

Rolling through the neon dark
A constellation made of sparks
Nothing left to say tonight
Just the road and fading light`,
  coverGradient: "from-violet-900 via-indigo-900 to-slate-900",
}

export const recentSongs: Song[] = [
  {
    id: "r-1",
    title: "Golden Hour",
    genre: "Indie Pop",
    duration: "2:58",
    mood: "Warm",
    lyricsPreview: "",
    coverGradient: "from-amber-800 via-orange-900 to-rose-900",
  },
  {
    id: "r-2",
    title: "Neon Lights",
    genre: "Synthwave",
    duration: "4:12",
    mood: "Energetic",
    lyricsPreview: "",
    coverGradient: "from-cyan-900 via-blue-900 to-violet-900",
  },
  {
    id: "r-3",
    title: "Still Water",
    genre: "Ambient",
    duration: "5:30",
    mood: "Calm",
    lyricsPreview: "",
    coverGradient: "from-teal-900 via-slate-900 to-zinc-900",
  },
]
