// Captures the README screenshots and per-feature GIFs from the live PR in a fresh, logged-out browser.
// Usage: node scripts/screenshots.mjs [gif...]   (needs ffmpeg; pass GIF names, e.g. before-after or a scene, to only redo those)
import { chromium } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const EXT = path.resolve(import.meta.dirname, '..');
const OUT = path.join(EXT, 'docs');
const PR = 'https://github.com/apache/datafusion/pull/24672';
const viewport = { width: 1280, height: 800 };
// No dithering: GitHub's UI is flat colours, and dither noise shimmers between frames (reads as flicker).
const PALETTE = 'split[a][b];[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=none';

// recording: 1x pixels (GIF-sized) and a drawn cursor, for pages that will be captured with capture().
async function open({ extension = true, colorScheme = 'light', recording, label, size = viewport } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bdb-shots-'));
  const context = await chromium.launchPersistentContext(dir, {
    channel: 'chromium', viewport: size, colorScheme, deviceScaleFactor: recording ? 1 : 2,
    args: extension ? [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`] : [],
  });
  if (label) await context.addInitScript(([text, color]) => addEventListener('DOMContentLoaded', () => {
    const l = document.createElement('div');
    l.textContent = text;
    l.style.cssText = `position:fixed;z-index:99999;top:12px;left:50%;transform:translateX(-50%);padding:6px 14px;border-radius:999px;font:600 18px -apple-system,system-ui,sans-serif;color:#fff;background:${color};box-shadow:0 2px 8px rgba(0,0,0,.25)`;
    document.body.append(l);
  }), label);
  // Captured frames have no cursor; draw one so viewers can follow the clicks.
  if (recording) await context.addInitScript(() => addEventListener('DOMContentLoaded', () => {
    const c = document.createElement('div');
    c.style.cssText = 'position:fixed;z-index:99999;pointer-events:none;width:18px;height:18px;margin:-9px 0 0 -9px;border-radius:50%;background:rgba(9,105,218,.35);border:2px solid #0969da;left:-50px;top:-50px;transition:transform .1s';
    document.body.append(c);
    addEventListener('mousemove', e => { c.style.left = e.clientX + 'px'; c.style.top = e.clientY + 'px'; }, true);
    addEventListener('mousedown', () => c.style.transform = 'scale(.6)', true);
    addEventListener('mouseup', () => c.style.transform = '', true);
  }));
  const page = context.pages()[0] ?? await context.newPage();
  // networkidle never settles reliably on live GitHub; wait for the bot's comments instead.
  await page.goto(PR);
  await page.locator('.timeline-comment-group a.author', { hasText: 'adriangbot' }).first().waitFor({ state: 'attached' });
  await page.waitForTimeout(1500);
  return { context, page };
}

// Records the page while run() executes, via Chrome's screencast: lossless PNG frames with timestamps.
// (Playwright's recordVideo is low-bitrate VP8 whose quality pulses, showing up as washed-out flicker
// frames.) Returns an ffmpeg concat list that replays the frames with their real timing.
async function capture(page, run) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bdb-frames-'));
  const frames = [];
  const cdp = await page.context().newCDPSession(page);
  cdp.on('Page.screencastFrame', ({ data, metadata, sessionId }) => {
    const file = path.join(dir, `${String(frames.length).padStart(5, '0')}.png`);
    fs.writeFileSync(file, Buffer.from(data, 'base64'));
    frames.push({ file, t: metadata.timestamp });
    cdp.send('Page.screencastFrameAck', { sessionId }).catch(() => {});
  });
  await cdp.send('Page.startScreencast', { format: 'png' });
  await run();
  await cdp.send('Page.stopScreencast');
  // Frames only arrive when something repaints, so each one lasts until the next (the last until now).
  const end = Date.now() / 1000;
  const list = frames.map((f, i) => `file '${f.file}'\nduration ${((frames[i + 1]?.t ?? end) - f.t).toFixed(3)}`);
  const listFile = path.join(dir, 'frames.txt');
  fs.writeFileSync(listFile, [...list, `file '${frames.at(-1).file}'`].join('\n') + '\n');
  return listFile;
}

// Park the viewport on the stretch of timeline the bot floods.
async function scrollToBots(page) {
  await page.evaluate(() => {
    const first = [...document.querySelectorAll('.timeline-comment-group')]
      .find(c => c.querySelector('a.author')?.textContent.trim() === 'adriangbot');
    // Start at the human comment that triggered it (visible both with and without the extension).
    let el = first?.closest('.js-timeline-item')?.previousElementSibling;
    while (el && el.offsetParent === null) el = el.previousElementSibling;
    // GitHub sets scroll-behavior: smooth, which a follow-up scrollBy would cancel; jump instantly.
    if (el) window.scrollTo({ top: el.getBoundingClientRect().top + scrollY - 80, behavior: 'instant' });
  });
  await page.waitForTimeout(500);
}

