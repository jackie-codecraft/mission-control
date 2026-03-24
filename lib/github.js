'use strict';

const https = require('https');

function ghFetch(path, token) {
  return new Promise((resolve, reject) => {
    if (!token) return reject(new Error('No GitHub token configured'));
    const options = {
      hostname: 'api.github.com',
      path,
      headers: {
        'Authorization': `token ${token}`,
        'User-Agent': 'mission-control/2.0',
        'Accept': 'application/vnd.github.v3+json',
      }
    };
    https.get(options, (res) => {
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(data) }); }
        catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
}

async function getPRs(token, org, repo) {
  const repoPath = repo ? `${org}/${repo}` : org;
  
  // If no specific repo, get repos for org first
  let repos = [];
  if (!repo) {
    try {
      const r = await ghFetch(`/orgs/${org}/repos?type=all&per_page=20&sort=updated`, token);
      repos = (r.data || []).map(r => r.full_name);
    } catch (_) {
      // Try as user
      try {
        const r = await ghFetch(`/users/${org}/repos?per_page=20&sort=updated`, token);
        repos = (r.data || []).map(r => r.full_name);
      } catch (_) {}
    }
  } else {
    repos = [`${org}/${repo}`];
  }

  const allPRs = [];
  for (const fullName of repos.slice(0, 5)) {
    try {
      const r = await ghFetch(`/repos/${fullName}/pulls?state=open&per_page=10`, token);
      const prs = (r.data || []).map(pr => ({
        id: pr.number,
        title: pr.title,
        repo: fullName,
        branch: pr.head?.ref,
        author: pr.user?.login,
        created: pr.created_at,
        updated: pr.updated_at,
        state: pr.state,
        draft: pr.draft,
        url: pr.html_url,
        checks: pr.head?.sha,
      }));
      allPRs.push(...prs);
    } catch (_) {}
  }

  // Also get recently merged
  const mergedPRs = [];
  for (const fullName of repos.slice(0, 3)) {
    try {
      const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const r = await ghFetch(`/repos/${fullName}/pulls?state=closed&per_page=10&sort=updated`, token);
      const prs = (r.data || [])
        .filter(pr => pr.merged_at && new Date(pr.merged_at) > new Date(cutoff))
        .map(pr => ({
          id: pr.number,
          title: pr.title,
          repo: fullName,
          branch: pr.head?.ref,
          author: pr.user?.login,
          merged: pr.merged_at,
          url: pr.html_url,
        }));
      mergedPRs.push(...prs);
    } catch (_) {}
  }

  return { open: allPRs, merged: mergedPRs, repos };
}

async function getCI(token, org, repo) {
  let repos = repo ? [`${org}/${repo}`] : [];
  if (!repos.length) {
    try {
      const r = await ghFetch(`/orgs/${org}/repos?per_page=10&sort=updated`, token);
      repos = (r.data || []).map(r => r.full_name).slice(0, 3);
    } catch (_) {}
  }

  const runs = [];
  for (const fullName of repos) {
    try {
      const r = await ghFetch(`/repos/${fullName}/actions/runs?per_page=10`, token);
      const repoRuns = (r.data?.workflow_runs || []).map(run => ({
        id: run.id,
        name: run.name,
        repo: fullName,
        workflow: run.workflow_id,
        status: run.status,
        conclusion: run.conclusion,
        branch: run.head_branch,
        event: run.event,
        started: run.run_started_at,
        updated: run.updated_at,
        url: run.html_url,
        duration: run.run_started_at && run.updated_at
          ? Math.round((new Date(run.updated_at) - new Date(run.run_started_at)) / 1000)
          : null,
      }));
      runs.push(...repoRuns);
    } catch (_) {}
  }

  runs.sort((a, b) => new Date(b.updated) - new Date(a.updated));
  return runs.slice(0, 30);
}

module.exports = { getPRs, getCI };
