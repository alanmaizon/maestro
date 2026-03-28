# Maestro

AI song generator — Next.js frontend + Gemini/Lyria generation + WhisperX lyric alignment.

## Getting started

```bash
cp .env.example .env.local
# add your GEMINI_API_KEY to .env.local
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Optional: alignment service

The alignment service enables real synced lyrics. Without it, lyrics display in unsynced mode (clean text, no playback-follow highlighting).

```bash
cd services/alignment
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --port 8090
```

See [services/alignment/README.md](services/alignment/README.md) for details.

## Environment

| Variable | Description |
|---|---|
| `GEMINI_API_KEY` | Google Gemini API key — never exposed to the client |
| `ALIGNMENT_SERVICE_URL` | Optional, default `http://localhost:8090` |

## How synced lyrics work

1. **Generate**: the Next.js route calls Lyria, saves the audio to a temp file
2. **Align**: the route calls the Python alignment service (`POST /align-lyrics`) with the audio path + raw lyrics
3. **WhisperX**: the service transcribes the audio, aligns words, and matches them to lyric lines
4. **Validate**: both the aligner and the frontend validate timing quality (monotonicity, min count, confidence)
5. **Display**: if validation passes → `synced` mode (active line highlight, auto-scroll, click-to-seek). Otherwise → `unsynced` mode (clean static text, no fake sync)

Current limitation: line-level sync only (not word-level karaoke).

## Stack

- **Next.js 16** (App Router) + **TypeScript** + **Tailwind CSS v4**
- **@google/genai** — Gemini / Lyria (server-side)
- **shadcn/ui** + **lucide-react**
- **FastAPI** + **WhisperX** — alignment service (Python)

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start dev server |
| `npm run build` | Production build |
| `npm run lint` | ESLint |
