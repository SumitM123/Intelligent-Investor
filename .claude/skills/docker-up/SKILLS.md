---
name: docker-up
description: Starts docker-compose containers for a given directory (main repo or a worktree), optionally scoped to specific services. Invoke manually with /docker-up.
disable-model-invocation: true
---

# Docker Up

Starts the project's Docker stack (`docker-compose.dev.yml`) from a specific directory, optionally limited to specific containers/services.

## Inputs

Read the skill args for two pieces of information (parse from free text if not explicitly labeled):

- **directory** — which checkout to run from. Defaults to the main repo root if not specified. If the user names a worktree (e.g. "frontend-stock-diversify"), resolve it via `git worktree list` and use that path.
- **containers** — which services to start: `frontend`, `backend`, `db`, or any combination. Defaults to all services if not specified.

If either input is ambiguous (e.g. a worktree name that doesn't match any entry in `git worktree list`), ask the user rather than guessing.

## Port conflict warning (important)

`docker-compose.dev.yml` binds fixed host ports: **3000** (frontend), **8000** (backend), **5434** (db). These are the same across every worktree, so **only one checkout's stack can run at a time**. Before starting containers:

1. Run `docker ps` to check what's already running.
2. If another checkout's stack is already up and occupying these ports, tell the user which stack is running and ask whether to stop it first before starting the requested one. Do not stop another stack's containers without confirmation.

## Steps

1. Resolve the target directory (main repo root or worktree path from `git worktree list`).
2. Check for port conflicts as described above; resolve with the user if needed.
3. Run, from the resolved directory:
   ```bash
   docker compose -f docker-compose.dev.yml up --build -d [service ...]
   ```
   Omit the service list to start all three (`frontend`, `backend`, `db`); otherwise pass only the requested service names.
4. Verify with `docker ps --format "table {{.Names}}\t{{.Ports}}\t{{.Status}}"` and report the running containers and their ports back to the user.
