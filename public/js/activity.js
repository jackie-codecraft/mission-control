// activity.js — Event feed with filters + search

let currentPage = 1;
let currentFilters = { scope: 'all', type: 'all', days: '30', search: '' };
let searchDebounce;

async function loadActivity(page = 1) {
  currentPage = page;
  try {
    const params = new URLSearchParams({
      ...currentFilters,
      page,
      limit: 50,
    });
    const data = await MC.apiFetch(`/api/activity?${params}`);

    // Populate filter dropdowns (first load or when empty)
    populateDropdowns(data.scopes || [], data.types || []);
    renderEvents(data);
    renderPagination(data);

    const searchTerm = currentFilters.search ? ` matching "${currentFilters.search}"` : '';
    document.getElementById('total-count').textContent = `${data.total} events${searchTerm}`;
  } catch (e) {
    console.error('Activity load failed:', e);
    document.getElementById('events-list').innerHTML = `<div style="color:var(--red);padding:2rem;text-align:center;">Failed to load events: ${MC.escHtml(e.message)}</div>`;
  }
}

function populateDropdowns(scopes, types) {
  const scopeEl = document.getElementById('filter-scope');
  const typeEl = document.getElementById('filter-type');

  if (scopeEl.options.length <= 1) {
    scopes.forEach(s => {
      const opt = document.createElement('option');
      opt.value = s;
      opt.textContent = s;
      scopeEl.appendChild(opt);
    });
  }

  if (typeEl.options.length <= 1) {
    types.forEach(t => {
      const opt = document.createElement('option');
      opt.value = t;
      opt.textContent = t;
      typeEl.appendChild(opt);
    });
  }
}

function renderEvents(data) {
  const list = document.getElementById('events-list');
  if (!data.items || !data.items.length) {
    const hasFilters = currentFilters.search || currentFilters.scope !== 'all' || currentFilters.type !== 'all';
    list.innerHTML = `<div style="color:var(--muted);text-align:center;padding:3rem;">${hasFilters ? 'No events match your filters' : 'No events found'}</div>`;
    return;
  }

  list.innerHTML = data.items.map((e, i) => `
    <div class="event-row" onclick="toggleDetail(${i})">
      <div style="display:flex;align-items:center;gap:0.75rem;flex-wrap:wrap;">
        ${MC.typeBadge(e.type)}
        <span style="font-weight:500;color:var(--text);flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${MC.escHtml(e.label || e.summary || e.type)}</span>
        ${e.scope ? `<span class="badge badge-purple" style="font-size:0.65rem;">${MC.escHtml(e.scope)}</span>` : ''}
        ${e.model ? `<span style="font-size:0.75rem;color:var(--muted);">${MC.escHtml(e.model.split('/').pop())}</span>` : ''}
        ${e.tokens ? `<span style="font-size:0.75rem;color:var(--muted);font-family:monospace;">${MC.formatTokens(e.tokens)}</span>` : ''}
        ${e.duration_ms ? `<span style="font-size:0.75rem;color:var(--muted);">${MC.formatRuntime(Math.round(e.duration_ms/1000))}</span>` : ''}
        <span style="font-size:0.75rem;color:var(--muted);white-space:nowrap;">${MC.timeAgo(e.timestamp)}</span>
      </div>
      ${e.summary && e.summary !== e.label ? `<div style="font-size:0.8125rem;color:var(--muted);margin-top:0.25rem;padding-left:0.25rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${MC.escHtml(e.summary)}</div>` : ''}
      <div id="detail-${i}" class="event-detail" style="display:none;">${MC.escHtml(JSON.stringify(e, null, 2))}</div>
    </div>
  `).join('');
}

function toggleDetail(i) {
  const el = document.getElementById(`detail-${i}`);
  if (el) {
    el.style.display = el.style.display === 'none' ? 'block' : 'none';
  }
}

function renderPagination(data) {
  const el = document.getElementById('pagination');
  if (data.pages <= 1) { el.innerHTML = ''; return; }

  const pages = [];
  const current = data.page;
  const total = data.pages;

  for (let p = Math.max(1, current - 2); p <= Math.min(total, current + 2); p++) {
    pages.push(p);
  }

  el.innerHTML = `
    <div style="display:flex;gap:0.5rem;justify-content:center;padding:1rem 0;flex-wrap:wrap;">
      ${current > 1 ? `<button class="btn btn-ghost" onclick="loadActivity(${current - 1})">← Prev</button>` : ''}
      ${pages.map(p => `
        <button class="btn ${p === current ? 'btn-cyan' : 'btn-ghost'}" onclick="loadActivity(${p})">${p}</button>
      `).join('')}
      ${current < total ? `<button class="btn btn-ghost" onclick="loadActivity(${current + 1})">Next →</button>` : ''}
      <span style="display:flex;align-items:center;padding:0 0.5rem;color:var(--muted);font-size:0.875rem;">
        Page ${current} of ${total}
      </span>
    </div>
  `;
}

document.addEventListener('DOMContentLoaded', () => {
  MC.injectNav('/activity.html');

  // Search input with debounce
  document.getElementById('filter-search').addEventListener('input', (e) => {
    clearTimeout(searchDebounce);
    searchDebounce = setTimeout(() => {
      currentFilters.search = e.target.value.trim();
      loadActivity(1);
    }, 300);
  });

  document.getElementById('filter-scope').addEventListener('change', (e) => {
    currentFilters.scope = e.target.value;
    loadActivity(1);
  });

  document.getElementById('filter-type').addEventListener('change', (e) => {
    currentFilters.type = e.target.value;
    loadActivity(1);
  });

  document.getElementById('filter-days').addEventListener('change', (e) => {
    currentFilters.days = e.target.value;
    loadActivity(1);
  });

  loadActivity(1);

  // SSE: refresh on new events
  MC.connectSSE({
    'event.new': () => {
      if (currentPage === 1) loadActivity(1);
    },
  });
});
