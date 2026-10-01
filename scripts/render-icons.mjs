// Rasterizes icons/icon.svg into the PNG sizes the manifest needs.
// Usage: node scripts/render-icons.mjs
import { chromium } from '@playwright/test';
import fs from 'node:fs';
const svg = fs.readFileSync('icons/icon.svg', 'utf8');
const browser = await chromium.launch({ channel: 'chromium' });
for (const size of [16, 32, 48, 128]) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  await page.setContent(`<style>*{margin:0}</style>${svg.replace('<svg ', `<svg width="${size}" height="${size}" `)}`);
  await page.screenshot({ path: `icons/icon-${size}.png`, omitBackground: true });
  await page.close();
}
await browser.close();
