"""
Tool: generate_audio

Calls Google Gemini / Lyria to generate a song, returning audio bytes,
lyrics text, and metadata.
"""

from __future__ import annotations

import base64
import os
import re
from typing import Any

from google import genai


MODEL_MAP = {
    "Lyria 3 Pro (~3 min)": "lyria-3-pro-preview",
    "Lyria 3 Clip (~30 sec)": "lyria-3-clip-preview",
}


async def generate_audio(inputs: dict[str, Any]) -> dict[str, Any]:
    """Generate a song via Gemini/Lyria.

    Expected inputs:
        prompt (str): user prompt
        mood (str | None): mood descriptor
        length (str | None): model selector string
        vocals (bool): whether to include vocals

    Returns:
        title, lyrics_text, audio_base64, audio_mime_type
    """
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        raise RuntimeError("GEMINI_API_KEY not configured")

    prompt = inputs.get("prompt", "")
    mood = inputs.get("mood")
    length = inputs.get("length")
    vocals = inputs.get("vocals", True)

    if not prompt or not prompt.strip():
        raise ValueError("prompt is required")

    model = MODEL_MAP.get(length or "", "lyria-3-pro-preview")

    composed = " ".join(
        filter(
            None,
            [
                "Create a polished original song.",
                f"Mood: {mood}." if mood else "",
                f"Vocals: {'yes' if vocals else 'instrumental only'}.",
                f"Inspiration: {prompt.strip()}.",
            ],
        )
    )

    client = genai.Client(api_key=api_key)

    response = client.models.generate_content(
        model=model,
        contents=[{"role": "user", "parts": [{"text": composed}]}],
        config={"responseModalities": ["AUDIO", "TEXT"]},
    )

    lyrics_text = ""
    audio_base64 = ""
    audio_mime_type = "audio/wav"

    for part in response.candidates[0].content.parts or []:
        if hasattr(part, "text") and part.text:
            lyrics_text += part.text
        elif hasattr(part, "inline_data") and part.inline_data and not audio_base64:
            audio_base64 = part.inline_data.data or ""
            audio_mime_type = part.inline_data.mime_type or "audio/wav"

    if not audio_base64:
        raise RuntimeError("No audio returned from provider")

    # Extract title
    title = ""
    match = re.search(r"^title:\s*(.+)", lyrics_text, re.IGNORECASE | re.MULTILINE)
    if match:
        title = match.group(1).strip()
        lyrics_text = re.sub(
            r"^title:\s*.+\n?", "", lyrics_text, count=1, flags=re.IGNORECASE | re.MULTILINE
        ).strip()
    if not title:
        words = prompt.strip().split()[:4]
        title = " ".join(words).capitalize()

    lyrics_text = lyrics_text.strip() or "No lyrics generated."

    return {
        "title": title,
        "prompt_used": composed,
        "lyrics_text": lyrics_text,
        "audio_base64": audio_base64,
        "audio_mime_type": audio_mime_type,
    }
