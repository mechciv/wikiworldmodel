"""Textures for the pie, from the hero's baked textures in tex/ (run bake.py first).

For each map: a tangent-space normal map (relief) and a mask (R land, G roughness, B ice) that the
scene reads to scatter models on land or water and to make water shine. Three maps are stand-ins,
generated, not sourced, and the scene's README says so: the magma ocean, the Archean's first oceans
and islands, and Snowball Earth (the 500 Ma continents under ice; the 690 Ma ones are not baked).

    python3 tools/hero/pie/bake_pie.py
"""
import os
import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
TEX = os.path.join(HERE, '..', 'tex')
W, H = 4096, 2048
MW, MH = 2048, 1024
rng = np.random.default_rng(7)


def load(name, mode='RGB', size=(W, H)):
    # each band on its own: PIL zeroes the colour of transparent pixels when it resizes RGBA
    im = Image.open(os.path.join(TEX, name))
    bands = im.split() if mode == 'RGBA' else im.convert(mode).split()
    return np.stack([np.asarray(b.resize(size, Image.LANCZOS)).astype(np.float32) / 255 for b in bands], -1)


def save(name, a, mode='RGB', q=92):
    a = (np.clip(a, 0, 1) * 255).astype(np.uint8)
    im = Image.fromarray(a, mode)
    p = os.path.join(TEX, name)
    im.save(p, quality=q) if name.endswith('.jpg') else im.save(p, compress_level=3)
    print('wrote', name, im.size)


