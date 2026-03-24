# Mission Control v2

Unified OpenClaw dashboard — system health, live agents, activity feed, token tracking.

## Features

- **Overview** — System stats (CPU, memory, uptime), gateway status, context window usage, heartbeat, daily summary
- **Agents** — Live view of main agent + all subagents grouped by status, clickable detail modal
- **Activity** — Filterable event feed from `events.jsonl`, paginated, expandable rows
- **GitHub** — Open + merged PRs, CI/Actions runs (requires GitHub token)
- **Tokens** — Token usage by day/week/month, model breakdown, scope/project breakdown, 14-day bar chart

## Deploy

```bash
git clone https://github.com/jackie-codecraft/mission-control.git
cd mission-control
npm install
cp .env.example .env
# Edit .env — set DASHBOARD_PASSWORD and optionally GITHUB_TOKEN
node server.js
```

Open http://localhost:3456

## Configuration

```env
DASHBOARD_PASSWORD=your-secure-password
PORT=3456
HOST=0.0.0.0
GITHUB_TOKEN=ghp_...        # Optional — enables GitHub tab
GITHUB_ORG=jackie-codecraft  # GitHub org or user to query
```

## Event Ingestion

Agents can fire events to the activity feed:

```bash
curl -s -X POST http://localhost:3456/api/events \
  -H "Content-Type: application/json" \
  -d '{
    "type": "subagent.completed",
    "label": "my-task",
    "scope": "myproject",
    "tokens": 4200,
    "model": "sonnet",
    "duration_ms": 85000,
    "result": "success",
    "summary": "Task completed successfully"
  }'
```

## Event Log Format

Events are stored in `data/events.jsonl` (append-only):

```json
{"type":"subagent.completed","label":"review-website","scope":"syncor","timestamp":"2026-03-24T21:54:00Z","tokens":4600,"model":"sonnet","duration_ms":112654,"result":"success","summary":"Website review completed"}
```

## Tech Stack

- **Backend:** Node.js + Express, no build step
- **Frontend:** Tailwind CSS (CDN) + Alpine.js (CDN)
- **Auth:** Cookie-based password auth
- **Storage:** Flat file `events.jsonl` for event log
- **Cache:** In-memory 10s TTL for all API responses

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/stats` | System stats, sessions, context |
| GET | `/api/agents` | Live agent/subagent data |
| GET | `/api/activity` | Event log (filterable) |
| GET | `/api/tokens` | Token aggregates |
| GET | `/api/heartbeat` | Heartbeat status |
| GET | `/api/github/prs` | GitHub PRs (requires token) |
| GET | `/api/github/ci` | GitHub CI runs (requires token) |
| POST | `/api/events` | Ingest an event |
