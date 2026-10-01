# Flags flicker in GIFs: a frame that differs from both neighbours while the neighbours match.
# Usage: uv run --with numpy --with pillow python scripts/check-gif-flicker.py [gif...]   (default: docs/*.gif)
import glob
import sys
import numpy as np
from PIL import Image, ImageSequence

total = 0
for path in sys.argv[1:] or sorted(glob.glob('docs/*.gif')):
    F = [np.asarray(f.convert('L'), dtype=np.int16) for f in ImageSequence.Iterator(Image.open(path))]
    changed = lambda a, b: (np.abs(F[a] - F[b]) > 24).mean() * 100  # % of pixels that changed
    bad = 0
    for i in range(1, len(F) - 1):
        prev, nxt, around = changed(i, i - 1), changed(i, i + 1), changed(i - 1, i + 1)
        if prev > 0.5 and nxt > 0.5 and around < min(prev, nxt) / 3:
            bad += 1
            print(f'{path} frame {i + 1}/{len(F)}: {prev:.1f}% changed vs previous, {nxt:.1f}% vs next, neighbours differ {around:.2f}%')
    print(f'{path}: {len(F)} frames, {bad} flicker frame(s)')
    total += bad
sys.exit(1 if total else 0)
