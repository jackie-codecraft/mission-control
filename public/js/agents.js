// agents.js — Live agent cards + modal

let selectedAgent = null;

function renderAgentCard(agent, statusClass) {
  const runtime = agent.runtime ? MC.formatRuntime(agent.runtime) : '—';
  const tokens = MC.formatTokens(agent.tokens);
  const task = agent.task ? agent.task.slice(0, 80) + (agent.task.length > 80 ? '…' : '') : '—';

  return `
    <div class="agent-card ${statusClass}" onclick="showModal('${escId(agent.id)}')">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:0.5rem;">
        <span style="font-size:0.875rem;font-weight:600;color:var(--text);">${MC.escHtml(agent.label || 'agent')}</span>
        ${statusClass === 'running'
          ? '<span style="width:8px;height:8px;border-radius:50%;background:#3b82f6;flex-shrink:0;margin-top:4px;" class="pulse-blue"></span>'
          : statusClass === 'completed'
          ? '<span class="dot dot-green"></span>'
          : statusClass === 'killed'
          ? '<span class="dot dot-red"></span>'
          : '<span class="dot dot-gray"></span>'}
      </div>
      <div style="font-size:0.75rem;color:var(--muted);margin-bottom:0.75rem;line-height:1.4;">${MC.escHtml(task)}</div>
      <div style="display:flex;gap:1rem;font-size:0.75rem;color:var(--muted);">
        <span>⏱ ${runtime}</span>
        <span>🔤 ${tokens}</span>
        <span style="color:var(--subtle);">${agent.model ? agent.model.split('/').pop() : '—'}</span>
      </div>
    </div>
  `;
}

function escId(id) {
  return String(id || '').replace(/[^a-zA-Z0-9_-]/g, '_');
}

let allAgents = {};

