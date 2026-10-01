// Rasterizes icons/icon.svg (on) and icons/icon-off.svg (off) into the PNG sizes the manifest and toolbar need.
// Usage: node scripts/render-icons.mjs
import { chromium } from '@playwright/test';
import fs from 'node:fs';
const browser = await chromium.launch({ channel: 'chromium' });
for (const name of ['icon', 'icon-off']) {
  const svg = fs.readFileSync(`icons/${name}.svg`, 'utf8');
  for (const size of [16, 32, 48, 128]) {
    const page = await browser.newPage({ viewport: { width: size, height: size } });
    await page.setContent(`<style>*{margin:0}</style>${svg.replace('<svg ', `<svg width="${size}" height="${size}" `)}`);
    await page.screenshot({ path: `icons/${name}-${size}.png`, omitBackground: true });
    await page.close();
  }
}
await browser.close();
