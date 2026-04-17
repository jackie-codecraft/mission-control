// shared.js — Common utilities for Mission Control v2

const NAV_TABS = [
  { href: '/', label: 'Overview', icon: '⬡' },
  { href: '/agents.html', label: 'Agents', icon: '⚡' },
  { href: '/activity.html', label: 'Activity', icon: '📋' },
  { href: '/github.html', label: 'GitHub', icon: '⑂' },
  { href: '/tokens.html', label: 'Tokens', icon: '◈' },
];

function renderNav(activeHref) {
  const current = window.location.pathname;
  const active = activeHref || (current === '/' || current === '/index.html' ? '/' : current.replace('/index.html', '/'));

  return `
    <nav class="nav-bar">
      <div class="nav-inner">
        <a href="/" class="nav-brand">
          <span>🦝</span>
          <span>Mission Control</span>
        </a>
        <div class="nav-tabs">
          ${NAV_TABS.map(t => `
            <a href="${t.href}" class="nav-tab ${active === t.href ? 'active' : ''}" title="${t.label}">
              <span>${t.icon}</span>
              <span class="nav-tab-label">${t.label}</span>
            </a>
          `).join('')}
        </div>
        <div style="display:flex;align-items:center;gap:0.5rem;margin-left:1rem;">
          <span class="live-dot" id="live-dot"></span>
          <span style="font-size:0.75rem;color:var(--muted)" id="live-label">Live</span>
          <button onclick="logout()" style="margin-left:1rem;background:none;border:none;cursor:pointer;color:var(--muted);font-size:0.75rem;">Sign out</button>
        </div>
      </div>
    </nav>
  `;
}

function injectNav(activeHref) {
  const el = document.getElementById('nav');
  if (el) el.innerHTML = renderNav(activeHref);
}

async function apiFetch(path) {
  const r = await fetch(path);
  if (r.status === 401) {
    window.location.href = '/login';
    throw new Error('Unauthorized');
  }
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

async function apiPost(path, body) {
  const r = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (r.status === 401) {
    window.location.href = '/login';
    throw new Error('Unauthorized');
  }
  return { ok: r.ok, status: r.status, data: await r.json().catch(() => ({})) };
}

async function logout() {
  await fetch('/api/logout', { method: 'POST' });
  window.location.href = '/login';
}

function timeAgo(ts) {
  if (!ts) return '—';
  const diff = Date.now() - new Date(ts);
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

function formatRuntime(seconds) {
  if (!seconds && seconds !== 0) return '—';
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m < 60) return `${m}m ${s}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

function formatTokens(n) {
  if (!n) return '0';
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
  return n.toString();
}

function formatNumber(n) {
  if (!n) return '0';
  return n.toLocaleString();
}

function formatCost(usd) {
  if (!usd && usd !== 0) return '—';
  if (usd < 0.01) return '<$0.01';
  if (usd < 1) return '$' + usd.toFixed(2);
  if (usd < 100) return '$' + usd.toFixed(2);
  return '$' + Math.round(usd).toLocaleString();
}

function statusBadge(status) {
  const map = {
    running: 'badge-cyan',
    active: 'badge-cyan',
    completed: 'badge-green',
    done: 'badge-green',
    success: 'badge-green',
    killed: 'badge-red',
    error: 'badge-red',
    failed: 'badge-red',
    pending: 'badge-amber',
    unknown: 'badge-gray',
  };
  const cls = map[status?.toLowerCase()] || 'badge-gray';
  return `<span class="badge ${cls}">${status || 'unknown'}</span>`;
}

function typeBadge(type) {
  const map = {
    'subagent.completed': 'badge-green',
    'subagent.started': 'badge-cyan',
    'subagent.killed': 'badge-red',
    'task.completed': 'badge-green',
    'task.started': 'badge-cyan',
    'pr': 'badge-purple',
    'research': 'badge-amber',
    'email': 'badge-amber',
    'error': 'badge-red',
  };
  const cls = map[type] || 'badge-gray';
  return `<span class="badge ${cls}">${type || 'event'}</span>`;
}

function escHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function setError(id, msg) {
  const el = document.getElementById(id);
  if (el) el.innerHTML = `<div style="color:var(--red);padding:1rem;font-size:0.875rem;">⚠ ${escHtml(msg)}</div>`;
}

function showLoading(id) {
  const el = document.getElementById(id);
  if (el) el.classList.add('loading');
}

function hideLoading(id) {
  const el = document.getElementById(id);
  if (el) el.classList.remove('loading');
}

// Auto-refresh helper
function autoRefresh(fn, intervalMs) {
  fn();
  return setInterval(fn, intervalMs);
}

// SSE connection helper
function connectSSE(handlers) {
  let es;
  let retryTimeout;

  function connect() {
    try {
      es = new EventSource('/api/sse');

      es.onopen = () => {
        const dot = document.getElementById('live-dot');
        const label = document.getElementById('live-label');
        if (dot) dot.style.background = 'var(--green)';
        if (label) label.textContent = 'Live';
      };

      es.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data);
          if (handlers[msg.type]) handlers[msg.type](msg);
          if (handlers['*']) handlers['*'](msg);
        } catch (_) {}
      };

      es.onerror = () => {
        const dot = document.getElementById('live-dot');
        if (dot) dot.style.background = 'var(--amber)';
        es.close();
        retryTimeout = setTimeout(connect, 5000);
      };
    } catch (_) {}
  }

  connect();

  return () => {
    if (es) es.close();
    if (retryTimeout) clearTimeout(retryTimeout);
  };
}

// Expose globally
window.MC = {
  apiFetch, apiPost, timeAgo, formatRuntime, formatTokens, formatNumber, formatCost,
  statusBadge, typeBadge, escHtml, setError, showLoading, hideLoading,
  autoRefresh, injectNav, logout, connectSSE,
};
