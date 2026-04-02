"""
Maestro core domain models.

These are the building blocks: Agent, Task, Workflow, Run, Event, Policy.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from enum import Enum
from typing import Any, Callable, Awaitable

from pydantic import BaseModel, Field


# ── Enums ──────────────────────────────────────────────────────────


class TaskStatus(str, Enum):
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    SKIPPED = "skipped"
    WAITING_APPROVAL = "waiting_approval"


class RunStatus(str, Enum):
    PENDING = "pending"
    RUNNING = "running"
    WAITING_APPROVAL = "waiting_approval"
    COMPLETED = "completed"
    FAILED = "failed"


# ── Tool ───────────────────────────────────────────────────────────


class ToolDefinition(BaseModel):
    """A typed capability exposed to agents."""

    name: str
    description: str
    # The actual callable is stored separately in the ToolRegistry;
    # this model is the serialisable metadata.
    parameters_schema: dict[str, Any] = Field(default_factory=dict)
    returns_schema: dict[str, Any] = Field(default_factory=dict)


# ── Agent ──────────────────────────────────────────────────────────


class Agent(BaseModel):
    """A role-bounded worker that can call tools and return structured output."""

    name: str
    role: str
    model: str = "default"
    tools: list[str] = Field(default_factory=list)
    system_prompt: str = ""


# ── Task ───────────────────────────────────────────────────────────


class Task(BaseModel):
    """A bounded unit of work inside a workflow run."""

    id: str = Field(default_factory=lambda: uuid.uuid4().hex[:12])
    step_name: str
    goal: str = ""
    inputs: dict[str, Any] = Field(default_factory=dict)
    constraints: dict[str, Any] = Field(default_factory=dict)
    status: TaskStatus = TaskStatus.PENDING
    output: dict[str, Any] | None = None
    error: str | None = None
    agent_name: str | None = None
    started_at: datetime | None = None
    completed_at: datetime | None = None


# ── AgentResult ────────────────────────────────────────────────────


class AgentResult(BaseModel):
    """Structured output returned by an agent after executing a task."""

    output: dict[str, Any] = Field(default_factory=dict)
    confidence: float | None = None
    requires_approval: bool = False


# ── Workflow ───────────────────────────────────────────────────────


class OutputSchema(BaseModel):
    """Declares the expected output shape of a workflow step.

    ``required_keys`` maps key names to expected Python type names
    (e.g. ``{"title": "str", "audio_base64": "str"}``).  An empty dict
    means no validation.
    """

    required_keys: dict[str, str] = Field(default_factory=dict)


class WorkflowStep(BaseModel):
    """One node in the workflow DAG."""

    name: str
    agent: str  # agent name
    after: list[str] = Field(default_factory=list)
    approval_required: bool = False
    retry_limit: int = 1
    timeout_seconds: int = 300
    output_schema: OutputSchema = Field(default_factory=OutputSchema)


class Workflow(BaseModel):
    """A directed graph of steps and handoffs."""

    name: str
    steps: list[WorkflowStep] = Field(default_factory=list)

    # ── builder API ────────────────────────────────────────────────

    def step(
        self,
        name: str,
        *,
        agent: str,
        after: list[str] | None = None,
        approval_required: bool = False,
        retry_limit: int = 1,
        timeout_seconds: int = 300,
        output_schema: dict[str, str] | None = None,
    ) -> Workflow:
        self.steps.append(
            WorkflowStep(
                name=name,
                agent=agent,
                after=after or [],
                approval_required=approval_required,
                retry_limit=retry_limit,
                timeout_seconds=timeout_seconds,
                output_schema=OutputSchema(required_keys=output_schema or {}),
            )
        )
        return self

    def get_step(self, name: str) -> WorkflowStep | None:
        return next((s for s in self.steps if s.name == name), None)

    def ready_steps(self, completed: set[str]) -> list[WorkflowStep]:
        """Return steps whose dependencies are all satisfied."""
        return [
            s
            for s in self.steps
            if s.name not in completed and all(d in completed for d in s.after)
        ]


# ── Event ──────────────────────────────────────────────────────────


class Event(BaseModel):
    """An immutable record of something that happened during a run."""

    id: str = Field(default_factory=lambda: uuid.uuid4().hex[:12])
    run_id: str
    type: str
    timestamp: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc)
    )
    step_name: str | None = None
    payload: dict[str, Any] = Field(default_factory=dict)


# ── Run ────────────────────────────────────────────────────────────


class Run(BaseModel):
    """A single execution of a workflow."""

    id: str = Field(default_factory=lambda: uuid.uuid4().hex[:12])
    workflow_name: str
    status: RunStatus = RunStatus.PENDING
    inputs: dict[str, Any] = Field(default_factory=dict)
    tasks: dict[str, Task] = Field(default_factory=dict)
    events: list[Event] = Field(default_factory=list)
    outputs: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc)
    )
    completed_at: datetime | None = None

    def emit(self, event_type: str, step_name: str | None = None, **payload: Any) -> Event:
        evt = Event(
            run_id=self.id,
            type=event_type,
            step_name=step_name,
            payload=payload,
        )
        self.events.append(evt)
        return evt


# ── Policy ─────────────────────────────────────────────────────────


class Policy(BaseModel):
    """Rules governing a workflow run."""

    max_run_cost_usd: float | None = None
    max_tool_calls_per_task: int = 20
    approvals: list[dict[str, Any]] = Field(default_factory=list)
    tool_access: dict[str, list[str]] = Field(default_factory=dict)


# ── Type alias for tool callables ──────────────────────────────────

ToolCallable = Callable[..., Awaitable[dict[str, Any]]]
