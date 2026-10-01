import { test as base, chromium, expect } from '@playwright/test';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';

const EXT = path.resolve(import.meta.dirname, '..');
const PR = 'https://github.com/apache/datafusion/pull/24672';
const fixture = (repo, n) => fs.readFileSync(path.join(import.meta.dirname, 'fixtures', `${repo}-pr-${n}.html`), 'utf8');

const test = base.extend({
  context: async ({}, use) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bdb-'));
    const context = await chromium.launchPersistentContext(dir, {
      channel: 'chromium',
      args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
    });
    // Serve snapshots offline (see save-fixtures.mjs); block everything else so GitHub is never hit.
    await context.route('**/*', route => {
      const m = route.request().url().match(/^https:\/\/github\.com\/apache\/([\w-]+)\/pull\/(\d+)$/);
      m ? route.fulfill({ contentType: 'text/html', body: fixture(m[1], m[2]) }) : route.abort();
    });
    await use(context);
    await context.close();
  },
});

test('collapses bot comments into a panel', async ({ context }) => {
  const page = await context.newPage();
  await page.goto(PR);
  const panel = page.locator('#bdb-panel');
  await expect(panel).toBeVisible();
  await expect(panel.locator('.Box-header')).toContainText(/\d+ bot comments/);
  const rows = panel.locator('li');
  expect(await rows.count()).toBeGreaterThan(0);
  // non-completed bot comments are hidden from the timeline
  expect(await page.locator('.bdb-hidden').count()).toBeGreaterThan(0);
  // every hidden comment is by a bot, or is a request the bot replied to
  const triggers = await panel.locator('a[data-goto]').evaluateAll(as => as.map(a => a.hash.slice(1)));
  for (const item of await page.locator('.bdb-hidden').all()) {
    const author = (await item.locator('a.author').first().textContent()).trim();
    const id = await item.locator('[id^="issuecomment-"]').first().getAttribute('id').catch(() => null) ?? await item.getAttribute('id');
    expect(author === 'adriangbot' || triggers.includes(id), `${author} ${id}`).toBe(true);
  }
});

test('requests that triggered the bot are hidden too, and come back with All', async ({ context }) => {
  const page = await context.newPage();
  await page.goto(PR);
  const request = page.locator('.js-timeline-item', { has: page.locator('.comment-body', { hasText: /^\s*run benchmarks?\b/ }) });
  expect(await request.count()).toBeGreaterThan(0);
  for (const r of await request.all()) await expect(r).toBeHidden();
  await page.getByRole('button', { name: 'All' }).click();
  for (const r of await request.all()) await expect(r).toBeVisible();
  await page.getByRole('button', { name: 'Results only' }).click();
  for (const r of await request.all()) await expect(r).toBeHidden();
});

test('arrow-rs: Arrow criterion benchmark comments', async ({ context }) => {
  const page = await context.newPage();
  await page.goto('https://github.com/apache/arrow-rs/pull/11285');
  const panel = page.locator('#bdb-panel');
  await expect(panel).toBeVisible();
  await expect(panel.locator('li')).toHaveCount(4);
  await expect(panel.locator('li[data-status="completed"]')).toHaveCount(2);
  await expect(panel.locator('li[data-status="running"]')).toHaveCount(2);
  // the human conversation stays
  await expect(page.locator('.js-timeline-item', { hasText: 'Numbers look great' })).toBeVisible();
});

test('eye toggles a hidden comment back', async ({ context }) => {
  const page = await context.newPage();
  await page.goto(PR);
  // default: everything hidden, which is what None means
  await expect.poll(() => page.locator('#bdb-panel button[aria-pressed="true"]').allTextContents()).toEqual(['None']);
  const eye = page.locator('#bdb-panel a[data-id]').first();
  const id = await eye.getAttribute('data-id');
  const comment = page.locator(`#${id}`).locator('xpath=ancestor-or-self::*[contains(@class,"timeline-comment-group")][1]');
  await expect(comment).toBeHidden();
  await expect(eye).not.toHaveClass(/bdb-on/);
  await eye.click();
  await expect(comment).toBeVisible();
  await expect(page.locator(`#bdb-panel a[data-id="${id}"]`)).toHaveClass(/bdb-on/);
});

