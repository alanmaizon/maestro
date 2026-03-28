# Maestro Alignment Service

Line-level lyric alignment using WhisperX + FastAPI.

## Setup

```bash
cd services/alignment
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

For speaker diarization (optional), set `HF_TOKEN`:
```bash
export HF_TOKEN=your_huggingface_token
```

## Run

```bash
uvicorn main:app --host 0.0.0.0 --port 8090
```

## Endpoint

### POST /align-lyrics

```json
{
  "audioPath": "/absolute/path/to/audio.wav",
  "lyricsText": "full raw lyrics text"
}
```

Response:
```json
{
  "mode": "synced",
  "reason": "12 lines aligned (10 high confidence)",
  "lines": [
    { "id": "ln-1", "text": "lyric line", "start": 12.42, "end": 15.88, "confidence": 0.91 }
  ],
  "warnings": []
}
```

### GET /health

Returns `{ "status": "ok" }`.

## How it works

1. WhisperX transcribes the audio into word-level segments
2. Each singable lyric line is matched to a contiguous span of transcribed words using normalized text overlap
3. Timing from the matched word span is assigned to the lyric line
4. Lines with low confidence or broken timing are flagged
5. If fewer than 2 lines pass validation, mode downgrades to "unsynced"

## Environment variables

| Variable | Default | Description |
|---|---|---|
| `HF_TOKEN` | (empty) | HuggingFace token for diarization models |
| `WHISPER_MODEL_SIZE` | `base` | WhisperX model size (tiny/base/small/medium/large-v2) |
