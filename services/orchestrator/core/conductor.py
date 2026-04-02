"""
Maestro Conductor — the orchestration engine.

Walks a workflow DAG, dispatches tasks to agents, handles retries
and failures, emits events, and collects outputs.
"""

from __future__ import annotations

import asyncio
import logging
import traceback
from datetime import datetime, timezone
from typing import Any

from .models import (
    AgentResult,
    OutputSchema,
    Policy,
    Run,
    RunStatus,
    Task,
    TaskStatus,
    Workflow,
)
from .registry import AgentRegistry, ToolRegistry


# ── Errors ─────────────────────────────────────────────────────────


class SchemaValidationError(Exception):
    """Raised when a step's output doesn't match its declared schema."""


class PolicyViolationError(Exception):
    """Raised when an agent action violates policy."""

log = logging.getLogger("maestro.conductor")


class Conductor:
    """Runs a workflow to completion."""

    def __init__(
        self,
        agents: AgentRegistry,
        tools: ToolRegistry,
        policy: Policy | None = None,
    ) -> None:
        self.agents = agents
        self.tools = tools
        self.policy = policy or Policy()
        self._runs: dict[str, Run] = {}
        self._workflows: dict[str, Workflow] = {}
        self._approval_queue: dict[str, asyncio.Event] = {}

    # ── Workflow registration ──────────────────────────────────────

    def register_workflow(self, workflow: Workflow) -> None:
        self._workflows[workflow.name] = workflow

    def get_workflow(self, name: str) -> Workflow:
        return self._workflows[name]

    def list_workflows(self) -> list[str]:
        return list(self._workflows.keys())

    # ── Run access ─────────────────────────────────────────────────

    def get_run(self, run_id: str) -> Run:
        if run_id not in self._runs:
            raise KeyError(f"Run not found: {run_id}")
        return self._runs[run_id]

    def list_runs(self) -> list[Run]:
        return list(self._runs.values())

    # ── Approval ───────────────────────────────────────────────────

    def approve(self, run_id: str, step_name: str) -> bool:
        key = f"{run_id}:{step_name}"
        evt = self._approval_queue.get(key)
        if evt:
            evt.set()
            return True
        return False

    # ── Execute a full run ─────────────────────────────────────────

    async def start(
        self, workflow_name: str, inputs: dict[str, Any] | None = None
    ) -> Run:
        workflow = self.get_workflow(workflow_name)
        run = Run(workflow_name=workflow_name, inputs=inputs or {})
        self._runs[run.id] = run

        # Create tasks for every step
        for step in workflow.steps:
            run.tasks[step.name] = Task(
                step_name=step.name,
                goal=step.name,
                agent_name=step.agent,
            )

        run.status = RunStatus.RUNNING
        run.emit("run.started")

        try:
            await self._execute(run, workflow)
        except Exception as exc:
            run.status = RunStatus.FAILED
            run.emit("run.failed", payload={"error": str(exc)})
            log.exception("Run %s failed", run.id)
            raise
        finally:
            run.completed_at = datetime.now(timezone.utc)

        return run

    # ── Internal DAG walker ────────────────────────────────────────

    async def _execute(self, run: Run, workflow: Workflow) -> None:
        completed: set[str] = set()

        while len(completed) < len(workflow.steps):
            ready = workflow.ready_steps(completed)
            if not ready:
                # Check if we're stuck
                pending = [
                    s.name
                    for s in workflow.steps
                    if s.name not in completed
                ]
                failed = [
                    n for n in pending if run.tasks[n].status == TaskStatus.FAILED
                ]
                if failed:
                    run.status = RunStatus.FAILED
                    run.emit("run.failed", payload={"failed_steps": failed})
                    return
                # Shouldn't happen in a well-formed DAG
                raise RuntimeError(
                    f"Workflow stuck: completed={completed}, pending={pending}"
                )

            # Execute ready steps in parallel
            results = await asyncio.gather(
                *(self._run_step(run, workflow, s) for s in ready),
                return_exceptions=True,
            )

            for step, result in zip(ready, results):
                task = run.tasks[step.name]
                if isinstance(result, BaseException):
                    task.status = TaskStatus.FAILED
                    task.error = str(result)
                    task.completed_at = datetime.now(timezone.utc)
                    run.emit(
                        "task.failed",
                        step_name=step.name,
                        error=str(result),
                    )
                    completed.add(step.name)
                else:
                    completed.add(step.name)

        # All done — collect final outputs from the last step(s)
        terminal_steps = [
            s for s in workflow.steps if not any(
                s.name in other.after for other in workflow.steps
            )
        ]
        for s in terminal_steps:
            task = run.tasks[s.name]
            if task.output:
                run.outputs.update(task.output)

        all_ok = all(
            run.tasks[s.name].status == TaskStatus.COMPLETED
            for s in workflow.steps
        )
        run.status = RunStatus.COMPLETED if all_ok else RunStatus.FAILED
        run.emit("run.completed" if all_ok else "run.failed")

    async def _run_step(
        self, run: Run, workflow: Workflow, step: Any
    ) -> None:
        task = run.tasks[step.name]
        agent = self.agents.get(step.agent)

        # Approval gate
        if step.approval_required:
            task.status = TaskStatus.WAITING_APPROVAL
            run.status = RunStatus.WAITING_APPROVAL
            run.emit("approval.required", step_name=step.name)

            approval_evt = asyncio.Event()
            key = f"{run.id}:{step.name}"
            self._approval_queue[key] = approval_evt

            # Wait for external approval (or timeout)
            try:
                await asyncio.wait_for(
                    approval_evt.wait(), timeout=step.timeout_seconds
                )
            except asyncio.TimeoutError:
                task.status = TaskStatus.FAILED
                task.error = "approval timed out"
                run.emit("approval.timeout", step_name=step.name)
                return
            finally:
                self._approval_queue.pop(key, None)

            run.status = RunStatus.RUNNING
            run.emit("approval.granted", step_name=step.name)

        # Execute with retries
        task.status = TaskStatus.RUNNING
        task.started_at = datetime.now(timezone.utc)
        run.emit("task.started", step_name=step.name, agent=agent.name)

        # Gather inputs from upstream tasks
        task_inputs = dict(run.inputs)
        for dep_name in step.after:
            dep_task = run.tasks[dep_name]
            if dep_task.output:
                task_inputs.update(dep_task.output)
        task.inputs = task_inputs

        last_error: str | None = None
        for attempt in range(step.retry_limit):
            try:
                result = await self._execute_agent(
                    agent, task_inputs, run, step.name
                )
                task.status = TaskStatus.COMPLETED
                task.output = result.output
                task.completed_at = datetime.now(timezone.utc)
                run.emit(
                    "task.completed",
                    step_name=step.name,
                    output_keys=list(result.output.keys()),
                )
                return
            except Exception as exc:
                last_error = traceback.format_exc()
                run.emit(
                    "task.retry",
                    step_name=step.name,
                    attempt=attempt + 1,
                    error=str(exc),
                )
                if attempt < step.retry_limit - 1:
                    await asyncio.sleep(min(2**attempt, 10))

        task.status = TaskStatus.FAILED
        task.error = last_error
        task.completed_at = datetime.now(timezone.utc)
        run.emit("task.failed", step_name=step.name, error=last_error or "")

    async def _execute_agent(
        self,
        agent: Any,
        inputs: dict[str, Any],
        run: Run,
        step_name: str,
    ) -> AgentResult:
        """
        Execute an agent's tools against the inputs.

        Enforces policy (tool access, call limits) and validates output
        against the step's declared schema.
        """
        if not agent.tools:
            raise ValueError(f"Agent '{agent.name}' has no tools registered")

        tool_name = agent.tools[0]

        # ── Policy: tool access control ────────────────────────────
        self._check_tool_access(agent.name, tool_name, run, step_name)

        # ── Policy: approval rules ─────────────────────────────────
        self._check_approval_rules(agent.name, tool_name, run, step_name)

        tool_fn = self.tools.get(tool_name)

        run.emit(
            "tool.called",
            step_name=step_name,
            tool=tool_name,
            agent=agent.name,
            input_keys=list(inputs.keys()),
        )

        # ── Policy: track tool call count ──────────────────────────
        call_count = sum(
            1
            for e in run.events
            if e.type == "tool.called" and e.step_name == step_name
        )
        if call_count > self.policy.max_tool_calls_per_task:
            run.emit(
                "policy.violation",
                step_name=step_name,
                rule="max_tool_calls_per_task",
                limit=self.policy.max_tool_calls_per_task,
                actual=call_count,
            )
            raise PolicyViolationError(
                f"Agent '{agent.name}' exceeded max tool calls "
                f"({self.policy.max_tool_calls_per_task}) for step '{step_name}'"
            )

        output = await tool_fn(inputs)

        run.emit(
            "tool.completed",
            step_name=step_name,
            tool=tool_name,
            output_keys=list(output.keys()),
        )

        # ── Schema validation ──────────────────────────────────────
        workflow = self.get_workflow(run.workflow_name)
        step_def = workflow.get_step(step_name)
        if step_def and step_def.output_schema.required_keys:
            self._validate_output(
                output, step_def.output_schema, run, step_name
            )

        return AgentResult(output=output)

    # ── Policy checks ──────────────────────────────────────────────

    def _check_tool_access(
        self,
        agent_name: str,
        tool_name: str,
        run: Run,
        step_name: str,
    ) -> None:
        """Raise if the agent is not allowed to use this tool."""
        access = self.policy.tool_access
        if not access:
            return  # no restrictions configured
        allowed = access.get(agent_name)
        if allowed is None:
            return  # agent not in policy = unrestricted
        if tool_name not in allowed:
            run.emit(
                "policy.violation",
                step_name=step_name,
                rule="tool_access",
                agent=agent_name,
                tool=tool_name,
                allowed=allowed,
            )
            raise PolicyViolationError(
                f"Agent '{agent_name}' is not allowed to use tool '{tool_name}'. "
                f"Allowed: {allowed}"
            )

    def _check_approval_rules(
        self,
        agent_name: str,
        tool_name: str,
        run: Run,
        step_name: str,
    ) -> None:
        """Emit warning events for tools that match approval rules.

        Actual approval gating is handled at the step level via
        ``approval_required``.  This logs when a tool call matches a
        policy approval rule so the event timeline captures it.
        """
        for rule in self.policy.approvals:
            action = rule.get("action", "")
            if action and action in tool_name:
                run.emit(
                    "policy.approval_match",
                    step_name=step_name,
                    rule=rule,
                    agent=agent_name,
                    tool=tool_name,
                )

    # ── Schema validation ──────────────────────────────────────────

    @staticmethod
    def _validate_output(
        output: dict[str, Any],
        schema: "OutputSchema",
        run: Run,
        step_name: str,
    ) -> None:
        """Validate output dict against the step's declared schema."""
        TYPE_MAP: dict[str, type | tuple[type, ...]] = {
            "str": str,
            "int": int,
            "float": (int, float),
            "bool": bool,
            "dict": dict,
            "list": list,
        }

        errors: list[str] = []
        for key, expected_type_name in schema.required_keys.items():
            if key not in output:
                errors.append(f"missing required key: '{key}'")
                continue
            expected = TYPE_MAP.get(expected_type_name)
            if expected and not isinstance(output[key], expected):
                actual = type(output[key]).__name__
                errors.append(
                    f"key '{key}': expected {expected_type_name}, got {actual}"
                )

        if errors:
            run.emit(
                "validation.failed",
                step_name=step_name,
                errors=errors,
                output_keys=list(output.keys()),
            )
            raise SchemaValidationError(
                f"Output validation failed for step '{step_name}': "
                + "; ".join(errors)
            )
