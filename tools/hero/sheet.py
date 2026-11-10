import sys
from PIL import Image
out = sys.argv[1]
files = sys.argv[2:]
ims = [Image.open(f).convert('RGB') for f in files]
w, h = ims[0].size
s = min(1.0, 1600 / (2 * w))
tw, th = int(w * s), int(h * s)
cols = 2 if len(ims) > 1 else 1
rows = (len(ims) + cols - 1) // cols
sheet = Image.new('RGB', (tw * cols, th * rows), (40, 40, 40))
for i, im in enumerate(ims):
    sheet.paste(im.resize((tw, th), Image.LANCZOS), ((i % cols) * tw, (i // cols) * th))
sheet.save(out, quality=88)
