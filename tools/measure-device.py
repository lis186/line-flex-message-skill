# Measures calibration-card screenshots (tests/device/calibration.json) taken on a phone.
# Run: uv run --with pillow python tools/measure-device.py <shot.png>...
# Finds the 200px red ruler of the card nearest the screen centre to get the scale (device px per CSS px),
# then walks down a column inside that card, reporting each tinted box and the text lines inside it, in CSS px.
import sys
from PIL import Image

def is_red(p):
    return p[0] > 190 and p[1] < 90 and p[2] < 90

def tinted(p):
    # Pale fills (#ffd6d6, #d6ffd6, #d6e4ff, #fff3c4) after the phone's colour management.
    return min(p[:3]) < 248 and min(p[:3]) > 170 and max(p[:3]) - min(p[:3]) > 12

def dark(p):
    return sum(p[:3]) < 3 * 140

def measure(path):
    img = Image.open(path).convert('RGB')
    w, h = img.size
    px = img.load()
    # Red ruler runs: find rows containing a long red run; keep the run whose centre is closest to screen centre.
    best = None
    for y in range(0, h, 2):
        x = 0
        while x < w:
            if is_red(px[x, y]):
                x0 = x
                while x < w and is_red(px[x, y]):
                    x += 1
                if x - x0 > 150:
                    cand = (abs((x0 + x) / 2 - w / 2), x0, x, y)
                    if best is None or cand[0] < best[0]:
                        best = cand
            x += 1
    _, rx0, rx1, ry = best
    # Ruler vertical extent.
    top = ry
    while top > 0 and is_red(px[(rx0 + rx1) // 2, top - 1]):
        top -= 1
    bot = ry
    while bot < h - 1 and is_red(px[(rx0 + rx1) // 2, bot + 1]):
        bot += 1
    scale = (rx1 - rx0) / 200.0
    print(f'== {path}: ruler {rx1 - rx0}x{bot - top + 1} device px -> scale {scale:.3f} px/CSSpx '
          f'(ruler height {(bot - top + 1) / scale:.1f}px, expect 20)')

    # Walk down a column 3 CSS px inside the ruler's left edge, collecting tinted segments.
    cx = rx0 + int(3 * scale)
    y = bot + 1
    segments = []
    while y < h - 2:
        if tinted(px[cx, y]):
            y0 = y
            while y < h and (tinted(px[cx, y]) or dark(px[cx, y]) or not is_white(px[cx, y])):
                y += 1
            segments.append((y0, y))
        y += 1
    for i, (y0, y1) in enumerate(segments):
        # Box horizontal extent along its first row.
        x0 = cx
        while x0 > 0 and tinted(px[x0 - 1, y0 + 1]):
            x0 -= 1
        x1 = cx
        while x1 < w - 1 and tinted(px[x1 + 1, y0 + 1]):
            x1 += 1
        # Text rows: any dark pixel across the box width.
        rows = [yy for yy in range(y0, y1) if any(dark(px[xx, yy]) for xx in range(x0, x1 + 1, 2))]
        lines = []
        for yy in rows:
            if lines and yy - lines[-1][1] <= 3:
                lines[-1][1] = yy
            else:
                lines.append([yy, yy])
        ink = ', '.join(f'{(a - y0) / scale:.1f}-{(b - y0) / scale:.1f}' for a, b in lines)
        print(f'  box{i + 1}: y {(y0 - bot) / scale:6.1f}  h {(y1 - y0) / scale:5.1f}  w {(x1 - x0 + 1) / scale:5.1f}  '
              f'ink-lines {len(lines)} [{ink}]')

def is_white(p):
    return min(p[:3]) >= 248

for path in sys.argv[1:]:
    measure(path)
