"""
Maestro FastAPI server.

Endpoints:
    POST   /runs                       — start a workflow run
    GET    /runs                       — list all runs
    GET    /runs/{run_id}              — get run detail (tasks, events, outputs)
    GET    /runs/{run_id}/events       — get run event timeline
    POST   /runs/{run_id}/approve      — approve a pending approval gate
    GET    /workflows                  — list registered workflows
    GET    /agents                     — list registered agents
    GET    /tools                      — list registered tools
    GET    /health                     — health check
"""

from __future__ import annotations

import asyncio
from typing import Any

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from ..app_factory import create_conductor


# ── App setup ──────────────────────────────────────────────────────

app = FastAPI(title="Maestro Orchestrator", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

conductor = create_conductor()


# ── Request / Response models ──────────────────────────────────────


class StartRunRequest(BaseModel):
    workflow: str
    inputs: dict[str, Any] = {}


class ApproveRequest(BaseModel):
    step_name: str


# ── Endpoints ──────────────────────────────────────────────────────


@app.get("/health")
def health():
    return {"status": "ok", "service": "maestro-orchestrator"}


@app.get("/workflows")
def list_workflows():
    return {"workflows": conductor.list_workflows()}


@app.get("/agents")
def list_agents():
    return {"agents": [a.model_dump() for a in conductor.agents.list_agents()]}


@app.get("/tools")
def list_tools():
    return {"tools": [t.model_dump() for t in conductor.tools.list_tools()]}


@app.post("/runs")
async def start_run(req: StartRunRequest):
    """Start a new workflow run. Runs to completion and returns the result."""
    if req.workflow not in conductor.list_workflows():
        raise HTTPException(
            status_code=404,
            detail=f"Workflow not found: {req.workflow}",
        )

    run = await conductor.start(req.workflow, req.inputs)
    return _serialize_run(run)


@app.get("/runs")
def list_runs():
    return {
        "runs": [_serialize_run_summary(r) for r in conductor.list_runs()]
    }


@app.get("/runs/{run_id}")
def get_run(run_id: str):
    try:
        run = conductor.get_run(run_id)
    except KeyError:
        raise HTTPException(status_code=404, detail="Run not found")
    return _serialize_run(run)


@app.get("/runs/{run_id}/events")
def get_run_events(run_id: str):
    try:
        run = conductor.get_run(run_id)
    except KeyError:
        raise HTTPException(status_code=404, detail="Run not found")
    return {
        "run_id": run.id,
        "events": [e.model_dump() for e in run.events],
    }


@app.post("/runs/{run_id}/approve")
def approve_step(run_id: str, req: ApproveRequest):
    ok = conductor.approve(run_id, req.step_name)
    if not ok:
        raise HTTPException(
            status_code=404,
            detail="No pending approval for that run/step",
        )
    return {"approved": True}


# ── Serialisation helpers ──────────────────────────────────────────


def _serialize_run(run) -> dict[str, Any]:
    return {
        "id": run.id,
        "workflow": run.workflow_name,
        "status": run.status.value,
        "inputs": run.inputs,
        "outputs": run.outputs,
        "tasks": {
            name: {
                "step": t.step_name,
                "status": t.status.value,
                "agent": t.agent_name,
                "output": t.output,
                "error": t.error,
                "started_at": t.started_at.isoformat() if t.started_at else None,
                "completed_at": t.completed_at.isoformat() if t.completed_at else None,
            }
            for name, t in run.tasks.items()
        },
        "events": [
            {
                "type": e.type,
                "step": e.step_name,
                "timestamp": e.timestamp.isoformat(),
                "payload": e.payload,
            }
            for e in run.events
        ],
        "created_at": run.created_at.isoformat(),
        "completed_at": run.completed_at.isoformat() if run.completed_at else None,
    }


def _serialize_run_summary(run) -> dict[str, Any]:
    return {
        "id": run.id,
        "workflow": run.workflow_name,
        "status": run.status.value,
        "created_at": run.created_at.isoformat(),
        "completed_at": run.completed_at.isoformat() if run.completed_at else None,
    }
