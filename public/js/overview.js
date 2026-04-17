// overview.js — Dashboard stats polling

async function loadStats() {
  try {
    const data = await MC.apiFetch('/api/stats');

    // Uptime
    document.getElementById('stat-uptime').textContent = data.uptime || '—';

    // CPU
    const cpu = data.cpu || 0;
    document.getElementById('stat-cpu').textContent = cpu + '%';
    document.getElementById('cpu-bar').style.width = cpu + '%';
    document.getElementById('cpu-bar').className = 'progress-fill' +
      (cpu > 80 ? ' danger' : cpu > 60 ? ' warning' : '');

    // Memory
    const mem = data.memory || {};
    document.getElementById('stat-memory').textContent = mem.percent ? mem.percent + '%' : '—';
    document.getElementById('stat-memory-sub').textContent = `${mem.used || '?'} / ${mem.total || '?'}`;
    document.getElementById('memory-bar').style.width = (mem.percent || 0) + '%';
    document.getElementById('memory-bar').className = 'progress-fill' +
      (mem.percent > 80 ? ' danger' : mem.percent > 60 ? ' warning' : '');

    // Disk
    const disk = data.disk;
    if (disk) {
      document.getElementById('stat-disk').textContent = disk.percent + '%';
      document.getElementById('stat-disk-sub').textContent = `${disk.used} / ${disk.total}`;
      document.getElementById('disk-bar').style.width = disk.percent + '%';
      document.getElementById('disk-bar').className = 'progress-fill' +
        (disk.percent > 85 ? ' danger' : disk.percent > 70 ? ' warning' : '');
    } else {
      document.getElementById('stat-disk').textContent = '—';
    }

    // Gateway
    const gw = data.gateway || 'unknown';
    const gwEl = document.getElementById('stat-gateway');
    gwEl.textContent = gw === 'running' ? 'Running' : gw === 'stopped' ? 'Stopped' : 'Unknown';
    gwEl.style.color = gw === 'running' ? 'var(--green)' : gw === 'stopped' ? 'var(--red)' : 'var(--amber)';

    // Context
    const ctx = data.context;
    if (ctx) {
      document.getElementById('ctx-tokens').textContent = MC.formatTokens(ctx.tokens);
      document.getElementById('ctx-percent').textContent = ctx.percent + '%';
      document.getElementById('ctx-limit').textContent = MC.formatTokens(ctx.limit);
      document.getElementById('ctx-bar').style.width = Math.min(100, ctx.percent) + '%';
      document.getElementById('ctx-bar').className = 'progress-fill' +
        (ctx.percent > 80 ? ' danger' : ctx.percent > 60 ? ' warning' : '');
    } else {
      document.getElementById('ctx-tokens').textContent = '—';
      document.getElementById('ctx-percent').textContent = '—';
    }

    // Heartbeat
    const hb = data.heartbeat;
    if (hb && hb.last) {
      document.getElementById('hb-last').textContent = MC.timeAgo(hb.last.time);
      document.getElementById('hb-result').textContent = hb.last.label || '—';
    } else {
      document.getElementById('hb-last').textContent = 'No heartbeat found';
      document.getElementById('hb-result').textContent = '—';
    }

    // Stats row
    const sess = data.sessions || {};
    document.getElementById('stat-subagents-today').textContent = data.subagentsToday ?? sess.subagents ?? '0';
    document.getElementById('stat-tokens-today').textContent = MC.formatTokens(data.tokensToday);
    document.getElementById('stat-sessions').textContent = sess.total ?? '0';
    document.getElementById('stat-cost-today').textContent = MC.formatCost(data.costToday);

    // Running tasks panel
    renderRunningTasks(data.runningAgents || []);

    // Last updated
    document.getElementById('last-updated').textContent = 'Updated ' + MC.timeAgo(data.timestamp);

  } catch (e) {
    console.error('Stats load failed:', e);
    document.getElementById('last-updated').textContent = 'Update failed — ' + e.message;
  }
}

function renderRunningTasks(agents) {
  const el = document.getElementById('running-tasks');
  if (!agents.length) {
    el.innerHTML = `<div style="color:var(--muted);font-size:0.875rem;padding:0.5rem 0;">No agents running right now</div>`;
    return;
  }

  el.innerHTML = agents.map(a => `
    <div style="display:flex;align-items:flex-start;gap:0.75rem;padding:0.625rem 0;border-bottom:1px solid var(--border);">
      <span style="width:8px;height:8px;border-radius:50%;background:#3b82f6;flex-shrink:0;margin-top:5px;" class="pulse-blue"></span>
      <div style="flex:1;min-width:0;">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:0.5rem;">
          <span style="font-size:0.875rem;font-weight:500;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${MC.escHtml(a.label || 'agent')}</span>
          <span style="font-size:0.75rem;color:var(--muted);white-space:nowrap;">⏱ ${a.runtime ? MC.formatRuntime(a.runtime) : '—'}</span>
        </div>
        ${a.task ? `<div style="font-size:0.75rem;color:var(--muted);margin-top:0.2rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${MC.escHtml(a.task)}</div>` : ''}
        <div style="font-size:0.7rem;color:var(--subtle);margin-top:0.2rem;">
          ${a.model ? MC.escHtml(a.model.split('/').pop()) : '—'}
          ${a.tokens ? ' · ' + MC.formatTokens(a.tokens) + ' tokens' : ''}
        </div>
      </div>
    </div>
  `).join('');
}

document.addEventListener('DOMContentLoaded', () => {
  MC.injectNav('/');
  MC.autoRefresh(loadStats, 15000);

  // SSE for real-time updates
  MC.connectSSE({
    'stats.update': (msg) => {
      // Update running count badge if it changes
      const subagentsEl = document.getElementById('stat-sessions');
      if (subagentsEl && msg.totalSessions !== undefined) {
        subagentsEl.textContent = msg.totalSessions;
      }
    },
    'agent.killed': () => loadStats(),
    'event.new': () => loadStats(),
  });
});
