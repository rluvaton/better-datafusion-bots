# Better DataFusion Bots

Manifest V3 extension (no build step) that hides benchmark-bot comments (and the human `run benchmark …` requests they reply to) on apache/datafusion and apache/arrow-rs PRs and lists them in a floating panel. Code: `content.js` + `content.css` (the page), `background.js` (toolbar button: turns the extension on/off via `storage.local` `enabled`), `manifest.json`. Tests: `npm test` (Playwright, offline against `tests/fixtures/<repo>-pr-<n>.html`; add a repo by adding it to `manifest.json` matches and a fixture via `node tests/save-fixtures.mjs <repo>/<n>`).

## Keep README images in sync

Any change to a feature or to the UI (panel layout, styles, buttons, statuses, behavior visible on the PR page) must, in the same change:

1. Regenerate the images: `npm run screenshots` (everything) or `npm run screenshots -- <gif> ...` (only the affected GIFs, e.g. `reveal-comment before-after`). It loads the live PR https://github.com/apache/datafusion/pull/24672 in a fresh, logged-out Chromium and needs `ffmpeg`.
2. For a new feature: add a scene for it to `SCENES` in `scripts/screenshots.mjs`, which produces `docs/<scene>.gif`. Then add a `### <Feature>` section to the README's "Features" list with one or two sentences and the GIF.
3. Check for flicker: `uv run --with numpy --with pillow python scripts/check-gif-flicker.py` must report 0 flicker frames.
4. Look at the output yourself, not just the exit codes. Open the PNGs, and turn each changed GIF into a contact sheet to see every step:
   ```sh
   g=docs/reveal-comment.gif; D=$(ffprobe -v error -show_entries format=duration -of csv=p=0 $g)
   ffmpeg -y -loglevel error -i $g -vf "fps=6/$D,scale=600:-1,tile=3x2" -frames:v 1 /tmp/contact.png
   ```
5. Commit the regenerated images with the code change.

If you change `icons/icon.svg` or `icons/icon-off.svg` (the grey toolbar icon shown while turned off), run `npm run icons`.

## What's generated

| File | Shows |
| --- | --- |
| `docs/before-after.gif` | The same scroll through the PR without (left) and with (right) the extension, side by side. The README's hero image. |
| `docs/show-hide-all.gif` | **All** floods the timeline with bot comments, **None** folds them away. |
| `docs/reveal-comment.gif` | 👁 on a completed row reveals, scrolls to and highlights that result; 👁 again hides it. |
| `docs/go-to-trigger.gif` | ⚡ on a completed row jumps to the human comment that triggered the run. |
| `docs/results-only.gif` | **Results only**, then a wheel scroll down to the first visible result. |
| `docs/toggle-extension.gif` | Clicking the toolbar button turns the extension off (bot comments return, panel goes, icon greys out) and on again. The real toolbar is browser UI the screencast can't capture, so the scene draws a labelled stand-in button with the real icon that calls the same `toggle()`. |
| `docs/collapse-panel.gif` | Clicking the panel header collapses it, clicking again expands it. |
| `docs/panel.png`, `docs/panel-dark.png` | The panel alone, light and dark themes. |

## Rules for the GIFs

- **One feature per GIF**, a few seconds each. Every scene starts from a freshly loaded PR scrolled to the first human `run benchmarks` comment, so scenes don't depend on each other.
- **Every click must visibly change the page.** A click that only flips an icon, or toggles comments that are off-screen, looks broken. The script checks this: each `step` names the region it should change (`timeline` = the page left of the panel, or `panel`), and a check pass (not recorded) throws `step "<name>" made no visible change` if that region is pixel-identical before and after. Don't weaken the check to get past it; change the scene instead (scroll the effect into view, or pick a different target).
- **No flicker.** Problems found so far, and their fixes, which must stay:
  - Taking screenshots while recording leaves garbled frames → the visible-change check runs in a separate pass from the recording.
  - Playwright's `recordVideo` is low-bitrate VP8 whose quality pulses (washed-out frames) → frames come from Chrome's screencast as PNGs (`capture()`), assembled with their real timing.
  - Dithering shimmers on GitHub's flat greys → the palette uses `dither=none`.
  - Wheeling past the end of the page makes it bounce → the before/after scroll stops sending wheel events once the page is at the bottom.
  - A real one-frame scroll jitter in the extension itself (hash jump, then re-center) → `goTo` in `content.js` centers instantly in the same task. If the flicker check flags a frame, find out whether it's the recording or the extension before working around it.
- Move the (fake, drawn-in-page) cursor to the target before clicking, and pause after, so viewers can follow what happened. Scroll with the mouse wheel when the scroll itself is part of the story.
- Capture at 2x pixels and output at 1600px wide (feature GIFs) or 1800px (before/after); smaller output makes text blurry. Keep each feature GIF under ~1.5 MB and the before/after GIF under ~6 MB.
- The page comes from live GitHub, so if PR 24672 changes, re-check that every scene still makes sense.
