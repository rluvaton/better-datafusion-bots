// ponytail: bot list + regexes are the only "config"; make a settings page when a second repo needs it
const BOTS = new Set(['adriangbot']);
const shown = new Set();
let items = []; // bot comments from the last scan
let view = 'comments'; // panel tab: 'comments' (one row per bot comment) or 'runs' (grouped by request)
let requests = []; // ids of the human "run benchmark …" comments the bot replied to
let enabled = null; // toolbar on/off switch (see background.js); null until read from storage
const ICON = {
  eye: '<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M8 2c1.981 0 3.671.992 4.933 2.078 1.27 1.091 2.187 2.345 2.637 3.023a1.62 1.62 0 0 1 0 1.798c-.45.678-1.367 1.932-2.637 3.023C11.67 13.008 9.981 14 8 14c-1.981 0-3.671-.992-4.933-2.078C1.797 10.83.88 9.576.43 8.898a1.62 1.62 0 0 1 0-1.798c.45-.677 1.367-1.931 2.637-3.022C4.33 2.992 6.019 2 8 2ZM1.679 7.932a.12.12 0 0 0 0 .136c.411.622 1.241 1.75 2.366 2.717C5.176 11.758 6.527 12.5 8 12.5c1.473 0 2.825-.742 3.955-1.715 1.124-.967 1.954-2.096 2.366-2.717a.12.12 0 0 0 0-.136c-.412-.621-1.242-1.75-2.366-2.717C10.824 4.242 9.473 3.5 8 3.5c-1.473 0-2.825.742-3.955 1.715-1.124.967-1.954 2.096-2.366 2.717ZM8 10a2 2 0 1 1-.001-3.999A2 2 0 0 1 8 10Z"/></svg>',
  eyeClosed: '<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M.143 2.31a.75.75 0 0 1 1.047-.167l14.5 10.5a.75.75 0 1 1-.88 1.214l-2.248-1.628C11.346 13.19 9.792 14 8 14c-1.981 0-3.67-.992-4.933-2.078C1.797 10.832.88 9.577.43 8.9a1.619 1.619 0 0 1 0-1.797c.353-.533.995-1.42 1.868-2.305L.31 3.357A.75.75 0 0 1 .143 2.31Zm1.536 5.622A.12.12 0 0 0 1.657 8c0 .021.006.045.022.068.412.621 1.242 1.75 2.366 2.717C5.175 11.758 6.527 12.5 8 12.5c1.195 0 2.31-.488 3.29-1.191L9.063 9.695A2 2 0 0 1 6.058 7.52L3.529 5.688a14.207 14.207 0 0 0-1.85 2.244ZM8 3.5c-.516 0-1.017.09-1.499.251a.75.75 0 1 1-.473-1.423A6.207 6.207 0 0 1 8 2c1.981 0 3.67.992 4.933 2.078 1.27 1.091 2.187 2.345 2.637 3.023a1.62 1.62 0 0 1 0 1.798c-.11.166-.248.365-.41.587a.75.75 0 1 1-1.21-.887c.148-.201.272-.382.371-.53a.119.119 0 0 0 0-.137c-.412-.621-1.242-1.75-2.366-2.717C10.825 4.242 9.473 3.5 8 3.5Z"/></svg>',
  zap: '<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M9.504.43a1.516 1.516 0 0 1 2.437 1.713L10.415 5.5h2.123c1.57 0 2.346 1.909 1.22 3.004l-7.34 7.142a1.249 1.249 0 0 1-.871.354h-.302a1.25 1.25 0 0 1-1.157-1.723L5.633 10.5H3.462c-1.57 0-2.346-1.909-1.22-3.004L9.503.429Zm1.047 1.074L3.286 8.571A.25.25 0 0 0 3.462 9H6.75a.75.75 0 0 1 .694 1.034l-1.713 4.188 6.982-6.793A.25.25 0 0 0 12.538 7H9.25a.75.75 0 0 1-.683-1.06l2.008-4.418.003-.006a.036.036 0 0 0-.004-.009l-.006-.006-.008-.001c-.003 0-.006.002-.009.004Z"/></svg>',
  chevron: '<svg class="bdb-caret" width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M12.78 5.22a.749.749 0 0 1 0 1.06l-4.25 4.25a.749.749 0 0 1-1.06 0L3.22 6.28a.749.749 0 1 1 1.06-1.06L8 8.939l3.72-3.719a.749.749 0 0 1 1.06 0Z"/></svg>',
}; // ids the user un-hid via the panel

function classify(text) {
  if (/Benchmark completed/i.test(text)) return 'completed';
  if (/Benchmark running/i.test(text)) return 'running';
  if (/failed before finishing|failed/i.test(text)) return 'failed';
  return 'other';
}