function showModal(agentId) {
  // Find agent across all groups
  const all = [
    ...(allAgents.running || []),
    ...(allAgents.completed || []),
    ...(allAgents.killed || []),
    ...(allAgents.other || []),
  ];
  const agent = all.find(a => escId(a.id) === agentId);
  if (!agent) return;

  selectedAgent = agent;
  const runtime = agent.runtime ? MC.formatRuntime(agent.runtime) : '—';

  document.getElementById('modal').style.display = 'flex';
  document.getElementById('modal-content').innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:1.25rem;">
      <div>
        <h3 style="font-size:1.125rem;font-weight:700;margin:0 0 0.25rem;">${MC.escHtml(agent.label || 'Agent')}</h3>
        <div style="color:var(--muted);font-size:0.875rem;">${agent.channel || 'No channel'}</div>
      </div>
      <button onclick="closeModal()" style="background:none;border:none;cursor:pointer;color:var(--muted);font-size:1.25rem;line-height:1;">&times;</button>
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;margin-bottom:1rem;">
      <div class="card-sm">
        <div class="stat-label">Status</div>
        <div style="margin-top:0.25rem;">${MC.statusBadge(agent.status)}</div>
      </div>
      <div class="card-sm">
        <div class="stat-label">Runtime</div>
        <div style="font-family:monospace;margin-top:0.25rem;">${runtime}</div>
      </div>
      <div class="card-sm">
        <div class="stat-label">Model</div>
        <div style="font-size:0.875rem;margin-top:0.25rem;">${MC.escHtml(agent.model || '—')}</div>
      </div>
      <div class="card-sm">
        <div class="stat-label">Tokens</div>
        <div style="font-family:monospace;margin-top:0.25rem;">${MC.formatNumber(agent.tokens)}</div>
      </div>
    </div>

    ${agent.task ? `
      <div style="margin-bottom:1rem;">
        <div class="stat-label" style="margin-bottom:0.5rem;">Task</div>
        <div style="background:var(--bg);border-radius:8px;padding:0.75rem;font-size:0.8125rem;line-height:1.6;color:var(--subtle);">${MC.escHtml(agent.task)}</div>
      </div>
    ` : ''}

    <div style="font-size:0.75rem;color:var(--muted);display:flex;flex-direction:column;gap:0.25rem;">
      ${agent.id ? `<div>Session: <span style="font-family:monospace;">${MC.escHtml(agent.id)}</span></div>` : ''}
      ${agent.spawnTime ? `<div>Spawned: ${MC.timeAgo(agent.spawnTime)} (${new Date(agent.spawnTime).toLocaleString()})</div>` : ''}
      ${agent.parentId ? `<div>Parent: <span style="font-family:monospace;">${MC.escHtml(agent.parentId)}</span></div>` : ''}
    </div>
  `;
}

function closeModal() {
  document.getElementById('modal').style.display = 'none';
}

async function loadAgents() {
  try {
    const data = await MC.apiFetch('/api/agents');
    allAgents = data.subagents || {};

    // Main agent card
    const main = data.main;
    if (main) {
      document.getElementById('main-agent').innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:1rem;">
          <div>
            <div style="font-size:1rem;font-weight:700;">${MC.escHtml(main.label || 'Main Agent')}</div>
            <div style="font-size:0.875rem;color:var(--muted);margin-top:0.25rem;">${MC.escHtml(main.model || '')}</div>
          </div>
          <div style="display:flex;gap:2rem;text-align:center;">
            <div><div style="font-size:1.5rem;font-weight:700;color:#3b82f6;">${data.counts?.running || 0}</div><div style="font-size:0.75rem;color:var(--muted);">Running</div></div>
            <div><div style="font-size:1.5rem;font-weight:700;color:var(--green);">${data.counts?.completed || 0}</div><div style="font-size:0.75rem;color:var(--muted);">Done</div></div>
            <div><div style="font-size:1.5rem;font-weight:700;color:var(--red);">${data.counts?.killed || 0}</div><div style="font-size:0.75rem;color:var(--muted);">Killed</div></div>
            <div><div style="font-size:1.5rem;font-weight:700;">${MC.formatTokens(main.tokens)}</div><div style="font-size:0.75rem;color:var(--muted);">Tokens</div></div>
          </div>
        </div>
      `;
    } else {
      document.getElementById('main-agent').innerHTML = `<div style="color:var(--muted);">No active main session found</div>`;
    }

    // Subagent sections
    const sections = [
      { key: 'running', label: 'Running', statusClass: 'running', color: '#3b82f6' },
      { key: 'completed', label: 'Completed', statusClass: 'completed', color: 'var(--green)' },
      { key: 'killed', label: 'Killed', statusClass: 'killed', color: 'var(--red)' },
      { key: 'other', label: 'Other', statusClass: '', color: 'var(--muted)' },
    ];

    let html = '';
    for (const sec of sections) {
      const agents = allAgents[sec.key] || [];
      if (!agents.length) continue;
      html += `
        <div style="margin-bottom:1.5rem;">
          <h3 style="font-size:0.875rem;font-weight:600;color:${sec.color};text-transform:uppercase;letter-spacing:0.05em;margin-bottom:0.75rem;">
            ${sec.label} (${agents.length})
          </h3>
          <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:0.75rem;">
            ${agents.map(a => renderAgentCard(a, sec.statusClass)).join('')}
          </div>
        </div>
      `;
    }

    if (!html) {
      html = `<div style="color:var(--muted);text-align:center;padding:3rem;">No subagents found</div>`;
    }

    document.getElementById('subagents').innerHTML = html;

    // Recent activity
    const activity = data.recentActivity || [];
    if (activity.length) {
      document.getElementById('recent-activity').innerHTML = activity.map(e => `
        <div style="display:flex;align-items:center;gap:0.75rem;padding:0.5rem 0;border-bottom:1px solid var(--border);font-size:0.8125rem;">
          ${MC.typeBadge(e.type)}
          <span style="flex:1;color:var(--text);">${MC.escHtml(e.label || e.summary || e.type)}</span>
          <span style="color:var(--muted);">${MC.timeAgo(e.timestamp)}</span>
        </div>
      `).join('');
    } else {
      document.getElementById('recent-activity').innerHTML = `<div style="color:var(--muted);padding:1rem 0;">No recent activity</div>`;
    }

    document.getElementById('last-updated').textContent = 'Updated ' + MC.timeAgo(data.timestamp);
  } catch (e) {
    console.error('Agents load failed:', e);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  MC.injectNav('/agents.html');
  MC.autoRefresh(loadAgents, 15000);

  // Close modal on overlay click
  document.getElementById('modal').addEventListener('click', (e) => {
    if (e.target === document.getElementById('modal')) closeModal();
  });
});
