"""Subtitle overlays as images, because this ffmpeg has no libass or drawtext.

Each cue becomes a transparent 1920x1080 PNG with small white text on a black
plate, bottom-centred, clear of the frame edge. Gaps get a blank PNG. The
concat list carries each image's duration, so one overlay pass burns them all.
A cue that would need more than two lines fails instead of being truncated.
"""
import json
import os
import sys
from PIL import Image, ImageDraw, ImageFont

cues_path, out_dir, W, H, total = sys.argv[1], sys.argv[2], int(sys.argv[3]), int(sys.argv[4]), float(sys.argv[5])
os.makedirs(out_dir, exist_ok=True)
cues = json.load(open(cues_path))

FONT_SIZE = 40
font = None
for path in ["/System/Library/Fonts/HelveticaNeue.ttc", "/System/Library/Fonts/Helvetica.ttc", "/Library/Fonts/Arial.ttf", "/System/Library/Fonts/Supplemental/Arial.ttf"]:
    if os.path.exists(path):
        font = ImageFont.truetype(path, FONT_SIZE)
        break
if font is None:
    raise SystemExit("NO_FONT")

MAX_W = int(W * 0.72)


def wrap(text):
    words, lines, cur = text.split(), [], ""
    for w in words:
        trial = (cur + " " + w).strip()
        if font.getlength(trial) <= MAX_W:
            cur = trial
        else:
            lines.append(cur)
            cur = w
    if cur:
        lines.append(cur)
    if len(lines) > 2:
        raise SystemExit(f"CUE_TOO_LONG: {text}")
    return lines


blank = os.path.join(out_dir, "blank.png")
Image.new("RGBA", (W, H), (0, 0, 0, 0)).save(blank)
entries = []
t = 0.0
for i, cue in enumerate(cues):
    if cue["start"] > t + 0.01:
        entries.append((blank, cue["start"] - t))
    lines = wrap(cue["text"])
    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    line_h = FONT_SIZE + 12
    text_w = max(font.getlength(l) for l in lines)
    pad_x, pad_y = 22, 12
    box_w, box_h = int(text_w + 2 * pad_x), int(len(lines) * line_h + 2 * pad_y - 12)
    x0, y0 = (W - box_w) // 2, H - 64 - box_h
    d.rounded_rectangle([x0, y0, x0 + box_w, y0 + box_h], radius=8, fill=(0, 0, 0, 205))
    for k, l in enumerate(lines):
        lw = font.getlength(l)
        d.text(((W - lw) / 2, y0 + pad_y + k * line_h - 4), l, font=font, fill=(255, 255, 255, 255))
    p = os.path.join(out_dir, f"cue{i:04d}.png")
    img.save(p)
    entries.append((p, max(0.04, cue["end"] - cue["start"])))
    t = cue["end"]
if total > t:
    entries.append((blank, total - t))
with open(os.path.join(out_dir, "list.txt"), "w") as f:
    for p, dur in entries:
        f.write(f"file '{os.path.abspath(p)}'\nduration {dur:.3f}\n")
    f.write(f"file '{os.path.abspath(entries[-1][0])}'\n")
print(f"cues {len(cues)} images {len(entries)}")
