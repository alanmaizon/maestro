# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev      # start dev server at http://localhost:3000
npm run build    # production build (also runs type check)
npm run lint     # ESLint
npx tsc --noEmit # standalone type check without building
```

Alignment service (optional, enables synced lyrics):
```bash
cd services/alignment
source .venv/bin/activate
uvicorn main:app --port 8090
```

## Architecture

**Maestro** is an AI song generator. The Next.js route generates songs via Gemini/Lyria, then calls a Python alignment service for real lyric timing. No auth, no database.

### Generation + alignment flow

1. `POST /api/generate-song` → Lyria generates audio + lyrics text
2. Route saves audio to temp file on disk
3. Route calls `POST http://localhost:8090/align-lyrics` with audio path + lyrics text
4. Python service (WhisperX) transcribes audio → aligns words → maps to lyric lines → returns `LyricSync`
5. Route returns `{ title, lyricsOrStructure, lyricSync, audioBase64, audioMimeType }`
6. If alignment service is down or fails, `lyricSync.mode` is `"unsynced"` — song still works, just without sync

### Key files

| File | Role |
|---|---|
| `app/api/generate-song/route.ts` | Server route: Lyria call → save audio to temp → call aligner → return result |
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
