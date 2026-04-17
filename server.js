'use strict';

require('dotenv').config();
const express = require('express');
const cookieParser = require('cookie-parser');
const path = require('path');
const { execSync } = require('child_process');
const os = require('os');
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
const NPM_BIN = os.homedir() + '/.npm-global/bin';
const CLI_ENV = { ...process.env, PATH: process.env.PATH + ':' + NPM_BIN };

app.use(express.json());
app.use(cookieParser());

// ── Security headers ──────────────────────────────────────────────────────────

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; " +
    "script-src 'self' 'unsafe-inline' https://cdn.tailwindcss.com; " +
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
    "font-src https://fonts.gstatic.com; " +
    "connect-src 'self'; " +
    "img-src 'self' data:;"
  );
  next();
});

// ── Login rate limiting ───────────────────────────────────────────────────────

const loginAttempts = new Map();
const LOGIN_MAX = 10;
const LOGIN_WINDOW_MS = 15 * 60 * 1000; // 15 minutes

function checkLoginRateLimit(ip) {
  const now = Date.now();
  const entry = loginAttempts.get(ip) || { count: 0, windowStart: now };
  if (now - entry.windowStart > LOGIN_WINDOW_MS) {
    entry.count = 0;
    entry.windowStart = now;
  }
  entry.count++;
  loginAttempts.set(ip, entry);
  return entry.count <= LOGIN_MAX;
}

// ── SSE clients ───────────────────────────────────────────────────────────────

const sseClients = new Set();

function broadcastSSE(event) {
  const data = `data: ${JSON.stringify(event)}\n\n`;
  for (const client of sseClients) {
    try { client.write(data); } catch (_) { sseClients.delete(client); }
  }
}

// ── Auth ─────────────────────────────────────────────────────────────────────

const AUTH_COOKIE = 'mc_auth';
const AUTH_VALUE = Buffer.from(PASSWORD).toString('base64');

function isAuthed(req) {
  return req.cookies[AUTH_COOKIE] === AUTH_VALUE;
}

