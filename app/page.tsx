"use client"

import { useState } from "react"
import { Nav } from "@/components/nav"
import { PromptForm } from "@/components/prompt-form"
import { SongResult } from "@/components/song-result"
import { RecentSongs } from "@/components/recent-songs"
import type { GeneratedResult, GenerateRequest } from "@/lib/types"

export default function Home() {
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<GeneratedResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleGenerate = async (params: GenerateRequest) => {
    setLoading(true)
    setResult(null)
    setError(null)

    try {
      const res = await fetch("/api/generate-song", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(params),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error ?? "Something went wrong.")
        return
      }

      setResult(data as GeneratedResult)
    } catch {
      setError("Network error — please try again.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-zinc-950">
      <Nav />

      <main className="mx-auto max-w-3xl px-6 py-16 space-y-14">
        {/* Hero */}
        <div className="space-y-2 text-center">
          <h1 className="text-4xl font-semibold tracking-tight text-white sm:text-[44px]">
            Turn an idea into a song
          </h1>
          <p className="text-base text-zinc-500">
            Describe a feeling, a scene, or a memory — Maestro handles the rest.
          </p>
        </div>

        {/* Creation section */}
        <section className="rounded-2xl border border-white/6 bg-zinc-900/30 p-6 space-y-5 shadow-xl shadow-black/30">
          <PromptForm onGenerate={handleGenerate} loading={loading} />
        </section>

        {/* Result */}
        <section>
          <SongResult result={result} loading={loading} error={error} />
        </section>

        {/* Recent songs */}
        <RecentSongs />
      </main>
    </div>
  )
}