// One GIF per feature (docs/<name>.gif), each starting from a freshly loaded PR scrolled to the bot comments.
// Every step must visibly change the page, or the GIF shows a click that does nothing: a step names the
// region it should change ('timeline' = left of the panel, or 'panel'). See CLAUDE.md before editing.
const SCENES = {
  // Bring every bot comment back (GitHub without the extension), then fold them away again.
  'show-hide-all': async ({ step, panel }) => {
    await step('show all', 'timeline', panel.getByRole('button', { name: 'All' }));
    await step('show none', 'timeline', panel.getByRole('button', { name: 'None' }));
  },
  // Reveal one result from the panel (scrolls to and highlights it), then hide it again.
  'reveal-comment': async ({ step, panel }) => {
    const eye = panel.locator('li[data-status="completed"] a[data-id]').first();
    await step('reveal result', 'timeline', eye);
    await step('hide result', 'timeline', eye);
  },
  // Jump from a run in the panel to the human comment that triggered it.
  'go-to-trigger': async ({ step, panel }) => {
    await step('go to trigger', 'timeline', panel.locator('li[data-status="completed"] a[data-goto]').first());
  },
  // Show only finished results, then scroll down to them.
  'results-only': async ({ step, panel, page, wheelTo }) => {
    const bots = page.locator('.timeline-comment-group:visible', { has: page.locator('a.author', { hasText: 'adriangbot' }) });
    await step('results only', 'timeline', panel.getByRole('button', { name: 'Results only' }), () => wheelTo(bots.first()));
  },
  // Collapse the panel out of the way, and bring it back.
  'collapse-panel': async ({ step, panel }) => {
    await step('collapse panel', 'panel', panel.locator('.Box-header'));
    await step('expand panel', 'panel', panel.locator('.Box-header'));
  },
};

// Runs a scene. With check, fails on a step that doesn't change its region; otherwise captures it and
// returns the frame list. Checking and capturing are separate runs because taking screenshots while
// recording leaves garbled flicker frames.
async function play(page, scene, { check }) {
  const panel = page.locator('#bdb-panel');
  await panel.waitFor();
  await scrollToBots(page);
  const pause = ms => page.waitForTimeout(ms);
  const panelBox = await panel.boundingBox();
  const regions = {
    timeline: { x: 0, y: 0, width: panelBox.x - 8, height: viewport.height },
    panel: panelBox,
  };
  const step = async (name, region, locator, after) => {
    await locator.scrollIntoViewIfNeeded();
    const box = await locator.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 25 });
    await pause(500);
    const before = check && await page.screenshot({ clip: regions[region] });
    await locator.click();
    await pause(400);
    await after?.();
    await pause(1600);
    if (check && before.equals(await page.screenshot({ clip: regions[region] })))
      throw new Error(`step "${name}" made no visible change to the ${region}`);
  };
  // Scroll the timeline with the wheel (visible in the GIF, unlike a jump) until el is near the top.
  const wheelTo = async el => {
    await page.mouse.move(regions.timeline.width / 2, viewport.height / 2, { steps: 10 });
    const dy = (await el.boundingBox()).y - 120;
    for (let i = 0; i < 10; i++) { await page.mouse.wheel(0, dy / 10); await pause(60); }
  };
  const run = async () => {
    await pause(800);
    await SCENES[scene]({ step, panel, page, wheelTo });
  };
  return check ? run() : capture(page, run);
}

const only = process.argv.slice(2);
for (const name of only) if (!SCENES[name] && name !== 'before-after') throw new Error(`unknown scene ${name}; have: ${Object.keys(SCENES).join(', ')}`);
fs.mkdirSync(OUT, { recursive: true });

if (!only.length) {
  // The panel on its own, in both themes.
  for (const colorScheme of ['light', 'dark']) {
    const { context, page } = await open({ colorScheme });
    await page.locator('#bdb-panel').screenshot({ path: path.join(OUT, `panel${colorScheme === 'dark' ? '-dark' : ''}.png`) });
    await context.close();
  }
}

// Before/after GIF: the same scroll through the timeline without and with the extension, side by side.
if (!only.length || only.includes('before-after')) {
  const size = { width: 900, height: 800 };
  const clips = [];
  for (const [extension, label] of [[false, ['Without extension', '#cf222e']], [true, ['With Better DataFusion Bots', '#1a7f37']]]) {
    const { context, page } = await open({ extension, recording: true, label, size });
    // Collapse the panel so it doesn't cover the (now clean) timeline; its header still shows the bot summary.
    if (extension) await page.locator('#bdb-panel .Box-header').click();
    await scrollToBots(page);
    await page.mouse.move(size.width / 3, size.height / 2);
    clips.push(await capture(page, async () => {
      await page.waitForTimeout(1000);
      for (let i = 0; i < 90; i++) { await page.mouse.wheel(0, 45); await page.waitForTimeout(40); }
      await page.waitForTimeout(1500);
    }));
    await context.close();
  }
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error',
    '-f', 'concat', '-safe', '0', '-i', clips[0], '-f', 'concat', '-safe', '0', '-i', clips[1], '-filter_complex',
    `[0][1]hstack=shortest=1,fps=12,scale=1200:-1:flags=lanczos,${PALETTE}`,
    path.join(OUT, 'before-after.gif')]);
  console.log('recorded before-after');
}

for (const scene of only.length ? only.filter(s => s !== 'before-after') : Object.keys(SCENES)) {
  {
    const { context, page } = await open();
    try { await play(page, scene, { check: true }); }
    catch (e) { throw new Error(`scene "${scene}": ${e.message}`); }
    finally { await context.close(); }
  }
  const { context, page } = await open({ recording: true });
  const frames = await play(page, scene, { check: false });
  await context.close();
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', frames, '-vf',
    `fps=12,scale=960:-1:flags=lanczos,${PALETTE}`,
    path.join(OUT, `${scene}.gif`)]);
  console.log('recorded', scene);
}

console.log('wrote', fs.readdirSync(OUT).join(', '));
