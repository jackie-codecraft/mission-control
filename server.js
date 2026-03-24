'use strict';

require('dotenv').config();
const express = require('express');
const cookieParser = require('cookie-parser');
const path = require('path');
const cache = require('./lib/cache');
const system = require('./lib/system');
const sessions = require('./lib/sessions');
const events = require('./lib/events');
const github = require('./lib/github');

const app = express();
const PORT = process.env.PORT || 3456;
const HOST = process.env.HOST || '0.0.0.0';
const PASSWORD = process.env.DASHBOARD_PASSWORD || 'changeme';
const GITHUB_TOKEN = process.env.GITHUB_TOKEN || '';
const GITHUB_ORG = process.env.GITHUB_ORG || 'jackie-codecraft';

app.use(express.json());
app.use(cookieParser());

// ── Auth ─────────────────────────────────────────────────────────────────────

const AUTH_COOKIE = 'mc_auth';
const AUTH_VALUE = Buffer.from(PASSWORD).toString('base64');

function isAuthed(req) {
  return req.cookies[AUTH_COOKIE] === AUTH_VALUE;
}

function authMiddleware(req, res, next) {
  if (isAuthed(req)) return next();
  // Allow login page and login POST
  if (req.path === '/login' || req.path === '/api/login') return next();
  // Redirect HTML requests to login
  const acceptsHtml = req.headers.accept && req.headers.accept.includes('text/html');
  if (acceptsHtml) return res.redirect('/login');
  res.status(401).json({ error: 'Unauthorized' });
}

app.use(authMiddleware);

// ── Login ─────────────────────────────────────────────────────────────────────

