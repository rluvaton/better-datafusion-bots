// Opens a headed Chromium (Playwright's, since branded Chrome ignores --load-extension) with the extension on the PR.
import { chromium } from '@playwright/test';
const EXT = import.meta.dirname;
const ctx = await chromium.launchPersistentContext('/private/tmp/claude-501/-Users-rluvaton-dev-personal-browser-extenstion-better-datafusion-bots/11f65eff-e297-4923-96f8-941b111873bc/scratchpad/chromium-profile', {
  channel: 'chromium', headless: false, viewport: null,
  args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
});
const page = ctx.pages()[0] ?? await ctx.newPage();
await page.goto(process.argv[2] ?? 'https://github.com/apache/datafusion/pull/24672');
console.log('panel rows:', await page.locator('#bdb-panel li').count());
