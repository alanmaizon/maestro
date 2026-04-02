"""
Tool: package_result

Assembles the final GeneratedResult from upstream outputs.
"""

from __future__ import annotations

from typing import Any


async def package_result(inputs: dict[str, Any]) -> dict[str, Any]:
    """Package everything into the final API response shape.

    Merges outputs from generate_audio and align_lyrics into the
    GeneratedResult structure the frontend expects.
    """
    return {
        "title": inputs.get("title", "Untitled"),
        "promptUsed": inputs.get("prompt_used", ""),
        "lyricsOrStructure": inputs.get("lyrics_text", ""),
        "lyricSync": inputs.get("lyric_sync"),
        "audioBase64": inputs.get("audio_base64", ""),
        "audioMimeType": inputs.get("audio_mime_type", "audio/wav"),
    }