app.get('/login', (req, res) => {
  if (isAuthed(req)) return res.redirect('/');
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Mission Control — Login</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    body { background: #0f1117; font-family: 'Inter', sans-serif; }
    .card { background: #1a1d26; border: 1px solid #2d3148; }
    .btn-primary { background: #00d2ff; color: #0f1117; }
    .btn-primary:hover { background: #00b8d9; }
    input { background: #222639; border: 1px solid #2d3148; color: #e2e8f0; }
    input:focus { border-color: #00d2ff; outline: none; }
  </style>
</head>
<body class="min-h-screen flex items-center justify-center">
  <div class="card rounded-2xl p-8 w-full max-w-sm shadow-2xl">
    <div class="text-center mb-8">
      <div class="text-4xl mb-3">🦝</div>
      <h1 class="text-white text-2xl font-bold">Mission Control</h1>
      <p class="text-slate-400 text-sm mt-1">OpenClaw Dashboard v2</p>
    </div>
    <form id="loginForm" class="space-y-4">
      <div>
        <label class="block text-slate-300 text-sm font-medium mb-1">Password</label>
        <input type="password" id="password" class="w-full rounded-lg px-3 py-2 text-sm" placeholder="Enter password" autofocus>
      </div>
      <div id="error" class="text-red-400 text-sm hidden">Incorrect password</div>
      <button type="submit" class="btn-primary w-full rounded-lg py-2 font-semibold text-sm transition-colors">
        Sign In
      </button>
    </form>
  </div>
  <script>
    document.getElementById('loginForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const pw = document.getElementById('password').value;
      const r = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: pw })
      });
      if (r.ok) {
        window.location.href = '/';
      } else {
        document.getElementById('error').classList.remove('hidden');
      }
    });
  </script>
</body>
</html>`);
});

app.post('/api/login', (req, res) => {
  if (req.body.password === PASSWORD) {
    res.cookie(AUTH_COOKIE, AUTH_VALUE, { httpOnly: true, maxAge: 7 * 24 * 60 * 60 * 1000 });
    res.json({ ok: true });
  } else {
    res.status(401).json({ error: 'Invalid password' });
  }
});

app.post('/api/logout', (req, res) => {
  res.clearCookie(AUTH_COOKIE);
  res.json({ ok: true });
});

// ── Static ────────────────────────────────────────────────────────────────────

app.use(express.static(path.join(__dirname, 'public')));

// ── API ───────────────────────────────────────────────────────────────────────

app.get('/api/stats', async (req, res) => {
  try {
    const data = await cache.cached('stats', 10000, async () => {
      const [uptime, cpu, memory, gatewayStatus, rawSessions] = await Promise.all([
        Promise.resolve(system.parseUptime()),
        Promise.resolve(system.parseCpu()),
        Promise.resolve(system.parseMemory()),
        Promise.resolve(system.getGatewayStatus()),
        Promise.resolve(sessions.getSessions(60)),
      ]);

      const parsed = sessions.parseSessions(rawSessions);
      const tokenAgg = events.getTokenAggregates();

      // Heartbeat: look for heartbeat sessions in recent sessions
      const heartbeatSession = rawSessions.find(s =>
        (s.label || '').toLowerCase().includes('heartbeat')
      );

      return {
        uptime: uptime.uptime,
        cpu: cpu.cpuPercent,
        cpuLoad: cpu.load1,
        memory: {
          percent: memory.percent,
          used: memory.usedFmt,
          total: memory.totalFmt,
          available: memory.availFmt,
        },
        gateway: gatewayStatus.status,
        sessions: {
          total: parsed.count,
          agents: parsed.agents.length,
          subagents: parsed.subagents.length,
          running: rawSessions.filter(s => s.status === 'running' || s.status === 'active').length,
          totalTokens: parsed.totalTokens,
        },
        context: parsed.mainAgent ? {
          tokens: parsed.mainAgent.tokens,
          limit: parsed.mainAgent.contextLimit,
          percent: Math.round((parsed.mainAgent.tokens / parsed.mainAgent.contextLimit) * 100),
        } : null,
        heartbeat: heartbeatSession ? {
          last: heartbeatSession.startTime || heartbeatSession.createdAt,
          result: heartbeatSession.status,
          label: heartbeatSession.label,
        } : null,
        tokensToday: tokenAgg.tokensToday,
        tasksToday: tokenAgg.dailyChart[tokenAgg.dailyChart.length - 1]?.tokens > 0 ? '—' : 0,
        subagentsToday: rawSessions.filter(s => {
          const isSubagent = (s.label || '').includes('subagent') || s.depth > 0;
          const today = new Date(); today.setHours(0, 0, 0, 0);
          return isSubagent && new Date(s.startTime || s.createdAt || 0) >= today;
        }).length,
        timestamp: new Date().toISOString(),
      };
    });
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/agents', async (req, res) => {
  try {
    const data = await cache.cached('agents', 10000, async () => {
      const rawSessions = sessions.getSessions(120);
      const parsed = sessions.parseSessions(rawSessions);

      const now = Date.now();
      const enrich = (s) => ({
        ...s,
        runtime: s.spawnTime ? Math.round((now - new Date(s.spawnTime)) / 1000) : null,
      });

      const running = parsed.subagents.filter(s => s.status === 'running' || s.status === 'active').map(enrich);
      const completed = parsed.subagents.filter(s => s.status === 'completed' || s.status === 'done').map(enrich);
      const killed = parsed.subagents.filter(s => s.status === 'killed' || s.status === 'error' || s.status === 'failed').map(enrich);
      const other = parsed.subagents.filter(s => !['running','active','completed','done','killed','error','failed'].includes(s.status)).map(enrich);

      // Recent activity from events
      const recentActivity = await events.readEvents({ type: 'subagent', days: 1, limit: 20 });

      return {
        main: parsed.mainAgent ? enrich(parsed.mainAgent) : null,
        subagents: { running, completed, killed, other },
        counts: {
          running: running.length,
          completed: completed.length,
          killed: killed.length,
          total: parsed.subagents.length,
        },
        recentActivity: recentActivity.items,
        timestamp: new Date().toISOString(),
      };
    });
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/activity', async (req, res) => {
  try {
    const { scope, type, days, page, limit } = req.query;
    const cacheKey = `activity:${scope}:${type}:${days}:${page}:${limit}`;
    const data = await cache.cached(cacheKey, 10000, async () => {
      const result = await events.readEvents({
        scope: scope || 'all',
        type: type || 'all',
        days: days ? parseInt(days) : null,
        page: page || 1,
        limit: limit || 50,
      });
      const { scopes, types } = events.getScopes();
      return { ...result, scopes, types };
    });
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/events', (req, res) => {
  try {
    const event = req.body;
    if (!event.type) return res.status(400).json({ error: 'type is required' });
    const saved = events.appendEvent(event);
    // Bust caches
    ['stats', 'agents'].forEach(k => cache.set(k, null, 0));
    res.json({ ok: true, event: saved });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/tokens', async (req, res) => {
  try {
    const data = await cache.cached('tokens', 10000, () => {
      return events.getTokenAggregates();
    });
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/heartbeat', async (req, res) => {
  try {
    const data = await cache.cached('heartbeat', 30000, async () => {
      const rawSessions = sessions.getSessions(120);
      const hbSessions = rawSessions.filter(s =>
        (s.label || '').toLowerCase().includes('heartbeat')
      ).sort((a, b) => new Date(b.startTime || b.createdAt || 0) - new Date(a.startTime || a.createdAt || 0));

      const last = hbSessions[0] || null;
      return {
        last: last ? {
          time: last.startTime || last.createdAt,
          status: last.status,
          label: last.label,
          tokens: last.tokens,
        } : null,
        schedule: process.env.HEARTBEAT_SCHEDULE || '0 */6 * * *',
        count: hbSessions.length,
      };
    });
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/github/prs', async (req, res) => {
  if (!GITHUB_TOKEN) return res.json({ enabled: false, message: 'No GitHub token configured' });
  try {
    const data = await cache.cached('github:prs', 60000, () =>
      github.getPRs(GITHUB_TOKEN, GITHUB_ORG, req.query.repo)
    );
    res.json({ enabled: true, ...data });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/github/ci', async (req, res) => {
  if (!GITHUB_TOKEN) return res.json({ enabled: false, message: 'No GitHub token configured' });
  try {
    const data = await cache.cached('github:ci', 60000, () =>
      github.getCI(GITHUB_TOKEN, GITHUB_ORG, req.query.repo)
    );
    res.json({ enabled: true, runs: data });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/config', (req, res) => {
  res.json({
    githubEnabled: !!GITHUB_TOKEN,
    githubOrg: GITHUB_ORG,
  });
});

// ── Start ─────────────────────────────────────────────────────────────────────

app.listen(PORT, HOST, () => {
  console.log(`Mission Control v2 running at http://${HOST}:${PORT}`);
});
