"""
Song pipeline workflow — the first Maestro workflow.

Replicates the existing generate-song API route as an orchestrated
three-step DAG:

    generate  →  align  →  package

Each step declares an output schema so malformed outputs fail fast
instead of propagating downstream.
"""

from __future__ import annotations

from ..core import Agent, Workflow, Conductor


def register_song_pipeline(conductor: Conductor) -> None:
    """Register agents and the workflow for song generation."""

    # ── Agents ─────────────────────────────────────────────────────

    conductor.agents.register(
        Agent(
            name="generator",
            role="audio generation via Gemini/Lyria",
            model="lyria",
            tools=["generate_audio"],
            system_prompt="Generate a polished song from the user prompt.",
        )
    )

    conductor.agents.register(
        Agent(
            name="aligner",
            role="lyric alignment via WhisperX",
            model="whisperx",
            tools=["align_lyrics"],
            system_prompt="Align lyrics to audio timestamps.",
        )
    )

    conductor.agents.register(
        Agent(
            name="packager",
            role="result packaging",
            model="none",
            tools=["package_result"],
            system_prompt="Package outputs into the final response shape.",
        )
    )

    # ── Workflow ────────────────────────────────────────────────────

    workflow = (
        Workflow(name="song_pipeline")
        .step(
            "generate",
            agent="generator",
            timeout_seconds=120,
            output_schema={
                "title": "str",
                "lyrics_text": "str",
                "audio_base64": "str",
                "audio_mime_type": "str",
            },
        )
        .step(
            "align",
            agent="aligner",
            after=["generate"],
            retry_limit=2,
            timeout_seconds=120,
            output_schema={
                "lyric_sync": "dict",
            },
        )
        .step(
            "package",
            agent="packager",
            after=["generate", "align"],
            output_schema={
                "title": "str",
                "lyricsOrStructure": "str",
                "audioBase64": "str",
                "audioMimeType": "str",
            },
        )
    )

    conductor.register_workflow(workflow)
