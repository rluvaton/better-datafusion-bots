// Snapshot PR pages (with "Load more" expanded) so tests run offline and don't hit GitHub rate limits.
// Usage: node tests/save-fixtures.mjs
import { chromium } from '@playwright/test';
import fs from 'node:fs';
const PRS = [24672, 22450];
const browser = await chromium.launch({ channel: 'chromium' });
for (const n of PRS) {
  const page = await browser.newPage();
  await page.goto(`https://github.com/apache/datafusion/pull/${n}`);
  for (let more; (more = page.locator('.ajax-pagination-btn').first()) && await more.count(); ) {
    await more.click();
    await page.waitForTimeout(2000);
  }
  fs.writeFileSync(`tests/fixtures/pr-${n}.html`, await page.content());
  console.log('saved', n);
  await page.close();
}
await browser.close();
