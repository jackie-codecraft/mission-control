'use strict';

const { execSync } = require('child_process');

function parseUptime() {
  try {
    const raw = execSync('uptime', { encoding: 'utf8', timeout: 5000 }).trim();
    // e.g. " 22:00:01 up 5 days, 3:12,  1 user,  load average: 0.15, 0.20, 0.18"
    const uptimeMatch = raw.match(/up\s+(.*?),\s+\d+ user/);
    const loadMatch = raw.match(/load average:\s+([\d.]+)/);
    return {
      raw,
      uptime: uptimeMatch ? uptimeMatch[1].trim() : 'unknown',
      load1: loadMatch ? parseFloat(loadMatch[1]) : 0,
    };
  } catch (e) {
    return { raw: '', uptime: 'unknown', load1: 0 };
  }
}

function parseCpu() {
  try {
    // Use /proc/loadavg for simplicity
    const raw = require('fs').readFileSync('/proc/loadavg', 'utf8').trim();
    const parts = raw.split(' ');
    const load1 = parseFloat(parts[0]);
    // Try to get CPU count for percentage estimation
    let cpuCount = 1;
    try {
      const cpuinfo = require('fs').readFileSync('/proc/cpuinfo', 'utf8');
      cpuCount = (cpuinfo.match(/^processor/gm) || []).length || 1;
    } catch (_) {}
    const cpuPercent = Math.min(100, Math.round((load1 / cpuCount) * 100));
    return { load1, load5: parseFloat(parts[1]), load15: parseFloat(parts[2]), cpuPercent, cpuCount };
  } catch (e) {
    return { load1: 0, load5: 0, load15: 0, cpuPercent: 0, cpuCount: 1 };
  }
}

function parseMemory() {
  try {
    const raw = require('fs').readFileSync('/proc/meminfo', 'utf8');
    const get = (key) => {
      const m = raw.match(new RegExp(`^${key}:\\s+(\\d+)`, 'm'));
      return m ? parseInt(m[1]) * 1024 : 0; // kB to bytes
    };
    const total = get('MemTotal');
    const free = get('MemFree');
    const buffers = get('Buffers');
    const cached = get('Cached');
    const available = get('MemAvailable') || (free + buffers + cached);
    const used = total - available;
    const percent = total ? Math.round((used / total) * 100) : 0;
    const fmt = (b) => {
      if (b >= 1e9) return (b / 1e9).toFixed(1) + 'G';
      if (b >= 1e6) return (b / 1e6).toFixed(0) + 'M';
      return (b / 1e3).toFixed(0) + 'K';
    };
    return { total, used, available, percent, totalFmt: fmt(total), usedFmt: fmt(used), availFmt: fmt(available) };
  } catch (e) {
    return { total: 0, used: 0, available: 0, percent: 0, totalFmt: '?', usedFmt: '?', availFmt: '?' };
  }
}

function getGatewayStatus() {
  try {
    // Use systemctl --user is-active which returns clean "active" or "inactive"
    const result = execSync('systemctl --user is-active openclaw-gateway 2>/dev/null || echo inactive', {
      encoding: 'utf8',
      timeout: 5000,
    }).trim();
    const isRunning = result === 'active' || result === 'running';
    return { status: isRunning ? 'running' : 'stopped', raw: result };
  } catch (e) {
    // Fallback: try openclaw gateway status and parse output
    try {
      const result2 = execSync('openclaw gateway status 2>&1', {
        encoding: 'utf8',
        timeout: 8000,
        env: { ...process.env, PATH: process.env.PATH + ':' + require('os').homedir() + '/.npm-global/bin' }
      });
      const isRunning = result2.toLowerCase().includes('running') || result2.toLowerCase().includes('active');
      return { status: isRunning ? 'running' : 'stopped', raw: result2.trim() };
    } catch (e2) {
      return { status: 'unknown', raw: e2.message };
    }
  }
}

module.exports = { parseUptime, parseCpu, parseMemory, getGatewayStatus };
