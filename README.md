# Maestro

AI song generator built with Next.js, Gemini/Lyria, and WhisperX lyric alignment.

Describe a song, pick a mood, and Maestro generates original audio with synced lyrics you can follow in real time.

## Quick start

```bash
cp .env.example .env.local
# add your GEMINI_API_KEY to .env.local
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

Songs generate without the alignment service — lyrics just show in unsynced mode.

## Alignment service (optional)

Enables real-time synced lyrics with line-level highlighting and auto-scroll.

**Requirements:** Python 3.11 or 3.12, FFmpeg

```bash
cd services/alignment
python3.11 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --port 8090
```

When running, the Next.js route automatically calls it after generating a song. If the service is down, lyrics fall back to unsynced mode gracefully.

See [services/alignment/README.md](services/alignment/README.md) for details.

## Environment variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `GEMINI_API_KEY` | Yes | — | Google Gemini API key (server-side only) |
| `ALIGNMENT_SERVICE_URL` | No | `http://localhost:8090` | WhisperX alignment service URL |

## Architecture

```
Browser                     Next.js Server                  Python Service
  │                              │                               │
  ├─ POST /api/generate-song ──► │                               │
  │                              ├─ Lyria generates audio+text   │
  │                              ├─ Save audio to temp file      │
  │                              ├─ POST /align-lyrics ────────► │
  │                              │                               ├─ WhisperX transcribe
  │                              │                               ├─ Word-level alignment
  │                              │  ◄── { mode, lines[], ... } ──┤
  │  ◄── { audio, lyrics,       │                               │
  │       lyricSync }            │                               │
  │                              │                               │
  ├─ Render player + lyrics      │                               │
  ├─ Waveform + visualizer       │                               │
  └─ Synced/unsynced display     │                               │
```

No auth, no database — stateless generation.

### Key files

| File | Purpose |
|---|---|
| `app/api/generate-song/route.ts` | Server route: Lyria call, audio save, alignment call |
| `services/alignment/main.py` | FastAPI + WhisperX: transcribe, align, match lyrics |
| `app/page.tsx` | Page state machine: idle / loading / error / generated |
| `components/song-result.tsx` | Audio player, waveform, visualizer, lyrics container |
| `components/player/synced-lyrics.tsx` | Timed/untimed lyrics rendering, scroll, click-to-seek |
| `lib/lyrics/clean-raw-lyrics.ts` | Strips timestamps, metadata, Lyria markers, prose |
| `lib/lyrics/parse-lyrics.ts` | Parses cleaned text into structured items with timing |
| `lib/lyrics/resolve-active.ts` | Determines active line from playback position |
| `lib/types.ts` | All shared TypeScript types |

## How synced lyrics work

1. **Generate** — Next.js route calls Lyria, which returns audio + raw lyrics text
2. **Clean** — Raw text is stripped of timestamps, Lyria structural markers (`[[A0]]`), metadata (`Caption:`, `duration_secs:`), and arrangement prose
3. **Align** — Route sends audio file + lyrics to the Python service, which uses WhisperX for word-level forced alignment, then maps word spans to lyric lines
4. **Validate** — Both aligner and frontend check timing quality: monotonicity, minimum 2 high-confidence lines, finite values
5. **Display** — Validation passes: `timed` mode (active highlight, auto-scroll, click-to-seek). Fails: `untimed` mode (clean static text, no fake sync)

Line-level sync only (not word-level karaoke).

## Audio visualization

- **Waveform timeline** — Decoded audio amplitude rendered as 128 vertical bars. Click or drag to seek.
- **Reactive visualizer** — Real-time canvas animation driven by `AnalyserNode`. Three modes: bars (equalizer), line (oscilloscope), spectrum (centered bands).

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start dev server |
| `npm run build` | Production build (includes type check) |
| `npm run lint` | ESLint |
| `npm run typecheck` | Type check without building |
| `npm run check-secrets` | Scan for leaked secrets |

## CI and hooks

**Pre-commit** — lint-staged runs ESLint on staged `.ts`/`.tsx` files

**Pre-push** — runs lint, type check, and secret scan

**GitHub Actions** ([.github/workflows/ci.yml](.github/workflows/ci.yml)) — on push to `main` and PRs:
- ESLint + TypeScript check
- Secret scan
- Production build

## Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router) |
| Language | TypeScript 5 |
| Styling | Tailwind CSS v4 |
| Components | shadcn/ui, Lucide icons |
| AI generation | Google Gemini / Lyria (`@google/genai`) |
| Alignment | FastAPI, WhisperX, PyTorch |
| Hooks | Husky, lint-staged |
| CI | GitHub Actions |

## License

Private project.
