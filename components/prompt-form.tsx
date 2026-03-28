"use client"

import { useState } from "react"
import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Sparkles } from "lucide-react"
import type { GenerateRequest } from "@/lib/types"

interface PromptFormProps {
  onGenerate: (params: GenerateRequest) => void
  loading: boolean
}

const MOODS = [
  "Melancholic",
  "Euphoric",
  "Calm",
  "Energetic",
  "Romantic",
  "Nostalgic",
  "Dark",
  "Uplifting",
]

const LENGTHS = ["Lyria 3 Pro (~3 min)", "Lyria 3 Clip (~30 sec)"]

const PLACEHOLDER =
  "A late-night drive through an empty city, neon lights reflecting on wet asphalt, the feeling of being completely alone but somehow at peace…"

export function PromptForm({ onGenerate, loading }: PromptFormProps) {
  const [prompt, setPrompt] = useState("")
  const [mood, setMood] = useState<string | null>(null)
  const [length, setLength] = useState<string | null>(null)
  const [vocals, setVocals] = useState(true)

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onGenerate({ prompt, mood, length, vocals })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Textarea */}
      <div className="relative">
        <Textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder={PLACEHOLDER}
          rows={4}
          className="resize-none rounded-xl border-white/10 bg-zinc-900/60 text-zinc-100 placeholder:text-zinc-600 focus-visible:border-violet-500/60 focus-visible:ring-violet-500/20 text-[15px] leading-relaxed pr-4"
        />
      </div>

      {/* Options row */}
      <div className="flex flex-wrap items-center gap-3">
        <Select value={mood ?? ""} onValueChange={setMood}>
          <SelectTrigger className="h-9 w-[155px] rounded-lg border-white/10 bg-zinc-900/60 text-sm text-zinc-300 focus:ring-violet-500/30">
            <SelectValue placeholder="Mood" />
          </SelectTrigger>
          <SelectContent className="border-white/10 bg-zinc-900 text-zinc-200">
            {MOODS.map((m) => (
              <SelectItem
                key={m}
                value={m}
                className="focus:bg-white/8 focus:text-white"
              >
                {m}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={length ?? ""} onValueChange={setLength}>
          <SelectTrigger className="h-9 w-[175px] rounded-lg border-white/10 bg-zinc-900/60 text-sm text-zinc-300 focus:ring-violet-500/30">
            <SelectValue placeholder="Length" />
          </SelectTrigger>
          <SelectContent className="border-white/10 bg-zinc-900 text-zinc-200">
            {LENGTHS.map((l) => (
              <SelectItem
                key={l}
                value={l}
                className="focus:bg-white/8 focus:text-white"
              >
                {l}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <label className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-white/10 bg-zinc-900/60 px-3 py-2 transition-colors hover:border-white/16">
          <Switch
            checked={vocals}
            onCheckedChange={setVocals}
            className="data-[state=checked]:bg-violet-600"
          />
          <span className="text-sm text-zinc-300">Vocals</span>
        </label>

        <div className="ml-auto">
          <Button
            type="submit"
            disabled={loading}
            className="gap-2 bg-violet-600 px-5 text-white hover:bg-violet-500 focus-visible:ring-violet-500 disabled:opacity-60"
          >
            <Sparkles className="h-4 w-4" />
            {loading ? "Generating…" : "Generate Song"}
          </Button>
        </div>
      </div>
    </form>
  )
}
