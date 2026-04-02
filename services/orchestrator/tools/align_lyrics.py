"""
Tool: align_lyrics

Saves audio to a temp file and calls the existing alignment service
to produce line-level lyric timing.
"""

from __future__ import annotations

import base64
import os
import tempfile
import time
import math
from pathlib import Path
from typing import Any

import httpx


ALIGNMENT_URL = os.environ.get("ALIGNMENT_SERVICE_URL", "http://localhost:8090")


async def align_lyrics(inputs: dict[str, Any]) -> dict[str, Any]:
    """Call the alignment service with audio + lyrics.

    Expected inputs (from generate_audio output):
        audio_base64 (str)
        audio_mime_type (str)
        lyrics_text (str)

    Returns:
        lyric_sync dict with mode, reason, lines, warnings
    """
    audio_b64 = inputs.get("audio_base64", "")
    mime = inputs.get("audio_mime_type", "audio/wav")
    lyrics = inputs.get("lyrics_text", "")

    if not audio_b64:
        return _unsynced("no audio data provided")

    # Write audio to temp file
    ext = "wav" if "wav" in mime else "mp3"
    audio_dir = Path(tempfile.gettempdir()) / "maestro-audio"
    audio_dir.mkdir(parents=True, exist_ok=True)
    audio_path = audio_dir / f"{int(time.time())}-{os.urandom(4).hex()}.{ext}"
    audio_path.write_bytes(base64.b64decode(audio_b64))

    try:
        async with httpx.AsyncClient(timeout=120.0) as client:
            resp = await client.post(
                f"{ALIGNMENT_URL}/align-lyrics",
                json={
                    "audioPath": str(audio_path),
                    "lyricsText": lyrics,
                },
            )

        if resp.status_code == 200:
            sync = resp.json()
            return {"lyric_sync": sync, "audio_path": str(audio_path)}

        return {
            "lyric_sync": _unsynced(
                f"alignment service returned {resp.status_code}: {resp.text[:120]}"
            ),
            "audio_path": str(audio_path),
        }

    except Exception as exc:
        return {
            "lyric_sync": _unsynced(str(exc)),
            "audio_path": str(audio_path),
        }


def _unsynced(reason: str) -> dict[str, Any]:
    return {
        "mode": "unsynced",
        "reason": reason,
        "lines": [],
        "warnings": [],
    }