function scan() {
  if (enabled === null) return;
  // Turned off: leave the page exactly as GitHub renders it.
  if (!enabled) {
    for (const c of document.querySelectorAll('.bdb-hidden')) c.classList.remove('bdb-hidden');
    items = [];
    return render();
  }
  // GitHub paginates long timelines; bot spam is exactly what gets hidden behind "Load more".
  document.querySelector('.ajax-pagination-btn, button.ajax-pagination-btn')?.click();
  items = [];
  const seen = new Set();
  for (const c of document.querySelectorAll('.timeline-comment-group, .js-timeline-item')) {
    const author = c.querySelector('a.author')?.textContent?.trim();
    if (!BOTS.has(author)) continue;
    const id = c.id || c.querySelector('[id^="issuecomment-"]')?.id;
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const text = c.textContent;
    const status = classify(text);
    // Running/completed comments hide superseded ones for the same trigger; completed replaces running.
    // First link in the body is "[trigger](...#issuecomment-N)"; header permalinks are outside .comment-body.
    const trigger = c.querySelector('.comment-body a[href*="#issuecomment-"]')?.hash ?? '';
    const cmd = (text.match(/run benchmarks?[^\n`]*/i)          // new format: "Run configuration" yaml
      ?? text.match(/using:\s*([\w-]+)/)                        // old running format
      ?? text.match(/Benchmark\s+([\w-]+)\.json/))?.pop()?.trim() ?? '';
    // Hide all bot comments; the panel is the view, 👁 reveals one.
    c.classList.toggle('bdb-hidden', !shown.has(id));
    const time = (c.querySelector('relative-time')?.shadowRoot?.textContent ?? c.querySelector('relative-time')?.textContent ?? '').replace(/^on /, '');
    const at = c.querySelector('relative-time')?.getAttribute('datetime') ?? '';
    // Which benchmark this comment is about, from the bot's own text (never the human request, which may
    // just say "run benchmarks"). Resource-usage headings use the same name as the running comment.
    const name = (text.match(/Benchmarks requested:\s*([\w-]+)/)  // failed
      ?? text.match(/([\w-]+) — base/)                            // completed: resource usage
      ?? text.match(/run benchmark\s+([\w-]+)/)                    // run configuration (running, criterion)
      ?? text.match(/using:\s*([\w-]+)/))?.[1] ?? '';             // old running format
    const sha = text.match(/Comparing \S+ \(([0-9a-f]{7})[0-9a-f]*\)/)?.[1] ?? '';
    items.push({ id, status, trigger, cmd, time, at, name, sha, result: result(status, text) });
  }
  // The requests that triggered the bot are part of the same noise: hidden alongside it, ⚡ reveals one.
  requests = [...new Set(items.map(i => i.trigger.slice(1)).filter(Boolean))];
  for (const id of requests) {
    const el = document.getElementById(id);
    (el?.closest('.js-timeline-item') ?? el)?.classList.toggle('bdb-hidden', !shown.has(id));
  }
  render();
}

// One-line outcome of a bot comment: the speed comparison for results, the reason for failures.
function result(status, text) {
  if (status === 'failed') {
    return text.match(/reason:\s*`?([^`)]+)`?\)/)?.[1] ?? text.match(/failed[^.\n]*/)?.[0] ?? 'failed';
  }
  if (status !== 'completed') return '';
  // SQL suites print a summary table (the first one; a second one repeats it for the distribution).
  const count = label => text.match(new RegExp(`Queries ${label}\\s*│\\s*(\\d+)`))?.[1];
  if (count('Faster') !== undefined) {
    const parts = [`${count('Faster')} faster`, `${count('Slower')} slower`, `${count('with No Change')} same`];
    if (+count('with Failure')) parts.push(`${count('with Failure')} failed`);
    const totals = [...text.matchAll(/Total Time \([^)]*\)\s*│\s*([\d.]+)\s*(ms|s)\b/g)].slice(0, 2).map(m => m[1] * (m[2] === 's' ? 1000 : 1));
    if (totals.length === 2 && totals[0]) parts.push(`total ${pct(totals[1] / totals[0] - 1)}`);
    return parts.join(' · ');
  }
  // Criterion prints one row per bench with each side's time ratio to the faster one (1.00 = faster).
  let faster = 0, slower = 0, same = 0;
  for (const [, base, branch] of text.matchAll(/^.*?\s(\d+\.\d\d)\s+[\d.]+±[\d.]+\S+\s+\S+ \S+\s+(\d+\.\d\d)\s+[\d.]+±/gm)) {
    if (base >= 1.05) faster++; else if (branch >= 1.05) slower++; else same++;
  }
  return faster + slower + same ? `${faster} faster · ${slower} slower · ${same} same (±5%)` : '';
}

const pct = x => `${x > 0 ? '+' : x < 0 ? '−' : '±'}${Math.abs(x * 100).toFixed(1)}%`;
const clock = at => at ? new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
const duration = ms => ms < 60e3 ? '' : ms < 3600e3 ? `${Math.round(ms / 60e3)}m` : `${Math.floor(ms / 3600e3)}h ${Math.round(ms % 3600e3 / 60e3)}m`;

// Groups bot comments into requests (by the trigger link the bot puts in every comment), and each request
// into its benchmarks (by name), each benchmark carrying its updates in order: running → completed/failed.
function runs(items) {
  const groups = new Map();
  for (const i of [...items].sort((a, b) => a.at.localeCompare(b.at))) {
    const key = i.trigger.slice(1) || i.id;
    if (!groups.has(key)) groups.set(key, { trigger: key, time: `${i.time} ${clock(i.at)}`, sha: '', benchmarks: new Map() });
    const g = groups.get(key);
    g.sha ||= i.sha;
    const bench = i.name || i.id;
    if (!g.benchmarks.has(bench)) g.benchmarks.set(bench, { name: i.name, updates: [] });
    g.benchmarks.get(bench).updates.push(i);
  }
  return [...groups.values()].map(g => {
    const benchmarks = [...g.benchmarks.values()].map(b => {
      const last = b.updates.at(-1);
      return {
        name: b.name, status: last.status, result: last.result,
        duration: duration(new Date(last.at) - new Date(b.updates[0].at)),
        updates: b.updates.map(u => ({ id: u.id, status: u.status, clock: clock(u.at) })),
      };
    });
    const counts = benchmarks.reduce((a, b) => ((a[b.status] = (a[b.status] || 0) + 1), a), {});
    return { ...g, benchmarks, summary: Object.entries(counts).map(([k, v]) => `${v} ${k}`).join(' · ') };
  });
}

// Same as clicking a comment's timestamp: :target gives GitHub's highlight + scroll.
function goTo(id, tries = 10) {
  const el = document.getElementById(id);
  if (!el) { // not loaded yet: behind "Load more"
    document.querySelector('.ajax-pagination-btn')?.click();
    return tries && setTimeout(() => goTo(id, tries - 1), 500);
  }
  if (el.closest('.bdb-hidden')) { shown.add(id); scan(); }
  if (location.hash === '#' + id) history.replaceState(null, '', '#');
  location.hash = id;
  // Center instantly in the same task as the hash jump so the top-aligned position is never painted (visible as a jitter).
  el.scrollIntoView({ block: 'center', behavior: 'instant' });
  // GitHub's SPA swallows the hash scroll, and lazy-loaded fragments above shift layout afterwards: re-scroll.
  for (const ms of [0, 250, 800]) setTimeout(() => el.scrollIntoView({ block: 'center' }), ms);
}

// Renders the module-level items. (Not a parameter: the click handlers below are created once, on the first
// render, and must see the latest scan rather than whatever that first render had.)
function render() {
  let panel = document.getElementById('bdb-panel');
  if (!items.length) return panel?.remove();
  if (!panel) {
    panel = document.createElement('div');
    panel.id = 'bdb-panel';
    panel.className = 'Box';
    panel.innerHTML = `
      <div class="Box-header">
        <span class="Box-title"></span>
        ${ICON.chevron}
      </div>
      <div class="bdb-toolbar color-fg-muted">Show comments:
        <div class="BtnGroup">
          <button class="btn btn-sm BtnGroup-item" data-all="1" title="Every bot comment and the requests that triggered them">All</button>
          <button class="btn btn-sm BtnGroup-item" data-all="completed" title="Only completed benchmarks; requests and running/failed stay hidden">Results only</button>
          <button class="btn btn-sm BtnGroup-item" data-all="0" title="Hide bot comments and the requests that triggered them">None</button>
        </div>
      </div>
      <div class="bdb-tabs" role="tablist">
        <button role="tab" data-view="comments">Comments</button>
        <button role="tab" data-view="runs" title="Every benchmark run, grouped by the request that triggered it">Runs</button>
      </div>
      <ul class="bdb-comments"></ul><ul class="bdb-runs"></ul>`;
    panel.querySelector('.Box-header').onclick = () => panel.classList.toggle('bdb-collapsed');
    panel.querySelector('.bdb-tabs').onclick = e => {
      const tab = e.target.closest('[data-view]');
      if (!tab) return;
      view = tab.dataset.view;
      chrome.storage.local.set({ view });
      render();
    };
    panel.querySelector('.bdb-toolbar').onclick = e => {
      const b = e.target.closest('button');
      if (!b) return;
      shown.clear();
      for (const i of items) if (b.dataset.all === '1' || i.status === b.dataset.all) shown.add(i.id);
      if (b.dataset.all === '1') requests.forEach(id => shown.add(id));
      scan();
    };
    document.body.append(panel);
  }
  // Highlight the filter matching what's shown; none after 👁 picks a custom set.
  const isShown = i => shown.has(i.id);
  const anyRequest = requests.some(id => shown.has(id));
  const active = items.every(isShown) && requests.every(id => shown.has(id)) ? '1'
    : !anyRequest && items.every(i => isShown(i) === (i.status === 'completed')) ? 'completed'
    : !anyRequest && !items.some(isShown) ? '0' : null;
  for (const b of panel.querySelectorAll('.bdb-toolbar button')) {
    b.classList.toggle('selected', b.dataset.all === active);
    b.setAttribute('aria-pressed', b.dataset.all === active);
  }
  const counts = items.reduce((a, i) => ((a[i.status] = (a[i.status] || 0) + 1), a), {});
  panel.querySelector('.Box-title').innerHTML =
    `<strong>${items.length} bot comments</strong><br><span class="color-fg-muted">${Object.entries(counts).map(([k, v]) => `${v} ${k}`).join(' · ')}</span>`;
  panel.dataset.view = view;
  for (const tab of panel.querySelectorAll('[data-view]')) tab.setAttribute('aria-selected', tab.dataset.view === view);
  const groups = runs(items);
  panel.querySelector('[data-view="comments"]').textContent = `Comments (${items.length})`;
  panel.querySelector('[data-view="runs"]').textContent = `Runs (${groups.reduce((n, g) => n + g.benchmarks.length, 0)})`;
  panel.querySelector('.bdb-runs').innerHTML = groups.map(g => `
    <li class="bdb-request">
      <a href="#${g.trigger}" data-goto title="Go to the request">${ICON.zap}</a>
      <span>Request · ${g.time}${g.sha ? ` · <code>${g.sha}</code>` : ''}</span>
      <span class="bdb-time">${g.summary}</span>
    </li>
    ${g.benchmarks.map(b => `
    <li class="bdb-run bdb-${b.status}" data-status="${b.status}">
      <div class="bdb-run-head">
        <span class="bdb-dot" title="${b.status}"></span>
        <span class="bdb-cmd">${b.name || 'unknown benchmark'}</span>
        <span class="bdb-updates">${b.updates.map(u => `<a href="#${u.id}" data-goto title="Go to the ${u.status} update">${u.clock}</a>`).join(' → ')}</span>
        ${b.duration ? `<span class="bdb-time" title="From the first update to the last">(${b.duration})</span>` : ''}
      </div>
      <div class="bdb-result" title="${b.result}">${b.result || b.status}</div>
    </li>`).join('')}`).join('');
  panel.querySelector('.bdb-comments').innerHTML = items.map(i => `
    <li class="bdb-${i.status}" data-status="${i.status}">
      <span class="bdb-dot" title="${i.status}"></span>
      <span class="bdb-cmd" title="${i.cmd}">${i.cmd || i.status}</span>
      <span class="bdb-time">${i.time}</span>
      <span class="bdb-actions">
        ${i.trigger ? `<a href="${i.trigger}" data-goto title="Go to trigger comment">${ICON.zap}</a>` : ''}
        <a href="#${i.id}" data-id="${i.id}" class="${shown.has(i.id) ? 'bdb-on' : ''}" title="${shown.has(i.id) ? 'Hide' : 'Show'} comment">${shown.has(i.id) ? ICON.eye : ICON.eyeClosed}</a>
      </span>
    </li>`).join('');
  panel.querySelectorAll('a[data-goto]').forEach(a => a.onclick = e => {
    e.preventDefault();
    goTo(a.hash.slice(1));
  });
  panel.querySelectorAll('a[data-id]').forEach(a => a.onclick = e => {
    e.preventDefault();
    const id = a.dataset.id;
    const el = document.getElementById(id)?.closest('.timeline-comment-group, .js-timeline-item') || document.getElementById(id);
    if (!el) return;
    shown.has(id) ? shown.delete(id) : shown.add(id);
    scan();
    if (shown.has(id)) goTo(id);
  });
}

// GitHub is a turbo SPA and lazy-loads timeline chunks; rescan on DOM changes. Changes inside the panel
// are our own re-renders: rescanning on them would re-render forever (and swap rows out mid-click).
let t;
const inPanel = m => (m.target.nodeType === 1 ? m.target : m.target.parentElement)?.closest('#bdb-panel');
new MutationObserver(ms => {
  if (ms.every(inPanel)) return;
  clearTimeout(t);
  t = setTimeout(scan, 300);
}).observe(document.body, { childList: true, subtree: true });
chrome.storage.local.get({ enabled: true, view }).then(s => { view = s.view; enabled = s.enabled; scan(); });
chrome.storage.onChanged.addListener(changes => {
  if (!('enabled' in changes)) return;
  enabled = changes.enabled.newValue !== false;
  scan();
});
