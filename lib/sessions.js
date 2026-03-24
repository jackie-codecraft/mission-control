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
    return Array.isArray(parsed) ? parsed : [parsed];
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
    const label = s.label || s.id || 'unknown';
    const isSubagent = label.includes('subagent') || s.depth > 0 || s.parentId;
    const tokens = s.tokens || s.tokenCount || s.context?.tokens || 0;
    totalTokens += tokens;

    const entry = {
      id: s.id || s.sessionId,
      label,
      model: s.model || 'unknown',
      status: s.status || 'unknown',
      tokens,
      contextLimit: s.context?.limit || s.contextLimit || 200000,
      spawnTime: s.startTime || s.createdAt || s.spawnTime,
      task: s.task || s.description || s.label || '',
      channel: s.channel || '',
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
