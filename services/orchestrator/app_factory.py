"""
App factory — wires up the conductor with all agents, tools, and workflows.
"""

from __future__ import annotations

from .core import Conductor, AgentRegistry, ToolRegistry, Policy
from .tools import generate_audio, align_lyrics, package_result
from .workflows import register_song_pipeline


def create_conductor() -> Conductor:
    """Create a fully wired Conductor instance."""

    agents = AgentRegistry()
    tools = ToolRegistry()

    # ── Policy ─────────────────────────────────────────────────────
    # Each agent can only call the tools it needs — no more.

    policy = Policy(
        max_tool_calls_per_task=5,
        tool_access={
            "generator": ["generate_audio"],
            "aligner": ["align_lyrics"],
            "packager": ["package_result"],
        },
        approvals=[
            {"action": "publish", "required": True},
            {"action": "deploy", "required": True},
        ],
    )

    # ── Register tools ─────────────────────────────────────────────

    tools.register(
        "generate_audio",
        generate_audio,
        description="Generate a song via Gemini/Lyria",
    )
    tools.register(
        "align_lyrics",
        align_lyrics,
        description="Align lyrics to audio via WhisperX alignment service",
    )
    tools.register(
        "package_result",
        package_result,
        description="Package outputs into the final API response shape",
    )

    # ── Build conductor ────────────────────────────────────────────

    conductor = Conductor(agents=agents, tools=tools, policy=policy)

    # ── Register workflows (each registers its own agents) ─────────

    register_song_pipeline(conductor)

    return conductor
