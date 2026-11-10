"""Quick 2D prototypes of hero layouts, from tools/hero/tex. Not production: for comparing formats."""
import sys, os
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

HERO = '/Users/kvh/dev/sim/lightworld/tools/hero'
SITE = '/Users/kvh/dev/sim/lightworld/site/img'
OUT = os.path.dirname(os.path.abspath(__file__)) + '/out'
os.makedirs(OUT, exist_ok=True)
W, H = 1800, 1000
rng = np.random.default_rng(7)
FONT = '/System/Library/Fonts/Supplemental/Arial.ttf'
try:
    ImageFont.truetype(FONT, 10)
except Exception:
    FONT = None


def font(sz):
    return ImageFont.truetype(FONT, sz) if FONT else ImageFont.load_default()


def tex(name, w=2048):
    im = Image.open(f'{HERO}/tex/{name}').convert('RGB').resize((w, w // 2), Image.LANCZOS)
    return np.asarray(im).astype(np.float32) / 255


def noise(h, w, octaves=6, seed=0):
    r = np.random.default_rng(seed)
    acc = np.zeros((h, w), np.float32)
    amp, tot = 1.0, 0
    for o in range(octaves):
        s = 4 * 2 ** o
        n = r.random((s // 2 + 1, s)).astype(np.float32)
        n = np.asarray(Image.fromarray((n * 255).astype(np.uint8)).resize((w, h), Image.BICUBIC)).astype(np.float32) / 255
        acc += amp * n
        tot += amp
        amp *= 0.55
    return acc / tot


def magma_tex(w=2048):
    h = w // 2
    n = noise(h, w, 7, 3)
    cr = np.abs(noise(h, w, 6, 11) - 0.5)
    crack = np.clip(1 - cr * 14, 0, 1) ** 2
    t = np.clip(0.15 + 0.5 * n + 0.9 * crack, 0, 1)
    stops = np.array([[0.05, 0.02, 0.02], [0.35, 0.06, 0.02], [0.85, 0.3, 0.05], [1.0, 0.75, 0.3], [1, 0.95, 0.75]])
    x = t * (len(stops) - 1)
    i = np.clip(x.astype(int), 0, len(stops) - 2)
    f = (x - i)[..., None]
    return stops[i] * (1 - f) + stops[i + 1] * f


def era_textures():
    T = {}
    T['magma'] = magma_tex()
    T['p500'] = tex('p500_albedo.jpg')
    T['p250'] = tex('p250_albedo.jpg')
    T['p100'] = tex('p100_albedo.jpg')
    now = tex('now_albedo.jpg')
    ppl = tex('L_people.jpg')
    sat = ppl.max(-1) - ppl.min(-1)
    m = np.clip((sat - 0.12) * 4, 0, 1)[..., None]
    T['rome'] = now * (1 - 0.55 * m) + ppl * 0.55 * m
    T['now'] = now
    lights = np.asarray(Image.open(f'{HERO}/tex/now_lights.png').convert('L').resize((2048, 1024), Image.LANCZOS)).astype(np.float32) / 255
    T['lights'] = lights
    for k in ['plates', 'terrain', 'climate', 'life', 'people']:
        T['L_' + k] = tex(f'L_{k}.jpg')
    return T


def globe(texture, size, lon0=0, lat0=20, light=(-0.6, 0.4, 0.7), lights=None, night=0.08, atmo=True,
          lon_mask=None):
    """Orthographic globe → RGBA float array (size×size). lon_mask: (lo, hi) in degrees keeps only those longitudes."""
    ys, xs = np.mgrid[0:size, 0:size].astype(np.float32)
    x = (xs + 0.5) / size * 2 - 1
    y = 1 - (ys + 0.5) / size * 2
    r2 = x * x + y * y
    inside = r2 <= 1
    z = np.sqrt(np.clip(1 - r2, 0, 1))
    # rotate view: tilt by lat0 about x, then lon0 about y
    la, lo = np.radians(lat0), np.radians(lon0)
    y1 = y * np.cos(la) + z * np.sin(la)
    z1 = -y * np.sin(la) + z * np.cos(la)
    x1 = x
    lat = np.degrees(np.arcsin(np.clip(y1, -1, 1)))
    lon = np.degrees(np.arctan2(x1, z1)) + np.degrees(lo)
    lon = (lon + 180) % 360 - 180
    th, tw = texture.shape[:2]
    u = ((lon + 180) / 360 * tw).astype(int) % tw
    v = np.clip(((90 - lat) / 180 * th).astype(int), 0, th - 1)
    col = texture[v, u]
    L = np.array(light, np.float32)
    L /= np.linalg.norm(L)
    nd = x * L[0] + y * L[1] + z * L[2]
    shade = np.clip(nd, 0, 1) ** 0.8
    day = np.clip(nd * 4 + 0.3, 0, 1)
    rgb = col * (night + (1 - night) * shade)[..., None]
    if lights is not None:
        lt = lights[v, u]
        glow = (1 - day) * lt * 1.6
        rgb = rgb + glow[..., None] * np.array([1.0, 0.78, 0.45])
    if atmo:
        rim = np.clip((np.sqrt(r2) - 0.75) / 0.25, 0, 1) ** 2
        rgb = rgb * (1 - 0.35 * rim[..., None]) + rim[..., None] * np.array([0.35, 0.55, 0.95]) * (0.25 + 0.75 * np.clip(nd + 0.3, 0, 1))[..., None] * 0.6
    a = inside.astype(np.float32)
    # antialias edge
    a = np.clip((1 - np.sqrt(r2)) * size * 0.5 + 0.5, 0, 1) * (r2 < 1.01)
    if lon_mask is not None:
        lo_, hi_ = lon_mask
        d = (lon - lo_) % 360
        a = a * (d < (hi_ - lo_) % 360 if (hi_ - lo_) % 360 else 1)
    out = np.concatenate([np.clip(rgb, 0, 1), a[..., None]], -1)
    return out


def halo(size, color=(0.35, 0.55, 1.0), strength=0.5, extent=1.18):
    n = int(size * extent)
    ys, xs = np.mgrid[0:n, 0:n].astype(np.float32)
    r = np.hypot(xs - n / 2, ys - n / 2) / (size / 2)
    a = np.clip(1 - (r - 1) / (extent - 1), 0, 1) ** 2.5 * (r > 0.98) * strength
    return np.concatenate([np.ones((n, n, 3)) * np.array(color), a[..., None]], -1)


def to_img(a):
    return Image.fromarray((np.clip(a, 0, 1) * 255).astype(np.uint8))


def paste(canvas, rgba, cx, cy):
    im = to_img(rgba)
    canvas.alpha_composite(im, (int(cx - im.width / 2), int(cy - im.height / 2)))


def background():
    bg = Image.new('RGBA', (W, H), (2, 2, 4, 255))
    st = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(st)
    for _ in range(500):
        x, y = rng.random() * W, rng.random() * H
        b = int(40 + 140 * rng.random() ** 3)
        d.point((x, y), fill=(b, b, b + 10, 255))
    bg.alpha_composite(st)
    return bg


def label(canvas, xy, text, size=18, fill=(230, 225, 210, 255), anchor='la', spacing=2):
    d = ImageDraw.Draw(canvas)
    if spacing:
        text = (' ' * 0).join(text)
    d.text(xy, text, font=font(size), fill=fill, anchor=anchor)


def textblock(canvas, x=90, y=360):
    d = ImageDraw.Draw(canvas)
    d.text((x, y), 'WikiWorldModel', font=font(54), fill=(240, 236, 225, 255))
    d.text((x, y + 74), 'A sourced, four-dimensional history of', font=font(24), fill=(190, 186, 175, 255))
    d.text((x, y + 104), 'Earth, life and civilization.', font=font(24), fill=(190, 186, 175, 255))


ERAS = [('magma', '4,536 Ma', 'Magma ocean'), ('p500', '500 Ma', 'Cambrian'), ('p250', '250 Ma', 'Pangaea'),
        ('p100', '100 Ma', 'Cretaceous'), ('rome', '120 CE', 'Rome'), ('now', 'Today', 'Today')]
LAYERS = [('L_people', 'People', (201, 154, 74)), ('L_life', 'Life', (79, 154, 114)),
          ('L_climate', 'Climate', (79, 134, 184)), ('L_terrain', 'Terrain', (176, 110, 74)),
          ('L_plates', 'Plates', (109, 95, 158))]
ERA_LON = {'magma': 20, 'p500': 160, 'p250': 10, 'p100': 10, 'rome': 20, 'now': 20}


# ---------- G: orange-peel gores, each a different era, fanned out ----------
def proto_gores(T):
    c = background()
    textblock(c)
    size = 760
    cx, cy = 1230, 520
    n = len(ERAS)
    span = 360 / n
    paste(c, halo(size, strength=0.35), cx, cy)
    for i, (k, when, name) in enumerate(ERAS):
        # gores are longitudinal wedges of the visible hemisphere: view centred on lon 0, so visible lon -90..90
        lo = -90 + i * 180 / n
        hi = lo + 180 / n
        g = globe(T[k], size, lon0=0, lat0=12, lights=T['lights'] if k == 'now' else None,
                  night=0.5 if k == 'magma' else 0.1, lon_mask=(lo, hi))
        # shift the texture so each era shows its interesting side: re-render with offset lon by remapping
        mid = (lo + hi) / 2
        off = (i - (n - 1) / 2) * 16
        paste(c, g, cx + off, cy + abs(i - (n - 1) / 2) * 6)
        # label at the bottom of each gore
        lx = cx + off + np.sin(np.radians(mid)) * size / 2 * 0.98
        label(c, (lx, cy + size / 2 + 34), when, 15, anchor='ma', spacing=0)
        label(c, (lx, cy + size / 2 + 56), name.upper(), 12, fill=(160, 155, 145, 255), anchor='ma', spacing=0)
    return c


# ---------- G2: gores as a true fan: each era a full globe slice, rotated to face the viewer ----------
def proto_fan(T):
    c = background()
    textblock(c)
    size = 700
    cx, cy = 1230, 560
    n = len(ERAS)
    for i, (k, when, name) in enumerate(ERAS):
        g = globe(T[k], size, lon0=ERA_LON[k], lat0=15, lights=T['lights'] if k == 'now' else None,
                  night=0.5 if k == 'magma' else 0.12)
        im = to_img(g)
        # a wedge mask: a pie slice from the centre
        mask = Image.new('L', im.size, 0)
        a0 = 180 + i * 180 / n
        ImageDraw.Draw(mask).pieslice([0, 0, size, size], a0, a0 + 180 / n, fill=255)
        alpha = Image.fromarray(np.minimum(np.asarray(im.split()[3]), np.asarray(mask)))
        im.putalpha(alpha)
        mid = np.radians(a0 + 90 / n)
        push = 18
        c.alpha_composite(im, (int(cx - size / 2 + np.cos(mid) * push), int(cy - size / 2 + np.sin(mid) * push)))
        r = size / 2 + 40
        lx, ly = cx + np.cos(mid) * r, cy + np.sin(mid) * r
        label(c, (lx, ly - 10), when, 16, anchor='mm', spacing=0)
        label(c, (lx, ly + 10), name.upper(), 11, fill=(160, 155, 145, 255), anchor='mm', spacing=0)
    # lower half: the layers as concentric half-rings
    rad = size / 2
    for j, (k, nm, colr) in enumerate(LAYERS):
        g = globe(T[k], size, lon0=20, lat0=15, atmo=False, night=0.35)
        im = to_img(g)
        mask = Image.new('L', im.size, 0)
        dd = ImageDraw.Draw(mask)
        inset = j * rad / 5.5
        dd.pieslice([inset, inset, size - inset, size - inset], 0, 180, fill=255)
        if j < 4:
            inset2 = (j + 1) * rad / 5.5
            dd.pieslice([inset2, inset2, size - inset2, size - inset2], 0, 180, fill=0)
        im.putalpha(Image.fromarray(np.minimum(np.asarray(im.split()[3]), np.asarray(mask))))
        c.alpha_composite(im, (int(cx - size / 2), int(cy - size / 2 + 26)))
        ang = np.radians(118)
        rr = rad - (j + 0.5) * rad / 5.5
        label(c, (cx + np.cos(ang) * rr - 6, cy + 26 + np.sin(ang) * rr), nm.upper(), 12, fill=colr + (255,),
              anchor='rm', spacing=0)
    return c


# ---------- H: the layer cake: isometric map slabs ----------
def iso_slab(tex_arr, w=900, h=450, shear=0.5, squash=0.42, alpha=1.0, edge=(255, 255, 255)):
    im = to_img(tex_arr).resize((w, h), Image.LANCZOS).convert('RGBA')
    # affine to a parallelogram: x' = x + shear*y ; y' = squash*y
    nw = int(w + shear * h)
    nh = int(squash * h)
    # PIL affine maps output→input: (x_in, y_in) = (a x + b y + c, d x + e y + f)
    inv = (1, -shear / squash, 0, 0, 1 / squash, 0)
    out = im.transform((nw, nh), Image.AFFINE, inv, Image.BICUBIC)
    if alpha < 1:
        a = np.asarray(out.split()[3]).astype(np.float32) * alpha
        out.putalpha(Image.fromarray(a.astype(np.uint8)))
    d = ImageDraw.Draw(out)
    d.polygon([(0, 0), (w, 0), (nw - 1, nh - 1), (shear * h, nh - 1)], outline=edge + (110,))
    return out


def proto_cake(T):
    c = background()
    textblock(c, 80, 380)
    x0, y0 = 760, 120
    gap = 150
    rows = [('rome', 'Surface · any time', (240, 236, 225))] + [(k, n, col) for k, n, col in LAYERS]
    order = list(reversed(rows))  # draw bottom first
    for j, (k, nm, colr) in enumerate(order):
        jj = len(order) - 1 - j
        y = y0 + jj * gap
        arr = T[k] if k in T else T['now']
        if k == 'rome':
            g = T['now'] * 0.7 + 0.3 * T['L_people']
            arr = np.clip(T['rome'] * 1.1, 0, 1)
        slab = iso_slab(arr, alpha=0.95)
        c.alpha_composite(slab, (x0, y))
        d = ImageDraw.Draw(c)
        label(c, (x0 - 20, y + 30), nm.upper(), 15, fill=colr + (255,), anchor='rm', spacing=0)
        d.line([(x0 - 14, y + 30), (x0 + 60, y + 30)], fill=colr + (160,), width=1)
    # vertical "sample" line through the stack at Rome
    return c


# ---------- I: space-time stack: era sheets with time going up ----------
def proto_spacetime(T):
    c = background()
    textblock(c, 80, 380)
    x0, y0 = 700, 70
    keys = list(reversed(ERAS))
    gap = 145
    for j, (k, when, name) in enumerate(reversed(keys)):
        # oldest at bottom
        jj = len(keys) - 1 - j
        y = y0 + jj * gap
        arr = T[k]
        if k == 'now':
            arr = np.clip(arr * 0.35 + T['lights'][..., None] * np.array([1, 0.8, 0.5]) * 1.4, 0, 1)
        slab = iso_slab(arr, w=860, h=430, alpha=0.97)
        c.alpha_composite(slab, (x0, y))
        label(c, (x0 - 20, y + 26), when, 18, anchor='rm', spacing=0)
        label(c, (x0 - 20, y + 48), name.upper(), 12, fill=(160, 155, 145, 255), anchor='rm', spacing=0)
    d = ImageDraw.Draw(c)
    d.line([(x0 - 120, y0 + 5 * gap + 120), (x0 - 120, y0 + 20)], fill=(200, 195, 180, 200), width=2)
    d.polygon([(x0 - 126, y0 + 30), (x0 - 114, y0 + 30), (x0 - 120, y0 + 14)], fill=(200, 195, 180, 220))
    return c


# ---------- K: a horizon panorama across time, over a cross-section of the layers ----------
def proto_panorama(T):
    c = Image.new('RGBA', (W, H), (2, 2, 4, 255))
    top = 610
    panels = [
        ('globe', 'magma', '4,536 Ma', 'MAGMA OCEAN'),
        ('globe', 'p250', '280 Ma', 'PANGAEA'),
        ('img', 'hell-creek-66ma.jpg', '66 Ma', 'HELL CREEK'),
        ('img', 'rome-above-315.jpg', '315 CE', 'ROME'),
        ('globe', 'now', 'Today', 'THE NIGHT SIDE'),
    ]
    pw = W // len(panels)
    strips = []
    for i, (kind, k, when, name) in enumerate(panels):
        tile = Image.new('RGBA', (pw + 160, top), (2, 2, 4, 255))
        if kind == 'img':
            im = Image.open(f'{SITE}/{k}').convert('RGBA')
            s = top / im.height
            im = im.resize((int(im.width * s), top), Image.LANCZOS)
            tile.alpha_composite(im, ((tile.width - im.width) // 2, 0))
        else:
            st = background().crop((0, 0, tile.width, top))
            tile.alpha_composite(st)
            g = globe(T[k], 560, lon0=ERA_LON[k] + (40 if k == 'now' else 0), lat0=18,
                      lights=T['lights'] if k == 'now' else None, light=(0.2, 0.3, 0.9) if k != 'now' else (0.9, 0.2, -0.3),
                      night=0.6 if k == 'magma' else 0.12)
            paste(tile, halo(560, strength=0.3), tile.width // 2, top // 2 + 10)
            paste(tile, g, tile.width // 2, top // 2 + 10)
        strips.append(tile)
    # blend tiles with soft horizontal feathering
    for i, tile in enumerate(strips):
        a = np.ones((top, tile.width), np.float32)
        ramp = np.linspace(0, 1, 160)
        if i > 0:
            a[:, :160] *= ramp
        if i < len(strips) - 1:
            a[:, -160:] *= ramp[::-1]
        tt = np.asarray(tile).astype(np.float32)
        tt[..., 3] *= a
        c.alpha_composite(Image.fromarray(tt.astype(np.uint8)), (i * pw - 80, 0))
    d = ImageDraw.Draw(c)
    # strata below
    band = (H - top) / len(LAYERS)
    for j, (k, nm, colr) in enumerate(LAYERS):
        arr = T[k][300:700]  # mid-latitudes strip
        strip = to_img(arr).resize((W, int(band) + 1), Image.LANCZOS).convert('RGBA')
        tint = Image.new('RGBA', strip.size, colr + (110,))
        strip.alpha_composite(tint)
        c.alpha_composite(strip, (0, int(top + j * band)))
        d.line([(0, int(top + j * band)), (W, int(top + j * band))], fill=(0, 0, 0, 200), width=2)
        d.text((24, top + j * band + band / 2), nm.upper(), font=font(15), fill=(250, 246, 235, 255), anchor='lm')
    d.line([(0, top), (W, top)], fill=(240, 236, 225, 255), width=2)
    for i, (_, _, when, name) in enumerate(panels):
        x = i * pw + pw / 2
        d.text((x, top - 46), when, font=font(18), fill=(245, 240, 230, 255), anchor='ma')
        d.text((x, top - 22), name, font=font(11), fill=(200, 195, 185, 255), anchor='ma')
    return c


# ---------- L: a procession of globes, oldest far and small, today near and large ----------
def proto_procession(T):
    c = background()
    textblock(c, 80, 120)
    pts = [(560, 820, 150), (760, 760, 200), (990, 680, 260), (1250, 580, 330), (1500, 470, 420), (1560, 360, 0)]
    items = list(zip(ERAS[:5], pts[:5]))
    for (k, when, name), (x, y, s) in items:
        lights = None
        if k == 'rome':
            s = 520
            x, y = 1460, 470
        g = globe(T[k], s, lon0=ERA_LON[k], lat0=18, light=(-0.7, 0.35, 0.6), night=0.5 if k == 'magma' else 0.1)
        paste(c, halo(s, strength=0.3), x, y)
        paste(c, g, x, y)
        label(c, (x, y + s / 2 + 18), when, 16, anchor='ma', spacing=0)
        label(c, (x, y + s / 2 + 40), name.upper(), 11, fill=(160, 155, 145, 255), anchor='ma', spacing=0)
    return c




# ---------- M: the space-time stack, each sheet a slab whose cut edge shows the layers ----------
def crop_lat(arr, top=78, bot=-58, lon0=-100, lon1=150):
    h, w = arr.shape[:2]
    r0, r1 = int((90 - top) / 180 * h), int((90 - bot) / 180 * h)
    c0, c1 = int((lon0 + 180) / 360 * w), int((lon1 + 180) / 360 * w)
    return arr[r0:r1, c0:c1]


def slab(top_arr, layer_arrs, w=820, h=380, shear=0.55, squash=0.36, thick=46):
    sw, sh = int(w + shear * h), int(squash * h)
    out = Image.new('RGBA', (sw, sh + thick + 2), (0, 0, 0, 0))
    topim = to_img(top_arr).resize((w, h), Image.LANCZOS).convert('RGBA')
    face = topim.transform((sw, sh), Image.AFFINE, (1, -shear / squash, 0, 0, 1 / squash, 0), Image.BICUBIC)
    # front face: strata, each textured with the bottom row strip of that layer
    x0 = int(shear * h)
    band = thick / len(layer_arrs)
    for j, (arr, colr) in enumerate(layer_arrs):
        strip = to_img(arr[int(arr.shape[0] * 0.55):int(arr.shape[0] * 0.75)]).resize((w, int(band) + 1)).convert('RGBA')
        strip.alpha_composite(Image.new('RGBA', strip.size, colr + (150,)))
        dk = Image.new('RGBA', strip.size, (0, 0, 0, 60))
        strip.alpha_composite(dk)
        out.alpha_composite(strip, (x0, sh + int(j * band)))
    # right side face: darker, sheared
    side = Image.new('RGBA', (sw, sh + thick + 2), (0, 0, 0, 0))
    d = ImageDraw.Draw(side)
    for j, (arr, colr) in enumerate(layer_arrs):
        y0_, y1_ = j * band, (j + 1) * band
        d.polygon([(w, y0_), (sw, sh + y0_), (sw, sh + y1_), (w, y1_)], fill=tuple(int(cc * 0.45) for cc in colr) + (255,))
    out.alpha_composite(side)
    out.alpha_composite(face)
    d = ImageDraw.Draw(out)
    d.line([(x0, sh), (sw - 1, sh)], fill=(255, 255, 255, 90), width=1)
    return out


def proto_stack2(T):
    c = background()
    d = ImageDraw.Draw(c)
    d.text((80, 380), 'WikiWorldModel', font=font(54), fill=(240, 236, 225, 255))
    d.text((80, 454), 'A sourced, four-dimensional history of', font=font(24), fill=(190, 186, 175, 255))
    d.text((80, 484), 'Earth, life and civilization.', font=font(24), fill=(190, 186, 175, 255))
    lay = [(crop_lat(T[k]), col) for k, _, col in LAYERS]
    x0, y0, gap = 700, 40, 152
    eras = ERAS
    pos = {}
    for j, (k, when, name) in enumerate(eras):
        jj = len(eras) - 1 - j
        y = y0 + jj * gap
        arr = T[k]
        if k == 'now':
            arr = np.clip(arr * 0.3 + T['lights'][..., None] * np.array([1, 0.8, 0.5]) * 1.6, 0, 1)
        lo0 = -100 if k not in ('p500',) else 50
        s = slab(crop_lat(arr, lon0=lo0, lon1=lo0 + 250), lay)
        pos[k] = (x0, y)
        c.alpha_composite(s, (x0, y))
        d.text((x0 - 24, y + 40), when, font=font(18), fill=(240, 236, 225, 255), anchor='rm')
        d.text((x0 - 24, y + 62), name.upper(), font=font(11), fill=(160, 155, 145, 255), anchor='rm')
    # a world line: Rome's site through time (here: a fixed screen x, a vertical dashed line)
    rx = x0 + 300 + 0.55 * 380 * 0.35
    for yy in range(int(y0 + 30), int(y0 + 5 * gap + 120), 9):
        d.line([(rx, yy), (rx, yy + 4)], fill=(255, 220, 160, 170), width=1)
    # layer legend along the front of the top slab
    lx = x0 + 0.55 * 380 + 830
    for j, (k, nm, col) in enumerate(LAYERS):
        d.text((lx + 12, y0 + 0.36 * 380 + 5 * gap + j * 9.2 + 4), nm.upper(), font=font(10), fill=col + (255,), anchor='lm')
    return c


# ---------- N: the era fan over a cross-section of the layers, with zoom-ins to the ground ----------
def circle_crop(path, d_):
    im = Image.open(path).convert('RGBA')
    s = d_ / min(im.size)
    im = im.resize((int(im.width * s), int(im.height * s)), Image.LANCZOS)
    l, t = (im.width - d_) // 2, (im.height - d_) // 2
    im = im.crop((l, t, l + d_, t + d_))
    m = Image.new('L', (d_ * 4, d_ * 4), 0)
    ImageDraw.Draw(m).ellipse([0, 0, d_ * 4 - 1, d_ * 4 - 1], fill=255)
    im.putalpha(m.resize((d_, d_), Image.LANCZOS))
    return im


def proto_fanzoom(T):
    c = background()
    d = ImageDraw.Draw(c)
    d.text((80, 150), 'WikiWorldModel', font=font(54), fill=(240, 236, 225, 255))
    d.text((80, 224), 'A sourced, four-dimensional history of', font=font(24), fill=(190, 186, 175, 255))
    d.text((80, 254), 'Earth, life and civilization.', font=font(24), fill=(190, 186, 175, 255))
    size = 720
    cx, cy = 1060, 560
    n = len(ERAS)
    paste(c, halo(size, strength=0.3), cx, cy)
    mids = {}
    for i, (k, when, name) in enumerate(ERAS):
        g = globe(T[k], size, lon0=ERA_LON[k], lat0=15, light=(0.0, 0.5, 0.85) if k != 'now' else (-0.2, 0.5, -0.4),
                  lights=T['lights'] if k == 'now' else None, night=0.5 if k == 'magma' else 0.12)
        im = to_img(g)
        mask = Image.new('L', (size * 2, size * 2), 0)
        a0 = 180 + i * 180 / n
        ImageDraw.Draw(mask).pieslice([0, 0, size * 2, size * 2], a0 + 0.4, a0 + 180 / n - 0.4, fill=255)
        mask = mask.resize((size, size), Image.LANCZOS)
        im.putalpha(Image.fromarray(np.minimum(np.asarray(im.split()[3]), np.asarray(mask))))
        mid = np.radians(a0 + 90 / n)
        mids[k] = mid
        c.alpha_composite(im, (int(cx - size / 2), int(cy - size / 2)))
        r = size / 2 + 36
        lx, ly = cx + np.cos(mid) * r, cy + np.sin(mid) * r
        d.text((lx, ly - 9), when, font=font(16), fill=(240, 236, 225, 255), anchor='mm')
        d.text((lx, ly + 10), name.upper(), font=font(10), fill=(160, 155, 145, 255), anchor='mm')
    # the cross-section below the equator line: concentric half-bands
    rad = size / 2
    bands = [('People', LAYERS[0]), ('Life', LAYERS[1]), ('Climate', LAYERS[2]), ('Terrain', LAYERS[3]), ('Plates', LAYERS[4])]
    widths = [0.11, 0.11, 0.11, 0.11, 0.11]
    rr = rad
    for (nm, (k, _, col)), wfrac in zip(bands, widths):
        r_in = rr - wfrac * rad
        ring = Image.new('RGBA', (size, size), (0, 0, 0, 0))
        texim = to_img(T[k]).resize((size, size // 2)).resize((size, size)).convert('RGBA')
        texim.alpha_composite(Image.new('RGBA', texim.size, col + (170,)))
        m = Image.new('L', (size * 2, size * 2), 0)
        md = ImageDraw.Draw(m)
        o = (rad - rr) * 2
        md.pieslice([o, o, size * 2 - o, size * 2 - o], 0, 180, fill=255)
        o2 = (rad - r_in) * 2
        md.pieslice([o2, o2, size * 2 - o2, size * 2 - o2], 0, 180, fill=0)
        texim.putalpha(m.resize((size, size), Image.LANCZOS))
        c.alpha_composite(texim, (int(cx - size / 2), int(cy - size / 2)))
        ang = np.radians(90)
        d.text((cx, cy + (rr + r_in) / 2), nm.upper(), font=font(12), fill=(250, 246, 235, 255), anchor='mm')
        rr = r_in
    # core: sources
    core = magma_tex(512) * np.array([1.0, 0.85, 0.6])
    cim = to_img(core).resize((int(rr * 2), int(rr * 2))).convert('RGBA')
    m = Image.new('L', cim.size, 0)
    ImageDraw.Draw(m).pieslice([0, 0, cim.width - 1, cim.height - 1], 0, 180, fill=255)
    cim.putalpha(m)
    c.alpha_composite(cim, (int(cx - rr), int(cy - rr)))
    d.text((cx, cy + rr * 0.45), 'SOURCES', font=font(13), fill=(40, 20, 5, 255), anchor='mm')
    d.line([(cx - rad - 4, cy), (cx + rad + 4, cy)], fill=(240, 236, 225, 220), width=2)
    # zoom-ins: Hell Creek from the Cretaceous wedge, Rome from the Rome wedge
    for (k, path, cxx, cyy, dd, title) in [('p100', f'{SITE}/hell-creek-66ma.jpg', 1600, 190, 250, 'Hell Creek, 66 Ma'),
                                            ('rome', f'{SITE}/rome-above-315.jpg', 1640, 560, 290, 'Rome, 315 CE')]:
        mid = mids[k]
        px, py = cx + np.cos(mid) * rad * 0.7, cy + np.sin(mid) * rad * 0.7
        d.line([(px, py), (cxx - dd / 2 * 0.95, cyy)], fill=(240, 236, 225, 140), width=1)
        d.ellipse([px - 4, py - 4, px + 4, py + 4], outline=(240, 236, 225, 220), width=2)
        ci = circle_crop(path, dd)
        c.alpha_composite(ci, (int(cxx - dd / 2), int(cyy - dd / 2)))
        d.ellipse([cxx - dd / 2, cyy - dd / 2, cxx + dd / 2, cyy + dd / 2], outline=(240, 236, 225, 200), width=2)
        d.text((cxx, cyy + dd / 2 + 16), title, font=font(14), fill=(220, 215, 205, 255), anchor='mm')
    return c


if __name__ == '__main__':
    T = era_textures()
    which = sys.argv[1:] or ['fan', 'cake', 'spacetime', 'panorama', 'procession']
    for w in which:
        im = globals()['proto_' + w](T).convert('RGB')
        im.save(f'{OUT}/{w}.jpg', quality=90)
        print('wrote', w)