test('large PR: extracts old-format benchmark names', async ({ context }) => {
  const page = await context.newPage();
  await page.goto('https://github.com/apache/datafusion/pull/22450');
  const rows = page.locator('#bdb-panel li');
  await expect.poll(() => rows.count()).toBe(32);
  const cmds = await page.locator('#bdb-panel .bdb-cmd').allTextContents();
  expect(cmds.filter(c => c === '—')).toEqual([]);
  expect(cmds).toContain('tpch');
});

test('trigger link scrolls to the human comment; show/hide all', async ({ context }) => {
  const page = await context.newPage();
  await page.goto(PR);
  const bolt = page.locator('#bdb-panel a[data-goto]').first();
  const hash = (await bolt.getAttribute('href')).slice(1);
  await bolt.click();
  const target = page.locator(`#${hash}`);
  await expect(target).toBeInViewport();
  expect(page.url()).toContain('#' + hash);
  expect(await target.evaluate(el => el.matches(':target'))).toBe(true);
  await expect(target.locator('a.author')).toHaveText('rluvaton');

  const pressed = () => page.locator('#bdb-panel .bdb-toolbar button[aria-pressed="true"]').allTextContents();
  // ⚡ revealed the (normally hidden) request it jumped to: a custom set, so no filter is highlighted.
  await expect.poll(pressed).toEqual([]);
  await page.getByRole('button', { name: 'All' }).click();
  await expect.poll(pressed).toEqual(['All']);
  await expect(page.locator('.bdb-hidden')).toHaveCount(0);
  await expect(page.locator('#bdb-panel a[data-id]').first()).toHaveClass(/bdb-on/);
  await page.getByRole('button', { name: 'Results only' }).click();
  const visibleBots = page.locator('.timeline-comment-group:not(.bdb-hidden .timeline-comment-group):has(a.author:text-is("adriangbot"))');
  await expect(visibleBots).toHaveCount(await page.locator('#bdb-panel li[data-status="completed"]').count());
  await expect.poll(pressed).toEqual(['Results only']);
  // A custom set via 👁 matches no filter.
  await page.locator('#bdb-panel li[data-status="running"] a[data-id]').first().click();
  await expect.poll(pressed).toEqual([]);
  await page.getByRole('button', { name: 'None' }).click();
  await expect.poll(pressed).toEqual(['None']);
  expect(await page.locator('.bdb-hidden').count()).toBeGreaterThan(0);
});

test('toolbar button turns the extension off and on', async ({ context }) => {
  const page = await context.newPage();
  await page.goto(PR);
  const panel = page.locator('#bdb-panel');
  await expect(panel).toBeVisible();
  const worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker');
  // toggle() is what chrome.action.onClicked runs; Playwright can't click the browser toolbar itself.
  await worker.evaluate(() => toggle());
  await expect(panel).toHaveCount(0);
  await expect(page.locator('.bdb-hidden')).toHaveCount(0);
  await expect.poll(() => worker.evaluate(() => chrome.action.getTitle({}))).toContain(': off');
  // Stays off for pages opened later.
  const other = await context.newPage();
  await other.goto(PR);
  await other.waitForTimeout(1000);
  await expect(other.locator('#bdb-panel')).toHaveCount(0);

  await worker.evaluate(() => toggle());
  await expect(panel).toBeVisible();
  expect(await page.locator('.bdb-hidden').count()).toBeGreaterThan(0);
  await expect.poll(() => worker.evaluate(() => chrome.action.getTitle({}))).toContain(': on');
});

// Pagination can't be snapshotted; run against live GitHub only when asked: LIVE=1 npm test
test('live: auto-clicks "Load more"', async ({ context }) => {
  test.skip(!process.env.LIVE, 'set LIVE=1 to hit github.com');
  await context.unroute('**/*');
  const page = await context.newPage();
  await page.goto('https://github.com/apache/datafusion/pull/22450');
  await expect.poll(() => page.locator('#bdb-panel li').count(), { timeout: 30_000 }).toBe(32);
  await expect(page.locator('.ajax-pagination-btn')).toHaveCount(0);
});
