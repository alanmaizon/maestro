"""
Agent and Tool registries.
"""

from __future__ import annotations

from typing import Any, Awaitable, Callable

from .models import Agent, ToolDefinition


ToolCallable = Callable[..., Awaitable[dict[str, Any]]]


class ToolRegistry:
    """Stores tool definitions and their callables."""

    def __init__(self) -> None:
        self._definitions: dict[str, ToolDefinition] = {}
        self._callables: dict[str, ToolCallable] = {}

    def register(
        self,
        name: str,
        fn: ToolCallable,
        *,
        description: str = "",
        parameters_schema: dict[str, Any] | None = None,
        returns_schema: dict[str, Any] | None = None,
    ) -> None:
        self._definitions[name] = ToolDefinition(
            name=name,
            description=description,
            parameters_schema=parameters_schema or {},
            returns_schema=returns_schema or {},
        )
        self._callables[name] = fn

    def get(self, name: str) -> ToolCallable:
        if name not in self._callables:
            raise KeyError(f"Tool not registered: {name}")
        return self._callables[name]

    def get_definition(self, name: str) -> ToolDefinition:
        return self._definitions[name]

    def list_tools(self) -> list[ToolDefinition]:
        return list(self._definitions.values())


class AgentRegistry:
    """Stores agent definitions."""

    def __init__(self) -> None:
        self._agents: dict[str, Agent] = {}

    def register(self, agent: Agent) -> None:
        self._agents[agent.name] = agent

    def get(self, name: str) -> Agent:
        if name not in self._agents:
            raise KeyError(f"Agent not registered: {name}")
        return self._agents[name]

    def list_agents(self) -> list[Agent]:
        return list(self._agents.values())