def noise(h, w, octaves=6, seed=0, base=4):
    r = np.random.default_rng(seed)
    acc = np.zeros((h, w), np.float32)
    amp, tot = 1.0, 0
    for o in range(octaves):
        s = base * 2 ** o
        n = r.random((max(2, s // 2), s)).astype(np.float32)
        # wrap in longitude so there is no seam
        n = np.concatenate([n, n[:, :1]], 1)
        n = np.asarray(Image.fromarray((n * 255).astype(np.uint8)).resize((w + w // s, h), Image.BICUBIC)).astype(np.float32)[:, :w] / 255
        acc += amp * n
        tot += amp
        amp *= 0.55
    return acc / tot


def normal_from_slopes(sx, sy, k):
    """sx, sy: east and north slopes (any scale). A tangent-space normal map, u east, v north."""
    n = np.stack([-k * sx, -k * sy, np.ones_like(sx)], -1)
    n /= np.linalg.norm(n, axis=-1, keepdims=True)
    return 0.5 + 0.5 * n


def normal_from_height(h, k):
    sx = (np.roll(h, -1, 1) - np.roll(h, 1, 1)) * h.shape[1] / 2048
    hp = np.pad(h, ((1, 1), (0, 0)), mode='edge')
    sy = (hp[:-2] - hp[2:]) * h.shape[0] / 1024
    return normal_from_slopes(sx, sy, k)


def mask(land, ice=None, rough_land=0.92, rough_water=0.58, rough_ice=0.85):
    land = np.asarray(Image.fromarray((land * 255).astype(np.uint8)).resize((MW, MH), Image.BILINEAR)).astype(np.float32) / 255
    ice = np.zeros_like(land) if ice is None else np.asarray(Image.fromarray((ice * 255).astype(np.uint8)).resize((MW, MH), Image.BILINEAR)).astype(np.float32) / 255
    rough = rough_water + (rough_land - rough_water) * land
    rough = rough + (rough_ice - rough) * ice
    return np.stack([land, rough, ice], -1)


def from_surface(key, k=2.2):
    s = load(f'{key}_surface.png', 'RGBA')
    sx, sy = (s[..., 0] - 0.5) * 2, (s[..., 1] - 0.5) * 2
    save(f'pie_{key}_normal.jpg', normal_from_slopes(sx, sy, k))
    return 1 - s[..., 2], s[..., 3]


def main():
    # the sourced maps: relief and land from the hero's bake
    for key in ['now', 'p500', 'p250', 'p200', 'p150', 'p100']:
        land, icy = from_surface(key)
        save(f'pie_{key}_mask.png', mask(land, icy))

    # the ice age sketch: today's map under hand-drawn ice sheets over North America and northern
    # Europe, with steppe south of them (a caricature of the last glacial maximum, not a source)
    now = load('now_albedo.jpg')
    now_land = 1 - load('now_surface.png', 'RGBA')[..., 2]
    lat = np.linspace(90, -90, H)[:, None] * np.ones((1, W))
    lon = np.linspace(-180, 180, W)[None, :] * np.ones((H, 1))
    wob = 6 * (noise(H, W, 5, 41, 8) - 0.5)
    bump = lambda c, w: np.exp(-(((lon - c + 180) % 360 - 180) / w) ** 4)
    edge = 74 - 31 * bump(-96, 46) - 21 * bump(20, 34) + wob
    ice = np.clip((lat - edge) / 1.5, 0, 1)
    steppe = np.clip((lat - (edge - 14)) / 4, 0, 1) * (1 - ice) * now_land * (lat > 25)
    icec = np.array([0.9, 0.94, 0.98]) * (0.94 + 0.06 * noise(H, W, 4, 42, 32)[..., None])
    stc = np.array([0.66, 0.62, 0.45])
    alb = now * (1 - steppe[..., None] * 0.65) + stc * steppe[..., None] * 0.65
    alb = alb * (1 - ice[..., None]) + icec * ice[..., None]
    save('pie_iceage_albedo.jpg', alb)
    nn = np.asarray(Image.open(os.path.join(TEX, 'pie_now_normal.jpg')).convert('RGB')).astype(np.float32) / 255
    sheet = normal_from_height(noise(H, W, 5, 43, 16) * 0.5, 2.0)
    save('pie_iceage_normal.jpg', nn * (1 - ice[..., None]) + sheet * ice[..., None])
    save('pie_iceage_mask.png', mask(np.maximum(now_land, ice), ice))

    # the magma ocean: a crust that stands up from the glow
    mg = load('toy_magma.jpg')
    hgt = 1 - mg.mean(-1)
    save('pie_magma_normal.jpg', normal_from_height(hgt, 3.0))
    save('pie_magma_mask.png', mask(np.zeros(hgt.shape, np.float32), rough_water=0.7))

    # the Archean: a dark green, iron-rich ocean with a scatter of volcanic islands (generated)
    lat = np.linspace(90, -90, H)[:, None]
    n1 = noise(H, W, 7, 21, 6)
    n2 = noise(H, W, 5, 22, 24)
    hgt = n1 * 0.75 + n2 * 0.25
    land = (hgt > 0.66).astype(np.float32)
    shelf = np.clip((hgt - 0.58) / 0.08, 0, 1)
    deep = np.array([0.08, 0.2, 0.2]); shallow = np.array([0.22, 0.42, 0.36])
    rockc = np.array([0.36, 0.3, 0.27]); ashc = np.array([0.5, 0.45, 0.4])
    t = np.clip((hgt - 0.66) / 0.12, 0, 1)[..., None]
    alb = deep + (shallow - deep) * shelf[..., None]
    alb = np.where(land[..., None] > 0, rockc + (ashc - rockc) * t, alb)
    alb *= 0.9 + 0.2 * noise(H, W, 4, 23, 64)[..., None]
    save('pie_archean_albedo.jpg', alb)
    save('pie_archean_normal.jpg', normal_from_height(np.maximum(hgt, 0.6) * land + 0.6 * (1 - land), 6.0))
    save('pie_archean_mask.png', mask(land))

    # Snowball Earth: the 500 Ma continents under ice (a stand-in for 690 Ma), sea ice everywhere
    p5 = load('p500_surface.png', 'RGBA')
    land5 = 1 - p5[..., 2]
    cr = np.abs(noise(H, W, 6, 31, 8) - 0.5)
    cracks = np.clip(1 - cr * 30, 0, 1) ** 2
    base = np.array([0.86, 0.92, 0.97])
    blue = np.array([0.55, 0.72, 0.86])
    alb = base[None, None] * (0.93 + 0.07 * noise(H, W, 5, 32, 16)[..., None])
    alb = alb * (1 - 0.06 * land5[..., None]) + np.array([0.02, 0.0, -0.02]) * land5[..., None]
    alb = alb + (blue - alb) * cracks[..., None] * 0.6
    save('pie_snowball_albedo.jpg', alb)
    hgt = land5 * 0.4 + noise(H, W, 6, 33, 16) * 0.3 - cracks * 0.2
    save('pie_snowball_normal.jpg', normal_from_height(hgt, 3.0))
    save('pie_snowball_mask.png', mask(land5, np.ones_like(land5)))


if __name__ == '__main__':
    main()
