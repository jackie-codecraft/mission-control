// github.js — PR + CI display

async function loadGitHub() {
  try {
    const config = await MC.apiFetch('/api/config');

    if (!config.githubEnabled) {
      document.getElementById('github-content').innerHTML = `
        <div class="surface" style="text-align:center;padding:3rem;color:var(--muted);">
          <div style="font-size:2rem;margin-bottom:1rem;">⑂</div>
          <div style="font-size:1rem;font-weight:600;margin-bottom:0.5rem;">GitHub Not Configured</div>
          <div style="font-size:0.875rem;">Set <code style="background:var(--card);padding:0.2rem 0.4rem;border-radius:4px;">GITHUB_TOKEN</code> in your .env file to enable this tab.</div>
        </div>
      `;
      return;
    }

    const [prData, ciData] = await Promise.all([
      MC.apiFetch('/api/github/prs'),
      MC.apiFetch('/api/github/ci'),
    ]);

    renderPRs(prData);
    renderCI(ciData);

    document.getElementById('last-updated').textContent = 'Updated ' + MC.timeAgo(new Date().toISOString());
  } catch (e) {
    console.error('GitHub load failed:', e);
    document.getElementById('github-content').innerHTML = `
      <div style="color:var(--red);padding:2rem;text-align:center;">Failed to load GitHub data: ${MC.escHtml(e.message)}</div>
    `;
  }
}

function ciStatusBadge(status, conclusion) {
  if (status === 'completed') {
    if (conclusion === 'success') return '<span class="badge badge-green">✓ success</span>';
    if (conclusion === 'failure') return '<span class="badge badge-red">✗ failed</span>';
    if (conclusion === 'cancelled') return '<span class="badge badge-gray">cancelled</span>';
    return `<span class="badge badge-amber">${MC.escHtml(conclusion || status)}</span>`;
  }
  if (status === 'in_progress') return '<span class="badge badge-cyan">running</span>';
  if (status === 'queued') return '<span class="badge badge-amber">queued</span>';
  return `<span class="badge badge-gray">${MC.escHtml(status || '?')}</span>`;
}

function renderPRs(data) {
  const open = data.open || [];
  const merged = data.merged || [];

  let html = '';

  // Open PRs
  html += `
    <div class="surface" style="margin-bottom:1.5rem;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem;">
        <h2 style="font-size:1rem;font-weight:600;">Open Pull Requests</h2>
        <span style="font-size:0.875rem;color:var(--muted);">${open.length} open</span>
      </div>
  `;

  if (open.length) {
    html += `
      <div style="overflow-x:auto;">
        <table class="data-table">
          <thead>
            <tr>
              <th>Title</th>
              <th>Repo</th>
              <th>Branch</th>
              <th>Author</th>
              <th>Created</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            ${open.map(pr => `
              <tr>
                <td><a href="${MC.escHtml(pr.url)}" target="_blank" style="color:var(--cyan);text-decoration:none;">#${pr.id} ${MC.escHtml(pr.title)}</a></td>
                <td style="color:var(--muted);font-size:0.8rem;">${MC.escHtml(pr.repo?.split('/')[1] || pr.repo)}</td>
                <td><code style="font-size:0.75rem;background:var(--bg);padding:0.15rem 0.4rem;border-radius:4px;">${MC.escHtml(pr.branch || '—')}</code></td>
                <td style="color:var(--muted);">${MC.escHtml(pr.author || '—')}</td>
                <td style="color:var(--muted);">${MC.timeAgo(pr.created)}</td>
                <td>${pr.draft ? '<span class="badge badge-gray">draft</span>' : '<span class="badge badge-cyan">open</span>'}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  } else {
    html += `<div style="color:var(--muted);text-align:center;padding:2rem;">No open pull requests</div>`;
  }

  html += `</div>`;

  // Merged PRs
  html += `
    <div class="surface" style="margin-bottom:1.5rem;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem;">
        <h2 style="font-size:1rem;font-weight:600;">Recently Merged (30 days)</h2>
        <span style="font-size:0.875rem;color:var(--muted);">${merged.length} merged</span>
      </div>
  `;

  if (merged.length) {
    html += `
      <div style="overflow-x:auto;">
        <table class="data-table">
          <thead>
            <tr>
              <th>Title</th>
              <th>Repo</th>
              <th>Author</th>
              <th>Merged</th>
            </tr>
          </thead>
          <tbody>
            ${merged.map(pr => `
              <tr>
                <td><a href="${MC.escHtml(pr.url)}" target="_blank" style="color:var(--text);text-decoration:none;">#${pr.id} ${MC.escHtml(pr.title)}</a></td>
                <td style="color:var(--muted);font-size:0.8rem;">${MC.escHtml(pr.repo?.split('/')[1] || pr.repo)}</td>
                <td style="color:var(--muted);">${MC.escHtml(pr.author || '—')}</td>
                <td style="color:var(--muted);">${MC.timeAgo(pr.merged)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  } else {
    html += `<div style="color:var(--muted);text-align:center;padding:2rem;">No recently merged PRs</div>`;
  }

  html += `</div>`;

  document.getElementById('prs-section').innerHTML = html;
}

function renderCI(data) {
  const runs = data.runs || [];

  let html = `
    <div class="surface">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem;">
        <h2 style="font-size:1rem;font-weight:600;">CI / GitHub Actions</h2>
        <span style="font-size:0.875rem;color:var(--muted);">${runs.length} recent runs</span>
      </div>
  `;

  if (runs.length) {
    html += `
      <div style="overflow-x:auto;">
        <table class="data-table">
          <thead>
            <tr>
              <th>Workflow</th>
              <th>Repo</th>
              <th>Branch</th>
              <th>Status</th>
              <th>Duration</th>
              <th>Triggered</th>
            </tr>
          </thead>
          <tbody>
            ${runs.map(run => `
              <tr>
                <td><a href="${MC.escHtml(run.url)}" target="_blank" style="color:var(--text);text-decoration:none;">${MC.escHtml(run.name)}</a></td>
                <td style="color:var(--muted);font-size:0.8rem;">${MC.escHtml(run.repo?.split('/')[1] || run.repo)}</td>
                <td><code style="font-size:0.75rem;background:var(--bg);padding:0.15rem 0.4rem;border-radius:4px;">${MC.escHtml(run.branch || '—')}</code></td>
                <td>${ciStatusBadge(run.status, run.conclusion)}</td>
                <td style="color:var(--muted);">${run.duration ? MC.formatRuntime(run.duration) : '—'}</td>
                <td style="color:var(--muted);">${MC.timeAgo(run.updated)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  } else {
    html += `<div style="color:var(--muted);text-align:center;padding:2rem;">No CI runs found</div>`;
  }

  html += `</div>`;
  document.getElementById('ci-section').innerHTML = html;
}

document.addEventListener('DOMContentLoaded', () => {
  MC.injectNav('/github.html');
  loadGitHub();
  setInterval(loadGitHub, 60000);
});
