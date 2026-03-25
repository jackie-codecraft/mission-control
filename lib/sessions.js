'use strict';

const { execSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const NPM_BIN = os.homedir() + '/.npm-global/bin';
const ENV = { ...process.env, PATH: process.env.PATH + ':' + NPM_BIN };

const SESSIONS_JSON_PATH = path.join(os.homedir(), '.openclaw/agents/main/sessions/sessions.json');

// Load sessions.json for label enrichment
function loadSessionsJson() {
  try {
    const raw = fs.readFileSync(SESSIONS_JSON_PATH, 'utf8');
    return JSON.parse(raw);
  } catch (e) {
    return {};
  }
}

// Derive a human-readable label from a session key
function deriveLabel(key, sessionsJson) {
  // First check sessions.json for a label
  const entry = sessionsJson[key];
  if (entry && entry.label) return entry.label;

  // Derive from key: agent:main:subagent:UUID or agent:main:telegram:direct:ID
  if (key.includes(':telegram:')) {
    const parts = key.split(':');
    return 'Telegram: ' + parts[parts.length - 1];
  }
  if (key.includes(':subagent:')) {
    // Shorten UUID
    const uuid = key.split(':subagent:')[1] || '';
    return 'Subagent: ' + uuid.substring(0, 8);
  }
  if (key.includes(':cron:')) {
    const parts = key.split(':cron:');
    return 'Cron: ' + (parts[1] || '').substring(0, 8);
  }
  return key;
}

function getSessions(activeMins = 60) {
  try {
    const raw = execSync(`openclaw sessions --active ${activeMins} --json 2>/dev/null || openclaw sessions --json 2>/dev/null || echo '[]'`, {
      encoding: 'utf8',
      timeout: 10000,
      env: ENV
    });
    // Try to parse — sessions output may include extra text
    const jsonMatch = raw.match(/(\[[\s\S]*\]|\{[\s\S]*\})/);
    if (!jsonMatch) return [];
    const parsed = JSON.parse(jsonMatch[1]);
    // openclaw sessions --json returns { sessions: [...], count, path, ... }
    if (parsed && parsed.sessions && Array.isArray(parsed.sessions)) return parsed.sessions;
    if (Array.isArray(parsed)) return parsed;
    return [parsed];
  } catch (e) {
    return [];
  }
}

function parseSessions(sessions) {
  const agents = [];
  const subagents = [];
  let mainAgent = null;
  let totalTokens = 0;

  // Load labels from sessions.json
  const sessionsJson = loadSessionsJson();

  for (const s of sessions) {
    const key = s.key || s.id || 'unknown';
    const isSubagent = key.includes(':subagent:') || s.depth > 0 || s.parentId;

    // Get a meaningful label
    const label = deriveLabel(key, sessionsJson);

    // openclaw uses totalTokens; fall back to other field names
    const tokens = s.totalTokens || s.tokens || s.tokenCount || s.context?.tokens || 0;
    // contextTokens is the context window size
    const contextLimit = s.contextTokens || s.context?.limit || s.contextLimit || 200000;
    totalTokens += tokens;

    // Derive status from openclaw session fields
    let status = s.status || 'unknown';
    if (status === 'unknown') {
      if (s.abortedLastRun) status = 'killed';
      else if (s.updatedAt && (Date.now() - s.updatedAt) < 120000) status = 'running';
      else status = 'active';
    }

    const entry = {
      id: s.sessionId || s.id,
      key,
      label,
      model: s.model || s.modelOverride || 'unknown',
      status,
      tokens,
      contextLimit,
      contextPercent: contextLimit > 0 ? Math.round((tokens / contextLimit) * 100) : 0,
      spawnTime: s.startTime || s.createdAt || s.spawnTime || s.updatedAt,
      task: s.task || s.description || label || key || '',
      channel: s.channel || s.kind || '',
      depth: s.depth || 0,
      parentId: s.parentId || null,
    };

    if (isSubagent) {
      subagents.push(entry);
    } else {
      agents.push(entry);
      if (!mainAgent || entry.tokens > (mainAgent.tokens || 0)) {
        mainAgent = entry;
      }
    }
  }

  return { agents, subagents, mainAgent, totalTokens, count: sessions.length };
}

// Get daily stats from sessions.json (since events.jsonl may be empty)
function getDailyStats() {
  const sessionsJson = loadSessionsJson();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayMs = today.getTime();

  let subagentsToday = 0;
  let tokensToday = 0;

  for (const [key, v] of Object.entries(sessionsJson)) {
    const updated = v.updatedAt || 0;
    if (updated >= todayMs) {
      tokensToday += (v.totalTokens || 0);
      if (key.includes(':subagent:')) {
        subagentsToday++;
      }
    }
  }

  return { subagentsToday, tokensToday };
}

module.exports = { getSessions, parseSessions, getDailyStats, loadSessionsJson };
