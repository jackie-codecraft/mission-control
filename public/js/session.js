// session.js — Session detail page

let sessionKey = null;
let killInProgress = false;

function getKey() {
  const params = new URLSearchParams(window.location.search);
  return params.get('key');
}

function dotClass(status) {
  const map = { running: 'dot-cyan', active: 'dot-cyan', completed: 'dot-green', done: 'dot-green', killed: 'dot-red', error: 'dot-red', failed: 'dot-red' };
  return map[status?.toLowerCase()] || 'dot-gray';
}

function metaRow(label, value, mono) {
  if (!value && value !== 0) return '';
  return `
    <div style="display:flex;gap:1rem;align-items:flex-start;border-bottom:1px solid var(--border);padding:0.4rem 0;">
      <span style="width:120px;flex-shrink:0;color:var(--muted);">${MC.escHtml(label)}</span>
      <span style="flex:1;color:var(--text);${mono ? "font-family:'JetBrains Mono',monospace;font-size:0.8125rem;word-break:break-all;" : ''}">${MC.escHtml(String(value))}</span>
    </div>
  `;
}

async function loadSession() {
  sessionKey = getKey();
  if (!sessionKey) {
    document.getElementById('session-loading').style.display = 'none';
    document.getElementById('session-error').style.display = '';
    document.getElementById('session-error').innerHTML = '<div style="color:var(--red);padding:1rem;">No session key provided. <a href="/agents.html" style="color:var(--cyan);">Go to Agents</a></div>';
    return;
  }

  try {
    const data = await MC.apiFetch('/api/session?key=' + encodeURIComponent(sessionKey));

    document.getElementById('session-loading').style.display = 'none';
    document.getElementById('session-header').style.display = '';
    document.getElementById('session-stats').style.display = '';
    document.getElementById('session-meta').style.display = '';

    // Update page title
    document.title = `Mission Control — ${data.label || sessionKey}`;

    // Header
    document.getElementById('s-label').textContent = data.label || sessionKey;
    document.getElementById('s-key').textContent = sessionKey;
    const dot = document.getElementById('s-status-dot');
    dot.className = 'dot ' + dotClass(data.status);
    document.getElementById('s-status-badge').innerHTML = MC.statusBadge(data.status);

    const isRunning = data.status === 'running' || data.status === 'active';
    if (isRunning) {
      document.getElementById('kill-btn').style.display = '';
    }

    // Stats
    document.getElementById('s-status').textContent = data.status || '—';
    document.getElementById('s-runtime').textContent = data.runtime ? MC.formatRuntime(data.runtime) : '—';
    document.getElementById('s-tokens').textContent = MC.formatNumber(data.tokens || 0);

    const ctxPct = data.contextPercent;
    document.getElementById('s-context').textContent = ctxPct !== null ? ctxPct + '%' : '—';
    if (ctxPct !== null) {
      const bar = document.getElementById('s-context-bar');
      bar.style.width = Math.min(100, ctxPct) + '%';
      bar.className = 'progress-fill' + (ctxPct > 80 ? ' danger' : ctxPct > 60 ? ' warning' : '');
    }

    // Task
    if (data.task) {
      document.getElementById('session-task').style.display = '';
      document.getElementById('s-task').textContent = data.task;
    }

    // Metadata rows
    const rows = [
      metaRow('Model', data.model, true),
      metaRow('Channel', data.channel),
      metaRow('Depth', data.depth !== null ? String(data.depth) : null),
      metaRow('Parent', data.parentId, true),
      metaRow('Spawned', data.spawnTime ? new Date(data.spawnTime).toLocaleString() : null),
      metaRow('Last updated', data.updatedAt ? new Date(data.updatedAt).toLocaleString() : null),
      metaRow('Session file', data.sessionFile, true),
      metaRow('Aborted', data.abortedLastRun ? 'Yes' : null),
    ].filter(Boolean);

    document.getElementById('s-meta-rows').innerHTML = rows.join('') || '<div style="color:var(--muted);">No metadata available</div>';

  } catch (e) {
    document.getElementById('session-loading').style.display = 'none';
    const errEl = document.getElementById('session-error');
    errEl.style.display = '';
    errEl.innerHTML = `<div style="color:var(--red);padding:1rem;">Failed to load session: ${MC.escHtml(e.message)}. <a href="/agents.html" style="color:var(--cyan);">Go to Agents</a></div>`;
  }
}

async function killSession() {
  if (killInProgress || !sessionKey) return;
  killInProgress = true;
  const btn = document.getElementById('kill-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Killing…'; }

  try {
    const result = await MC.apiPost('/api/agents/kill', { key: sessionKey });
    if (result.ok) {
      if (btn) { btn.style.display = 'none'; }
      document.getElementById('s-status-badge').innerHTML = MC.statusBadge('killed');
      document.getElementById('s-status').textContent = 'killed';
      const dot = document.getElementById('s-status-dot');
      dot.className = 'dot dot-red';
    } else {
      alert('Kill failed: ' + (result.data?.error || 'Unknown error'));
      if (btn) { btn.disabled = false; btn.textContent = 'Kill'; }
    }
  } catch (e) {
    alert('Kill error: ' + e.message);
    if (btn) { btn.disabled = false; btn.textContent = 'Kill'; }
  } finally {
    killInProgress = false;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  MC.injectNav('/agents.html');
  loadSession();
});
