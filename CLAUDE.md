# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev      # start dev server at http://localhost:3000
npm run build    # production build (also runs type check)
npm run lint     # ESLint
npx tsc --noEmit # standalone type check without building
```

Orchestrator service (runs the song pipeline and future workflows):
```bash
cd services/orchestrator
pip install -r requirements.txt
uvicorn server.app:app --port 8100
```

Alignment service (called by orchestrator, enables synced lyrics):
```bash
cd services/alignment
source .venv/bin/activate
uvicorn main:app --port 8090
```

## Architecture

**Maestro** is an AI song generator built on a multi-agent orchestration layer. The Next.js frontend calls the Maestro orchestrator, which coordinates agents and tools (Gemini/Lyria for generation, WhisperX for alignment) through inspectable workflow runs. No auth, no database.

### Orchestration layer

The orchestrator (`services/orchestrator/`) is a Python service that coordinates multi-step workflows:

- **Agents** — role-bounded workers (generator, aligner, packager) that call tools
- **Tools** — typed capabilities (generate_audio, align_lyrics, package_result)
- **Workflows** — DAGs of steps with dependencies, retries, output schemas, and approval gates
- **Conductor** — the engine that walks the DAG, dispatches tasks, enforces policy, validates outputs, handles failures
- **Policy** — rules layer: tool access per agent, max tool calls per task, approval rules for actions
- **Schema validation** — each step can declare required output keys + types; malformed outputs fail fast with `validation.failed` events
- **Runs** — execution instances with full event timeline and task state

### Generation + alignment flow

1. `POST /api/generate-song` → Next.js route calls orchestrator `POST /runs`
2. Orchestrator starts `song_pipeline` workflow with three steps:
   - `generate` — agent calls Gemini/Lyria → returns audio + lyrics
   - `align` — agent saves audio to temp, calls WhisperX alignment service → returns `LyricSync`
   - `package` — agent assembles final `GeneratedResult` from upstream outputs
3. Orchestrator returns run with outputs; Next.js route extracts and returns to frontend
4. Every step, tool call, and handoff is logged as events on the run
5. If alignment fails, `lyricSync.mode` is `"unsynced"` — song still works, just without sync

### Orchestrator API

| Endpoint | Method | Purpose |
|---|---|---|
| `/runs` | POST | Start a workflow run |
| `/runs` | GET | List all runs |
| `/runs/{id}` | GET | Run detail (tasks, events, outputs) |
| `/runs/{id}/events` | GET | Event timeline |
| `/runs/{id}/approve` | POST | Approve a pending approval gate |
| `/workflows` | GET | List registered workflows |
| `/agents` | GET | List registered agents |
| `/tools` | GET | List registered tools |
| `/health` | GET | Health check |

### Key files

| File | Role |
|---|---|
| `app/api/generate-song/route.ts` | Thin proxy: calls orchestrator `POST /runs` → returns packaged result |
| `services/orchestrator/core/models.py` | Domain models: Agent, Task, Workflow, Run, Event, Policy |
| `services/orchestrator/core/conductor.py` | Orchestration engine: DAG walker, retries, approval gates, event logging |
| `services/orchestrator/core/registry.py` | Agent and Tool registries |
| `services/orchestrator/tools/generate_audio.py` | Tool: calls Gemini/Lyria for audio generation |
| `services/orchestrator/tools/align_lyrics.py` | Tool: saves temp audio, calls alignment service |
| `services/orchestrator/tools/package_result.py` | Tool: assembles final GeneratedResult |
| `services/orchestrator/workflows/song_pipeline.py` | Workflow definition: generate → align → package |
| `services/orchestrator/server/app.py` | FastAPI server: runs, events, approvals, introspection |
| `services/orchestrator/app_factory.py` | Wires conductor with all agents, tools, and workflows |
| `services/alignment/main.py` | FastAPI + WhisperX: `POST /align-lyrics` → `{ mode, reason, lines[], warnings[] }` |
| `app/page.tsx` | Page state — idle / loading / error / generated |
| `components/song-result.tsx` | Owns `<audio>` ref shared by player, waveform, visualizer, and lyrics |
| `components/player/synced-lyrics.tsx` | Timed/untimed mode switch; id-based resolution, scroll, debug |
| `components/player/lyric-debug-panel.tsx` | Debug panel: mode, reason, active id, aligner warnings, scroll decision |
| `lib/lyrics/parse-lyrics.ts` | `parseLyrics(raw, syncedLines?)` — classifies + assigns ids + merges timing |
| `lib/lyrics/resolve-active.ts` | `determineLyricMode()`, `resolveActiveLine()` (returns ids), `findCurrentSection()` |
| `lib/types.ts` | `SyncedLine`, `LyricSync`, `ParsedLyricItem`, `LyricModeInfo`, `ActiveLineResult`, `GeneratedResult` |
| `components/player/waveform-timeline.tsx` | Static amplitude-bar timeline; seekable |
| `components/player/reactive-visualizer.tsx` | Canvas live visualizer (bars / line / spectrum) |
| `lib/use-audio-analysis.ts` | `useWaveformData`, `useAnalyser` hooks |

### Synced lyrics pipeline

Every item has a stable `id` (e.g. `sec-1`, `ln-3`). All refs, resolution, and scroll targeting use ids — never array indexes.

**Two explicit modes:**
- `timed` — alignment service returned `mode: "synced"` and frontend validation passes (≥2 real-timed lines, monotonic, finite). Active line highlighting + auto-scroll.
- `untimed` — no alignment, alignment failed, or validation failed. Clean static text. No fake sync.

**Data pipeline:**

A. `GeneratedResult.lyricsOrStructure` + `lyricSync` from API
B. `parseLyrics(raw, lyricSync.lines)` → `ParsedLyricItem[]`. Lines matching aligner output get `timingSource: "real"` + `confidence`. Metadata stripped.
C. `determineLyricMode(items)` → validates quality. Rejects non-monotonic, too-few, or identical-duration timing.
D. `resolveActiveLine(items, currentTime, prevId)` → `activeLineId`. Only considers `timingSource === "real"`.
E. Scroll by `activeLineId` via id-keyed ref map. Throttled, comfort-zone check.
F. Debug panel shows mode, aligner reason, aligner warnings, confidence, scroll decision.

**Critical invariant:** Timed mode is only activated when the alignment service returned real WhisperX timestamps AND frontend validation passes. No synthetic/guessed timing ever drives the player.

### Alignment service details

`services/alignment/main.py`:
- Preprocesses lyrics (strips metadata/sections, keeps singable lines with stable `ln-N` ids)
- WhisperX transcribes audio → word-level alignment
- Matches lyric lines to word spans via normalized text overlap (monotonic scan)
- Returns confidence per line; lines below threshold are flagged
- If <2 high-confidence lines, returns `mode: "unsynced"`
- Env: `WHISPER_MODEL_SIZE` (default `base`), `HF_TOKEN` (optional)

### Audio visualization

Browser-side only:
1. **Waveform timeline** — `AudioContext.decodeAudioData` → 128 amplitude bars → click/drag seeks
2. **Reactive visualizer** — `MediaElementAudioSourceNode → AnalyserNode` → canvas (bars/line/spectrum)

### Design system

- Background: `zinc-950`, cards: `zinc-900/40–60`
- Accent: `violet-500 / violet-600`
- Typography: Geist Sans (variable font)
