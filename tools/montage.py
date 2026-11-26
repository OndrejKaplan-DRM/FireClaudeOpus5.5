# Mřížka snímků s popisky: python3 tools/montage.py out.png cols W H soubor:popisek ...
import sys
from PIL import Image, ImageDraw
out, cols, W, H = sys.argv[1], int(sys.argv[2]), int(sys.argv[3]), int(sys.argv[4])
items = [a.split(':', 1) for a in sys.argv[5:]]
rows = (len(items) + cols - 1) // cols
s = Image.new('RGB', (W * cols, H * rows), (20, 20, 20)); d = ImageDraw.Draw(s)
for i, (f, lab) in enumerate(items):
    x, y = (i % cols) * W, (i // cols) * H
    s.paste(Image.open(f).convert('RGB').resize((W, H)), (x, y)); d.text((x + 6, y + 6), lab, fill=(255, 210, 110))
s.save(out)