function authMiddleware(req, res, next) {
  if (isAuthed(req)) return next();
  if (req.path === '/login' || req.path === '/api/login') return next();
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
  const ip = req.ip || req.connection.remoteAddress || 'unknown';
  if (!checkLoginRateLimit(ip)) {
    return res.status(429).json({ error: 'Too many attempts, try again later' });
  }
  if (req.body.password === PASSWORD) {
    res.cookie(AUTH_COOKIE, AUTH_VALUE, {
      httpOnly: true,
      maxAge: 7 * 24 * 60 * 60 * 1000,
      sameSite: 'strict',
    });
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

// ── SSE ───────────────────────────────────────────────────────────────────────

app.get('/api/sse', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.write(`data: ${JSON.stringify({ type: 'connected', ts: Date.now() })}\n\n`);

  sseClients.add(res);

  // Keepalive ping every 20s
  const keepalive = setInterval(() => {
    try { res.write(':keepalive\n\n'); } catch (_) {}
  }, 20000);

  req.on('close', () => {
    clearInterval(keepalive);
    sseClients.delete(res);
  });
});

// Periodic stats broadcast every 15s (only when clients are connected)
setInterval(async () => {
  if (!sseClients.size) return;
  try {
    const rawSessions = sessions.getSessions(60);
    const parsed = sessions.parseSessions(rawSessions);
    const running = parsed.subagents.filter(s => s.status === 'running' || s.status === 'active');
    broadcastSSE({
      type: 'stats.update',
      runningCount: running.length,
      totalSessions: parsed.count,
      ts: Date.now(),
    });
  } catch (_) {}
}, 15000);

// ── API ───────────────────────────────────────────────────────────────────────

app.get('/api/stats', async (req, res) => {
  try {
    const data = await cache.cached('stats', 10000, async () => {
      const [uptime, cpu, memory, gatewayStatus, disk, rawSessions] = await Promise.all([
        Promise.resolve(system.parseUptime()),
        Promise.resolve(system.parseCpu()),
        Promise.resolve(system.parseMemory()),
        Promise.resolve(system.getGatewayStatus()),
        Promise.resolve(system.getDiskUsage()),
        Promise.resolve(sessions.getSessions(60)),
      ]);

      const parsed = sessions.parseSessions(rawSessions);
      const tokenAgg = events.getTokenAggregates();
      const dailyStats = sessions.getDailyStats();

      // Heartbeat config
      let heartbeatConfig = null;
      try {
        const fs = require('fs');
        const clawConfig = JSON.parse(fs.readFileSync(os.homedir() + '/.openclaw/openclaw.json', 'utf8'));
        const hb = clawConfig?.agents?.defaults?.heartbeat || {};
        if (hb.every) {
          heartbeatConfig = {
            every: hb.every,
            activeHours: hb.activeHours || null,
            target: hb.target || null,
          };
        }
      } catch (_) {}

      // Last heartbeat
      const sessionsJson = sessions.loadSessionsJson();
      let lastHeartbeat = null;
      let latestHbTime = 0;
      for (const [key, v] of Object.entries(sessionsJson)) {
        const label = (v.label || '').toLowerCase();
        if (label.includes('heartbeat')) {
          const t = v.updatedAt || 0;
          if (t > latestHbTime) {
            latestHbTime = t;
            lastHeartbeat = { time: new Date(t).toISOString(), label: v.label, key };
          }
        }
      }

      // Running subagents (for overview panel)
      const now = Date.now();
      const running = parsed.subagents
        .filter(s => s.status === 'running' || s.status === 'active')
        .map(s => ({
          id: s.id,
          key: s.key,
          label: s.label,
          task: s.task ? s.task.slice(0, 100) : null,
          model: s.model,
          runtime: s.spawnTime ? Math.round((now - new Date(s.spawnTime)) / 1000) : null,
          tokens: s.tokens,
        }));

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
        disk: disk ? {
          percent: disk.percent,
          used: disk.usedFmt,
          total: disk.totalFmt,
          available: disk.availFmt,
        } : null,
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
        heartbeat: heartbeatConfig ? {
          config: heartbeatConfig,
          last: lastHeartbeat,
        } : null,
        tokensToday: dailyStats.tokensToday || tokenAgg.tokensToday,
        costToday: dailyStats.costToday || tokenAgg.costToday,
        tasksToday: dailyStats.subagentsToday,
        subagentsToday: dailyStats.subagentsToday,
        runningAgents: running,
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

      const recentActivity = await events.readEvents({ type: 'subagent', days: 1, limit: 20 });

      const mainEnriched = parsed.mainAgent ? {
        ...enrich(parsed.mainAgent),
        running: running.length,
        done: completed.length,
        killed: killed.length,
      } : null;

      return {
        main: mainEnriched,
        agents: [...running, ...completed, ...killed, ...other],
        subagents: { running, completed, killed, other },
        counts: {
          running: running.length,
          completed: completed.length,
          done: completed.length,
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

// Kill a running agent
app.post('/api/agents/kill', (req, res) => {
  const { key } = req.body;
  if (!key || typeof key !== 'string') return res.status(400).json({ error: 'key is required' });

  // Sanitize key: only allow expected characters
  const safeKey = key.replace(/[^a-zA-Z0-9:._-]/g, '');
  if (!safeKey) return res.status(400).json({ error: 'Invalid key' });

  try {
    execSync(`openclaw sessions kill "${safeKey}" 2>&1`, {
      encoding: 'utf8',
      timeout: 10000,
      env: CLI_ENV,
    });
    cache.set('agents', null, 0);
    cache.set('stats', null, 0);
    broadcastSSE({ type: 'agent.killed', key: safeKey });
    res.json({ ok: true });
  } catch (e) {
    const msg = (e.stdout || e.message || '').trim();
    res.status(500).json({ error: msg || 'Kill failed' });
  }
});

app.get('/api/activity', async (req, res) => {
  try {
    const { scope, type, days, page, limit, search } = req.query;
    const cacheKey = `activity:${scope}:${type}:${days}:${page}:${limit}:${search}`;
    const data = await cache.cached(cacheKey, 10000, async () => {
      const result = await events.readEvents({
        scope: scope || 'all',
        type: type || 'all',
        days: days ? parseInt(days) : null,
        page: page || 1,
        limit: limit || 50,
        search: search || '',
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
    ['stats', 'agents', 'tokens'].forEach(k => cache.set(k, null, 0));
    broadcastSSE({ type: 'event.new', event: saved });
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
      let heartbeatConfig = {};
      try {
        const fs = require('fs');
        const clawConfig = JSON.parse(fs.readFileSync(os.homedir() + '/.openclaw/openclaw.json', 'utf8'));
        heartbeatConfig = clawConfig?.agents?.defaults?.heartbeat || {};
      } catch (_) {}

      const sessionsJson = sessions.loadSessionsJson();
      const hbEntries = [];
      for (const [key, v] of Object.entries(sessionsJson)) {
        const label = (v.label || '').toLowerCase();
        if (label.includes('heartbeat')) {
          hbEntries.push({ key, label: v.label, updatedAt: v.updatedAt || 0, ...v });
        }
      }
      hbEntries.sort((a, b) => b.updatedAt - a.updatedAt);

      const last = hbEntries[0] || null;
      return {
        last: last ? {
          time: new Date(last.updatedAt).toISOString(),
          label: last.label,
          key: last.key,
        } : null,
        config: {
          every: heartbeatConfig.every || null,
          activeHours: heartbeatConfig.activeHours || null,
          target: heartbeatConfig.target || null,
        },
        count: hbEntries.length,
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

// Session detail — returns enriched info for a single session by key
app.get('/api/session', async (req, res) => {
  const key = req.query.key;
  if (!key || typeof key !== 'string') return res.status(400).json({ error: 'key is required' });

  try {
    const sessionsJson = sessions.loadSessionsJson();
    const entry = sessionsJson[key];
    if (!entry) return res.status(404).json({ error: 'Session not found' });

    // Enrich with full task brief (may be large)
    let task = null;
    if (entry.sessionFile) {
      task = sessions.extractTaskBrief(entry.sessionFile);
    }

    const now = Date.now();
    const spawnTime = entry.createdAt || entry.startTime || entry.updatedAt || null;
    const runtime = spawnTime ? Math.round((now - spawnTime) / 1000) : null;

    // Determine status using same logic as parseSessions
    const isSubagent = key.includes(':subagent:');
    const tokens = entry.totalTokens || 0;
    let status = entry.status || 'unknown';
    if (isSubagent) {
      const ageMs = entry.updatedAt ? (now - entry.updatedAt) : null;
      if (entry.abortedLastRun) status = 'killed';
      else if (tokens > 0) status = 'done';
      else if (ageMs !== null && ageMs > 300000) status = 'killed';
      else status = 'running';
    } else {
      status = 'running';
    }

    res.json({
      key,
      label: entry.label || key,
      model: entry.model || entry.modelOverride || null,
      status,
      tokens,
      contextLimit: entry.contextTokens || 200000,
      contextPercent: entry.contextTokens ? Math.round((tokens / entry.contextTokens) * 100) : null,
      spawnTime: spawnTime ? new Date(spawnTime).toISOString() : null,
      updatedAt: entry.updatedAt ? new Date(entry.updatedAt).toISOString() : null,
      runtime,
      task,
      channel: entry.channel || entry.kind || null,
      depth: entry.depth || 0,
      parentId: entry.parentId || null,
      sessionFile: entry.sessionFile ? path.basename(entry.sessionFile) : null,
      abortedLastRun: entry.abortedLastRun || false,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Start ─────────────────────────────────────────────────────────────────────

app.listen(PORT, HOST, () => {
  console.log(`Mission Control v2 running at http://${HOST}:${PORT}`);
});
