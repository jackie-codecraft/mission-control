'use strict';

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const DATA_DIR = path.join(__dirname, '..', 'data');
const EVENTS_FILE = path.join(DATA_DIR, 'events.jsonl');

function ensureFile() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(EVENTS_FILE)) fs.writeFileSync(EVENTS_FILE, '');
}

function appendEvent(event) {
  ensureFile();
  const line = JSON.stringify({ ...event, timestamp: event.timestamp || new Date().toISOString() }) + '\n';
  fs.appendFileSync(EVENTS_FILE, line);
  return event;
}

async function readEvents(filters = {}) {
  ensureFile();
  const events = [];
  const fileContent = fs.readFileSync(EVENTS_FILE, 'utf8');
  const lines = fileContent.split('\n').filter(Boolean);

  for (const line of lines) {
    try {
      const event = JSON.parse(line);
      events.push(event);
    } catch (_) {}
  }

  // Apply filters
  let filtered = events;

  if (filters.scope && filters.scope !== 'all') {
    filtered = filtered.filter(e => e.scope === filters.scope);
  }
  if (filters.type && filters.type !== 'all') {
    filtered = filtered.filter(e => e.type === filters.type || (e.type && e.type.startsWith(filters.type)));
  }
  if (filters.days) {
    const cutoff = new Date(Date.now() - filters.days * 24 * 60 * 60 * 1000);
    filtered = filtered.filter(e => new Date(e.timestamp) >= cutoff);
  }

  // Sort newest first
  filtered.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

  // Pagination
  const page = parseInt(filters.page) || 1;
  const limit = parseInt(filters.limit) || 50;
  const offset = (page - 1) * limit;
  const total = filtered.length;
  const items = filtered.slice(offset, offset + limit);

  return { items, total, page, limit, pages: Math.ceil(total / limit) };
}

function getTokenAggregates() {
  ensureFile();
  const fileContent = fs.readFileSync(EVENTS_FILE, 'utf8');
  const lines = fileContent.split('\n').filter(Boolean);

  const now = new Date();
  const todayStart = new Date(now); todayStart.setHours(0, 0, 0, 0);
  const weekStart = new Date(now); weekStart.setDate(now.getDate() - 7);
  const monthStart = new Date(now); monthStart.setDate(now.getDate() - 30);

  let tokensToday = 0, tokensWeek = 0, tokensMonth = 0;
  const byModel = {};
  const byScope = {};
  const byDay = {}; // YYYY-MM-DD -> tokens

  for (const line of lines) {
    try {
      const e = JSON.parse(line);
      const tokens = e.tokens || 0;
      if (!tokens) continue;
      const ts = new Date(e.timestamp);
      if (ts >= todayStart) tokensToday += tokens;
      if (ts >= weekStart) tokensWeek += tokens;
      if (ts >= monthStart) tokensMonth += tokens;

      const model = e.model || 'unknown';
      byModel[model] = (byModel[model] || 0) + tokens;

      const scope = e.scope || 'unknown';
      byScope[scope] = (byScope[scope] || 0) + tokens;

      const day = e.timestamp.slice(0, 10);
      byDay[day] = (byDay[day] || 0) + tokens;
    } catch (_) {}
  }

  // Build last 14 days array
  const dailyChart = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    dailyChart.push({ date: key, tokens: byDay[key] || 0 });
  }

  return { tokensToday, tokensWeek, tokensMonth, byModel, byScope, dailyChart };
}

function getScopes() {
  ensureFile();
  const fileContent = fs.readFileSync(EVENTS_FILE, 'utf8');
  const scopes = new Set();
  const types = new Set();
  for (const line of fileContent.split('\n').filter(Boolean)) {
    try {
      const e = JSON.parse(line);
      if (e.scope) scopes.add(e.scope);
      if (e.type) types.add(e.type);
    } catch (_) {}
  }
  return { scopes: [...scopes].sort(), types: [...types].sort() };
}

module.exports = { appendEvent, readEvents, getTokenAggregates, getScopes };
