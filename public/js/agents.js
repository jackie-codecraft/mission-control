// agents.js — Live agent cards + modal + kill action

let selectedAgent = null;
let allAgents = {};
let killInProgress = false;

function renderAgentCard(agent, statusClass) {
  const runtime = agent.runtime ? MC.formatRuntime(agent.runtime) : '—';
  const tokens = MC.formatTokens(agent.tokens);
  const task = agent.task ? agent.task.slice(0, 120) + (agent.task.length > 120 ? '…' : '') : null;
  const sessionHref = agent.key ? `/session.html?key=${encodeURIComponent(agent.key)}` : null;

  return `
    <div class="agent-card ${statusClass}" onclick="showModal('${escId(agent.id)}')">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:0.5rem;">
        <span style="font-size:0.875rem;font-weight:600;color:var(--text);flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${MC.escHtml(agent.label || 'agent')}</span>
        <div style="display:flex;align-items:center;gap:0.25rem;margin-left:0.5rem;flex-shrink:0;">
          ${sessionHref ? `<a href="${sessionHref}" onclick="event.stopPropagation()" title="View detail" style="color:var(--muted);font-size:0.7rem;text-decoration:none;padding:0.1rem 0.25rem;border-radius:4px;line-height:1;" onmouseover="this.style.color='var(--cyan)'" onmouseout="this.style.color='var(--muted)'">↗</a>` : ''}
          ${statusClass === 'running'
            ? '<span style="width:8px;height:8px;border-radius:50%;background:#3b82f6;flex-shrink:0;margin-top:1px;" class="pulse-blue"></span>'
            : statusClass === 'completed'
            ? '<span class="dot dot-green"></span>'
            : statusClass === 'killed'
            ? '<span class="dot dot-red"></span>'
            : '<span class="dot dot-gray"></span>'}
        </div>
      </div>
      <div style="font-size:0.75rem;color:var(--muted);margin-bottom:0.75rem;line-height:1.4;min-height:2.4em;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;">${MC.escHtml(task || '—')}</div>
      <div style="display:flex;gap:1rem;font-size:0.75rem;color:var(--muted);justify-content:space-between;">
        <span>⏱ ${runtime}</span>
        <span title="${MC.escHtml(String(agent.tokens || 0))} tokens">🔤 ${tokens}</span>
        <span style="color:var(--subtle);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${MC.escHtml(agent.model || '')}">${agent.model ? agent.model.split('/').pop() : '—'}</span>
      </div>
    </div>
  `;
}

function escId(id) {
  return String(id || '').replace(/[^a-zA-Z0-9_-]/g, '_');
}

