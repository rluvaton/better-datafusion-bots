// Snapshot PR pages (with "Load more" expanded) so tests run offline and don't hit GitHub rate limits.
// Usage: node tests/save-fixtures.mjs [repo/number ...]   (default: all of PRS)
import { chromium } from '@playwright/test';
import fs from 'node:fs';
const PRS = ['datafusion/24672', 'datafusion/22450', 'arrow-rs/11285'];
const browser = await chromium.launch({ channel: 'chromium' });
for (const pr of process.argv.slice(2).length ? process.argv.slice(2) : PRS) {
  const [repo, n] = pr.split('/');
  const page = await browser.newPage();
  await page.goto(`https://github.com/apache/${repo}/pull/${n}`);
  for (let more; (more = page.locator('.ajax-pagination-btn').first()) && await more.count(); ) {
    await more.click();
    await page.waitForTimeout(2000);
  }
  fs.writeFileSync(`tests/fixtures/${repo}-pr-${n}.html`, await page.content());
  console.log('saved', pr);
  await page.close();
}
await browser.close();
