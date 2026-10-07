"""
Lay Thenar's captured screens out as two labelled contact sheets.

    python3 scripts/contact-sheet.py

Reads docs/screens/thenar/<nn>-<screen>-{desktop,mobile}.png (scripts/capture-screens.mjs)
and writes docs/screens/sheets/thenar-desktop.png and thenar-mobile.png.
"""
import glob
import os
import re

from PIL import Image, ImageDraw, ImageFont

SRC = "docs/screens/thenar"
OUT = "docs/screens/sheets"
BG = (10, 10, 12)
INK = (235, 235, 240)
DIM = (130, 130, 140)
LABELS = {
    "landing": "Landing",
    "station-driving": "Operator console: driving the SO-101",
    "run": "A paid run, re-hashed in the browser",
    "corpus-purchase": "Corpus: bought over x402 (0.01 USDC)",
    "leaderboard": "Leaderboard",
    "passkey-many-keys": "Passkey: one passkey, many keys (Mera)",
    "agents": "Agents: the x402 offer and agent sales",
}


def font(size):
    for f in ("/System/Library/Fonts/SFNS.ttf", "/System/Library/Fonts/Helvetica.ttc", "/Library/Fonts/Arial.ttf"):
        if os.path.exists(f):
            return ImageFont.truetype(f, size)
    return ImageFont.load_default()


def sheet(kind, cols, thumb_w, title):
    files = sorted(glob.glob(f"{SRC}/*-{kind}.png"))
    if not files:
        raise SystemExit(f"no {kind} screens in {SRC}")
    first = Image.open(files[0])
    thumb_h = round(first.height * thumb_w / first.width)
    pad, label_h, head = 28, 46, 92
    rows = (len(files) + cols - 1) // cols
    W = pad + cols * (thumb_w + pad)
    H = head + rows * (thumb_h + label_h + pad) + pad
    img = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(img)
    d.text((pad, 26), title, fill=INK, font=font(34))
    d.text((pad, 66), "Real local-chain state: anvil with the Monad contracts, signed transactions, live pages.", fill=DIM, font=font(16))
    for i, f in enumerate(files):
        r, c = divmod(i, cols)
        x = pad + c * (thumb_w + pad)
        y = head + r * (thumb_h + label_h + pad)
        im = Image.open(f).convert("RGB").resize((thumb_w, thumb_h), Image.LANCZOS)
        img.paste(im, (x, y))
        d.rectangle([x - 1, y - 1, x + thumb_w, y + thumb_h], outline=(45, 45, 52))
        m = re.match(r".*/(\d\d)-(.+)-" + kind + r"\.png$", f)
        nn, name = m.group(1), m.group(2)
        d.text((x, y + thumb_h + 10), f"{nn}  {LABELS.get(name, name)}", fill=INK, font=font(18 if kind == "desktop" else 15))
    os.makedirs(OUT, exist_ok=True)
    path = f"{OUT}/thenar-{kind}.png"
    img.save(path, optimize=True)
    print(path, img.size)


sheet("desktop", 2, 720, "Thenar · key screens · desktop 1440×900")
sheet("mobile", 4, 300, "Thenar · key screens · mobile 390×844")
