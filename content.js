// ponytail: bot list + regexes are the only "config"; make a settings page when a second repo needs it
const BOTS = new Set(['adriangbot']);
const shown = new Set();
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
  // GitHub paginates long timelines; bot spam is exactly what gets hidden behind "Load more".
  document.querySelector('.ajax-pagination-btn, button.ajax-pagination-btn')?.click();
  const items = [];
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
    items.push({ id, status, trigger, cmd, time });
  }
  render(items);
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

function render(items) {
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
          <button class="btn btn-sm BtnGroup-item" data-all="1">All</button>
          <button class="btn btn-sm BtnGroup-item" data-all="completed" title="Only completed benchmarks; running/failed stay hidden">Results only</button>
          <button class="btn btn-sm BtnGroup-item" data-all="0">None</button>
        </div>
      </div><ul></ul>`;
    panel.querySelector('.Box-header').onclick = () => panel.classList.toggle('bdb-collapsed');
    panel.querySelector('.bdb-toolbar').onclick = e => {
      const b = e.target.closest('button');
      if (!b) return;
      shown.clear();
      for (const li of panel.querySelectorAll('li')) {
        if (b.dataset.all === '1' || li.dataset.status === b.dataset.all) shown.add(li.querySelector('a[data-id]').dataset.id);
      }
      scan();
    };
    document.body.append(panel);
  }
  const counts = items.reduce((a, i) => ((a[i.status] = (a[i.status] || 0) + 1), a), {});
  panel.querySelector('.Box-title').innerHTML =
    `<strong>${items.length} bot comments</strong><br><span class="color-fg-muted">${Object.entries(counts).map(([k, v]) => `${v} ${k}`).join(' · ')}</span>`;
  panel.querySelector('ul').innerHTML = items.map(i => `
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

// GitHub is a turbo SPA and lazy-loads timeline chunks; rescan on DOM changes.
let t;
new MutationObserver(() => { clearTimeout(t); t = setTimeout(scan, 300); }).observe(document.body, { childList: true, subtree: true });
scan();
