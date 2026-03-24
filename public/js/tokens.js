// tokens.js — Token charts + breakdowns

async function loadTokens() {
  try {
    const data = await MC.apiFetch('/api/tokens');

    // Summary cards
    document.getElementById('tokens-today').textContent = MC.formatTokens(data.tokensToday);
    document.getElementById('tokens-week').textContent = MC.formatTokens(data.tokensWeek);
    document.getElementById('tokens-month').textContent = MC.formatTokens(data.tokensMonth);

    // By model
    renderModelBreakdown(data.byModel || {});

    // By scope
    renderScopeBreakdown(data.byScope || {});

    // Daily chart
    renderDailyChart(data.dailyChart || []);

    document.getElementById('last-updated').textContent = 'Updated ' + MC.timeAgo(new Date().toISOString());
  } catch (e) {
    console.error('Tokens load failed:', e);
  }
}

function renderModelBreakdown(byModel) {
  const total = Object.values(byModel).reduce((a, b) => a + b, 0);
  const sorted = Object.entries(byModel).sort((a, b) => b[1] - a[1]);

  const colors = ['var(--cyan)', 'var(--purple)', 'var(--amber)', 'var(--green)', 'var(--red)'];

  if (!sorted.length) {
    document.getElementById('model-breakdown').innerHTML = `<div style="color:var(--muted);padding:1rem;">No data</div>`;
    return;
  }

  document.getElementById('model-breakdown').innerHTML = sorted.map(([model, tokens], i) => {
    const pct = total ? Math.round((tokens / total) * 100) : 0;
    const color = colors[i % colors.length];
    return `
      <div style="margin-bottom:0.875rem;">
        <div style="display:flex;justify-content:space-between;margin-bottom:0.25rem;">
          <span style="font-size:0.875rem;font-weight:500;">${MC.escHtml(model)}</span>
          <span style="font-family:monospace;font-size:0.875rem;">${MC.formatTokens(tokens)} <span style="color:var(--muted);">(${pct}%)</span></span>
        </div>
        <div class="progress-bar">
          <div style="height:100%;border-radius:999px;background:${color};width:${pct}%;transition:width 0.3s;"></div>
        </div>
      </div>
    `;
  }).join('');
}

function renderScopeBreakdown(byScope) {
  const total = Object.values(byScope).reduce((a, b) => a + b, 0);
  const sorted = Object.entries(byScope).sort((a, b) => b[1] - a[1]).slice(0, 10);

  if (!sorted.length) {
    document.getElementById('scope-breakdown').innerHTML = `<div style="color:var(--muted);padding:1rem;">No data</div>`;
    return;
  }

  document.getElementById('scope-breakdown').innerHTML = sorted.map(([scope, tokens]) => {
    const pct = total ? Math.round((tokens / total) * 100) : 0;
    return `
      <div style="display:flex;align-items:center;gap:0.75rem;padding:0.5rem 0;border-bottom:1px solid var(--border);">
        <span class="badge badge-purple" style="font-size:0.65rem;min-width:80px;text-align:center;">${MC.escHtml(scope)}</span>
        <div style="flex:1;">
          <div class="progress-bar">
            <div style="height:100%;border-radius:999px;background:rgba(167,139,250,0.5);width:${pct}%;transition:width 0.3s;"></div>
          </div>
        </div>
        <span style="font-family:monospace;font-size:0.8125rem;min-width:60px;text-align:right;">${MC.formatTokens(tokens)}</span>
        <span style="font-size:0.75rem;color:var(--muted);min-width:35px;text-align:right;">${pct}%</span>
      </div>
    `;
  }).join('');
}

function renderDailyChart(dailyChart) {
  if (!dailyChart.length) {
    document.getElementById('daily-chart').innerHTML = `<div style="color:var(--muted);">No data</div>`;
    return;
  }

  const max = Math.max(...dailyChart.map(d => d.tokens), 1);

  const bars = dailyChart.map(d => {
    const h = Math.max(2, Math.round((d.tokens / max) * 80));
    const label = d.date.slice(5); // MM-DD
    const isToday = d.date === new Date().toISOString().slice(0, 10);
    return `
      <div style="display:flex;flex-direction:column;align-items:center;flex:1;">
        <div style="font-size:0.65rem;color:var(--muted);margin-bottom:2px;">${d.tokens ? MC.formatTokens(d.tokens) : ''}</div>
        <div style="width:100%;background:${isToday ? 'var(--cyan)' : 'rgba(0,210,255,0.3)'};border-radius:3px 3px 0 0;height:${h}px;min-height:2px;transition:height 0.3s;" title="${d.date}: ${MC.formatNumber(d.tokens)} tokens"></div>
        <div style="font-size:0.6rem;color:var(--muted);margin-top:3px;transform:rotate(-45deg);transform-origin:top center;white-space:nowrap;">${label}</div>
      </div>
    `;
  }).join('');

  document.getElementById('daily-chart').innerHTML = `
    <div style="display:flex;align-items:flex-end;gap:3px;height:100px;padding-top:20px;">
      ${bars}
    </div>
  `;
}

document.addEventListener('DOMContentLoaded', () => {
  MC.injectNav('/tokens.html');
  MC.autoRefresh(loadTokens, 60000);
});
