import { test as base, chromium, expect } from '@playwright/test';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';

const EXT = path.resolve(import.meta.dirname, '..');
const PR = 'https://github.com/apache/datafusion/pull/24672';
const fixture = n => fs.readFileSync(path.join(import.meta.dirname, 'fixtures', `pr-${n}.html`), 'utf8');

const test = base.extend({
  context: async ({}, use) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bdb-'));
    const context = await chromium.launchPersistentContext(dir, {
      channel: 'chromium',
      args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
    });
    // Serve snapshots offline (see save-fixtures.mjs); block everything else so GitHub is never hit.
    await context.route('**/*', route => {
      const m = route.request().url().match(/^https:\/\/github\.com\/apache\/datafusion\/pull\/(\d+)$/);
      m ? route.fulfill({ contentType: 'text/html', body: fixture(m[1]) }) : route.abort();
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
  // every hidden comment is by a bot
  for (const author of await page.locator('.bdb-hidden a.author').allTextContents()) {
    expect(author.trim()).toBe('adriangbot');
  }
});

test('eye toggles a hidden comment back', async ({ context }) => {
  const page = await context.newPage();
  await page.goto(PR);
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

  await page.getByRole('button', { name: 'All' }).click();
  await expect(page.locator('.bdb-hidden')).toHaveCount(0);
  await expect(page.locator('#bdb-panel a[data-id]').first()).toHaveClass(/bdb-on/);
  await page.getByRole('button', { name: 'Results only' }).click();
  const visibleBots = page.locator('.timeline-comment-group:not(.bdb-hidden .timeline-comment-group):has(a.author:text-is("adriangbot"))');
  await expect(visibleBots).toHaveCount(await page.locator('#bdb-panel li[data-status="completed"]').count());
  await page.getByRole('button', { name: 'None' }).click();
  expect(await page.locator('.bdb-hidden').count()).toBeGreaterThan(0);
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
