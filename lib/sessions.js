'use strict';

const { execSync } = require('child_process');
const os = require('os');

const NPM_BIN = os.homedir() + '/.npm-global/bin';
const ENV = { ...process.env, PATH: process.env.PATH + ':' + NPM_BIN };

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

  for (const s of sessions) {
    // openclaw uses 'key' as the session identifier (e.g. "agent:main:telegram:direct:xxx")
    const label = s.key || s.label || s.id || 'unknown';
    const isSubagent = label.includes('subagent') || s.depth > 0 || s.parentId;
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
      label,
      model: s.model || s.modelOverride || 'unknown',
      status,
      tokens,
      contextLimit,
      contextPercent: contextLimit > 0 ? Math.round((tokens / contextLimit) * 100) : 0,
      spawnTime: s.startTime || s.createdAt || s.spawnTime || s.updatedAt,
      task: s.task || s.description || s.label || s.key || '',
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

module.exports = { getSessions, parseSessions };
