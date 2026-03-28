"use client"

import { Button } from "@/components/ui/button"
import { Music2, Plus } from "lucide-react"

export function Nav() {
  return (
    <header className="sticky top-0 z-50 border-b border-white/5 bg-zinc-950/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
        {/* Wordmark */}
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600">
            <Music2 className="h-4 w-4 text-white" />
          </div>
          <span className="text-[17px] font-semibold tracking-tight text-white">
            Maestro
          </span>
        </div>

        {/* Nav links */}
        <nav className="hidden items-center gap-1 md:flex">
          {["Create", "Library", "Account"].map((link) => (
            <button
              key={link}
              className="rounded-md px-3.5 py-2 text-sm text-zinc-400 transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
            >
              {link}
            </button>
          ))}
        </nav>

        {/* CTA */}
        <Button
          size="sm"
          className="gap-1.5 bg-violet-600 text-white hover:bg-violet-500 focus-visible:ring-violet-500"
        >
          <Plus className="h-4 w-4" />
          New Song
        </Button>
      </div>
    </header>
  )
}