function showModal(agentId) {
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
  const isRunning = agent.status === 'running' || agent.status === 'active';
  const sessionLink = agent.key ? `/session.html?key=${encodeURIComponent(agent.key)}` : null;

  document.getElementById('modal').style.display = 'flex';
  document.getElementById('modal-content').innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:1.25rem;">
      <div style="flex:1;min-width:0;">
        <h3 style="font-size:1.125rem;font-weight:700;margin:0 0 0.25rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${MC.escHtml(agent.label || 'Agent')}</h3>
        <div style="color:var(--muted);font-size:0.8rem;">${MC.escHtml(agent.channel || '')}</div>
      </div>
      <div style="display:flex;gap:0.5rem;align-items:center;flex-shrink:0;margin-left:0.75rem;">
        ${isRunning ? `
          <button id="kill-btn" onclick="killAgent(event, '${MC.escHtml(agent.key || agent.id)}')"
            style="background:rgba(239,68,68,0.15);color:var(--red);border:1px solid rgba(239,68,68,0.3);border-radius:8px;padding:0.375rem 0.75rem;font-size:0.8125rem;cursor:pointer;font-weight:500;">
            Kill
          </button>
        ` : ''}
        ${sessionLink ? `<a href="${sessionLink}" style="background:rgba(0,210,255,0.1);color:var(--cyan);border:1px solid rgba(0,210,255,0.3);border-radius:8px;padding:0.375rem 0.75rem;font-size:0.8125rem;text-decoration:none;white-space:nowrap;">Detail →</a>` : ''}
        <button onclick="closeModal()" style="background:none;border:none;cursor:pointer;color:var(--muted);font-size:1.25rem;line-height:1;padding:0.25rem;">&times;</button>
      </div>
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:0.75rem;margin-bottom:1rem;">
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
        <div style="font-size:0.8125rem;margin-top:0.25rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${MC.escHtml(agent.model || '')}">${MC.escHtml((agent.model || '—').split('/').pop())}</div>
      </div>
      <div class="card-sm">
        <div class="stat-label">Tokens</div>
        <div style="font-family:monospace;margin-top:0.25rem;">${MC.formatNumber(agent.tokens)}</div>
      </div>
    </div>

    ${agent.task ? `
      <div style="margin-bottom:1rem;">
        <div class="stat-label" style="margin-bottom:0.5rem;">Task</div>
        <div style="background:var(--bg);border-radius:8px;padding:0.75rem;font-size:0.8125rem;line-height:1.6;color:var(--subtle);max-height:240px;overflow-y:auto;white-space:pre-wrap;word-break:break-word;">${MC.escHtml(agent.task)}</div>
      </div>
    ` : ''}

    <div id="kill-status" style="display:none;margin-bottom:0.75rem;padding:0.5rem 0.75rem;border-radius:8px;font-size:0.875rem;"></div>

    <div style="font-size:0.75rem;color:var(--muted);display:flex;flex-direction:column;gap:0.25rem;border-top:1px solid var(--border);padding-top:0.75rem;">
      ${agent.key ? `<div style="display:flex;gap:0.5rem;"><span style="width:70px;flex-shrink:0;">Key:</span><span style="font-family:monospace;font-size:0.7rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${MC.escHtml(agent.key)}">${MC.escHtml(agent.key)}</span></div>` : ''}
      ${agent.spawnTime ? `<div style="display:flex;gap:0.5rem;"><span style="width:70px;flex-shrink:0;">Spawned:</span><span>${MC.timeAgo(agent.spawnTime)}</span></div>` : ''}
      ${agent.parentId ? `<div style="display:flex;gap:0.5rem;"><span style="width:70px;flex-shrink:0;">Parent:</span><span style="font-family:monospace;font-size:0.7rem;">${MC.escHtml(agent.parentId)}</span></div>` : ''}
    </div>
  `;
}

async function killAgent(event, key) {
  event.stopPropagation();
  if (killInProgress) return;

  const btn = document.getElementById('kill-btn');
  const statusEl = document.getElementById('kill-status');
  if (btn) { btn.disabled = true; btn.textContent = 'Killing…'; }

  killInProgress = true;
  try {
    const result = await MC.apiPost('/api/agents/kill', { key });
    if (result.ok) {
      if (statusEl) {
        statusEl.style.display = 'block';
        statusEl.style.background = 'rgba(34,197,94,0.1)';
        statusEl.style.color = 'var(--green)';
        statusEl.textContent = 'Agent killed successfully';
      }
      if (btn) btn.style.display = 'none';
      setTimeout(() => { closeModal(); loadAgents(); }, 1500);
    } else {
      const msg = result.data?.error || 'Kill failed';
      if (statusEl) {
        statusEl.style.display = 'block';
        statusEl.style.background = 'rgba(239,68,68,0.1)';
        statusEl.style.color = 'var(--red)';
        statusEl.textContent = msg;
      }
      if (btn) { btn.disabled = false; btn.textContent = 'Kill'; }
    }
  } catch (e) {
    if (statusEl) {
      statusEl.style.display = 'block';
      statusEl.style.background = 'rgba(239,68,68,0.1)';
      statusEl.style.color = 'var(--red)';
      statusEl.textContent = e.message;
    }
    if (btn) { btn.disabled = false; btn.textContent = 'Kill'; }
  } finally {
    killInProgress = false;
  }
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
          <div style="display:flex;gap:1.5rem;text-align:center;flex-wrap:wrap;">
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
          <span style="flex:1;color:var(--text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${MC.escHtml(e.label || e.summary || e.type)}</span>
          <span style="color:var(--muted);white-space:nowrap;">${MC.timeAgo(e.timestamp)}</span>
        </div>
      `).join('');
    } else {
      document.getElementById('recent-activity').innerHTML = `<div style="color:var(--muted);padding:1rem 0;">No recent activity</div>`;
    }

    document.getElementById('last-updated').textContent = 'Updated ' + MC.timeAgo(data.timestamp);
  } catch (e) {
    console.error('Agents load failed:', e);
    document.getElementById('subagents').innerHTML = `<div style="color:var(--red);padding:2rem;text-align:center;">Load failed: ${MC.escHtml(e.message)}</div>`;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  MC.injectNav('/agents.html');
  MC.autoRefresh(loadAgents, 15000);

  // Close modal on overlay click or Escape
  document.getElementById('modal').addEventListener('click', (e) => {
    if (e.target === document.getElementById('modal')) closeModal();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeModal();
  });

  // SSE: refresh on kill/new events
  MC.connectSSE({
    'agent.killed': () => { closeModal(); loadAgents(); },
    'event.new': () => loadAgents(),
    'stats.update': (msg) => {
      // Update running count in main header
    },
  });
});
