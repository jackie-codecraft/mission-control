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
    document.getElementById('stat-memory-sub').textContent = `${mem.usedFmt || '?'} / ${mem.totalFmt || '?'}`;
    document.getElementById('memory-bar').style.width = (mem.percent || 0) + '%';
    document.getElementById('memory-bar').className = 'progress-fill' +
      (mem.percent > 80 ? ' danger' : mem.percent > 60 ? ' warning' : '');

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
    if (hb) {
      document.getElementById('hb-last').textContent = MC.timeAgo(hb.last);
      document.getElementById('hb-result').textContent = hb.result || '—';
    } else {
      document.getElementById('hb-last').textContent = 'No heartbeat found';
      document.getElementById('hb-result').textContent = '—';
    }

    // Stats row
    const sess = data.sessions || {};
    document.getElementById('stat-subagents-today').textContent = data.subagentsToday ?? sess.subagents ?? '0';
    document.getElementById('stat-tokens-today').textContent = MC.formatTokens(data.tokensToday);
    document.getElementById('stat-sessions').textContent = sess.total ?? '0';

    // Last updated
    document.getElementById('last-updated').textContent = 'Updated ' + MC.timeAgo(data.timestamp);

  } catch (e) {
    console.error('Stats load failed:', e);
    document.getElementById('last-updated').textContent = 'Update failed';
  }
}

document.addEventListener('DOMContentLoaded', () => {
  MC.injectNav('/');
  MC.autoRefresh(loadStats, 30000);
});
