#!/usr/bin/env python3
"""Bake equirectangular textures for the hero render from the world's own datasets and build.

Every texture is equirectangular: row 0 is the north edge (90°N), column 0 the west edge (180°W),
pixel centres at half steps. Run a step by name: `python bake.py now lights rome paleo:250 ...`.
"""
import json
import math
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage
from scipy.io import netcdf_file

Image.MAX_IMAGE_PIXELS = None

ROOT = Path(__file__).resolve().parents[2]
DS = ROOT / '.cache/datasets'
# a world build, for Rome's territory, the Roman roads and the polities: HERO_BUILD=<id>, or the newest
import os
BUILD = ROOT / 'dist/builds' / os.environ['HERO_BUILD'] if os.environ.get('HERO_BUILD') else max((p for p in (ROOT / 'dist/builds').iterdir() if p.is_dir()), key=lambda p: p.stat().st_mtime)
HERE = Path(__file__).resolve().parent
CACHE = HERE / 'cache'
TEX = HERE / 'tex'
CACHE.mkdir(exist_ok=True)
TEX.mkdir(exist_ok=True)
R_EARTH = 6371e3
LAPSE = 5.8 / 1000  # K per m, as the world's model:earth/lapse-rate


# ---------------------------------------------------------------- helpers

def centers(W, H):
    lat = 90 - (np.arange(H) + 0.5) * 180 / H
    lon = -180 + (np.arange(W) + 0.5) * 360 / W
    return lat.astype(np.float32), lon.astype(np.float32)


def smooth(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0, 1)
    return t * t * (3 - 2 * t)


def mix(a, b, t):
    t = np.asarray(t)[..., None] if np.ndim(t) else t
    return a + (b - a) * t


def rgb(*c):
    return np.array(c, np.float32) / 255.0


def save_rgb(path, arr, quality=93):
    a = np.clip(arr * 255 + 0.5, 0, 255).astype(np.uint8)
    im = Image.fromarray(a, 'RGB')
    if str(path).endswith('.jpg'):
        im.save(path, quality=quality, subsampling=0)
    else:
        im.save(path, optimize=False, compress_level=3)
    print('wrote', path, a.shape)


def save_rgba(path, arr):
    a = np.clip(arr * 255 + 0.5, 0, 255).astype(np.uint8)
    Image.fromarray(a, 'RGBA').save(path, compress_level=3)
    print('wrote', path, a.shape)


def save_l(path, arr):
    a = np.clip(arr * 255 + 0.5, 0, 255).astype(np.uint8)
    Image.fromarray(a, 'L').save(path, compress_level=3)
    print('wrote', path, a.shape)


def resize_f(a, W, H, filt=Image.LANCZOS):
    return np.asarray(Image.fromarray(a.astype(np.float32), 'F').resize((W, H), filt), np.float32)


def fbm(W, H, seed, octaves=6, base=8, gain=0.5, lac=2.0):
    """Value-noise fBm on the equirectangular grid, wrapping in longitude; roughly −1…1."""
    rng = np.random.default_rng(seed)
    out = np.zeros((H, W), np.float32)
    amp, tot, f = 1.0, 0.0, float(base)
    for _ in range(octaves):
        gh = max(2, int(round(f)))
        gw = 2 * gh
        g = rng.standard_normal((gh, gw)).astype(np.float32)
        p = 3
        g = np.pad(g, ((p, p), (0, 0)), mode='reflect')
        g = np.concatenate([g[:, -p:], g, g[:, :p]], axis=1)
        zy, zx = H / gh, W / gw
        z = ndimage.zoom(g, (zy, zx), order=3, grid_mode=True, mode='grid-constant')
        y0, x0 = int(round(p * zy)), int(round(p * zx))
        out += amp * z[y0:y0 + H, x0:x0 + W]
        tot += amp
        amp *= gain
        f *= lac
    return out / tot * 1.6


def to_fine(field, lat_c, lon_c, W, H, order=3):
    """Resample a regular lat/lon field (lat descending from the north, lon ascending from −180) to (H, W)."""
    ny, nx = field.shape
    dlat = (lat_c[0] - lat_c[-1]) / (ny - 1)
    dlon = 360.0 / nx
    lat_f, lon_f = centers(W, H)
    rows = (lat_c[0] - lat_f) / dlat
    cols = (lon_f - lon_c[0]) / dlon
    pad = 4
    f = np.pad(field, ((pad, pad), (0, 0)), mode='edge')
    f = np.concatenate([f[:, -pad:], f, f[:, :pad]], axis=1)
    R, C = np.meshgrid(rows + pad, cols + pad, indexing='ij')
    return ndimage.map_coordinates(f, [R, C], order=order, mode='nearest').astype(np.float32)


def rasterize(polys, W, H, bbox=(-180.0, -90.0, 180.0, 90.0), width=0, fill=255, img=None):
    """Polygons as [[exterior, hole…], …] in lon/lat onto an L image (or lines when width > 0)."""
    x0, y0, x1, y1 = bbox
    if img is None:
        img = Image.new('L', (W, H), 0)
    d = ImageDraw.Draw(img)

    def px(ring):
        r = np.asarray(ring, np.float64)
        x = (r[:, 0] - x0) / (x1 - x0) * W
        y = (y1 - r[:, 1]) / (y1 - y0) * H
        return list(zip(x.tolist(), y.tolist()))

    for poly in polys:
        if width:
            for ring in poly:
                pts = px(ring)
                if len(pts) > 1:
                    d.line(pts, fill=fill, width=width, joint='curve')
        else:
            d.polygon(px(poly[0]), fill=fill)
            for hole in poly[1:]:
                d.polygon(px(hole), fill=0)
    return img


def geojson_polys(path):
    g = json.load(open(path))
    out = []
    for f in g['features']:
        geom = f['geometry']
        if geom['type'] == 'Polygon':
            out.append(geom['coordinates'])
        elif geom['type'] == 'MultiPolygon':
            out.extend(geom['coordinates'])
    return out


def enc_normal(elev, lat, scale, water=None):
    """East and north slopes of a height field (m) as two bytes, tanh-encoded: 0.5 + 0.5·tanh(slope·scale)."""
    H, W = elev.shape
    dlat = math.radians(180 / H) * R_EARTH
    dlon = math.radians(360 / W) * R_EARTH * np.cos(np.radians(lat))[:, None]
    e = np.concatenate([elev[:, -1:], elev, elev[:, :1]], axis=1)
    sx = (e[:, 2:] - e[:, :-2]) / (2 * np.maximum(dlon, 1e3))
    en = np.pad(elev, ((1, 1), (0, 0)), mode='edge')
    sy = (en[:-2] - en[2:]) / (2 * dlat)  # north is up: row −1 is north
    if water is not None:
        sx = np.where(water, 0, sx)
        sy = np.where(water, 0, sy)
    return 0.5 + 0.5 * np.tanh(sx * scale), 0.5 + 0.5 * np.tanh(sy * scale)


# ---------------------------------------------------------------- sources

def etopo(W=8192, H=4096):
    p = CACHE / f'etopo_{W}.npy'
    if p.exists():
        return np.load(p)
    import tifffile
    a = tifffile.imread(DS / 'etopo-2022-60s@9d27d4b8ea8e/ETOPO_2022_v1_60s_N90W180_surface.tif')
    a = resize_f(a, W, H)
    np.save(p, a)
    return a


LI = DS / 'li-2022-phanerozoic-climate@611d9c9a2d48/35396138'


def li2022(age_ma):
    """One of the 55 simulations of Li et al. (2022), north-up from −180°."""
    sim = int(round((540 - age_ma) / 10))
    f = netcdf_file(LI, 'r', mmap=False)
    lat = f.variables['lat'][:].copy()
    lon = f.variables['lon'][:].copy()
    k = int(np.searchsorted(lon, 180.0))

    def grab(name):
        v = np.array(f.variables[name][sim], dtype=np.float32)[..., ::-1, :]
        return np.concatenate([v[..., k:], v[..., :k]], axis=-1)

    out = dict(T=grab('T'), P=grab('P'), Z=grab('PHIS') / 9.80665, land=grab('LANDFRAC'),
               U=grab('U'), V=grab('V'), lat=lat[::-1].copy(), lon=np.concatenate([lon[k:] - 360, lon[:k]]))
    f.close()
    return out


def climate_reduce(T, P):
    """Twelve months of temperature (°C) and rain (mm) to what the Köppen rule needs (core/climate.ts)."""
    hot, cold, mean = T.max(0), T.min(0), T.mean(0)
    rain, driest = P.sum(0), P.min(0)
    tApr, pApr = T[3:9].mean(0), P[3:9].sum(0)
    northern = tApr >= (T.sum(0) - T[3:9].sum(0)) / 6
    summer = np.where(northern, pApr, rain - pApr)
    share = np.where(rain > 0, summer / np.maximum(rain, 1e-6), 0.5)
    add = np.where(share >= 0.7, 28, np.where(share <= 0.3, 0, 14))
    return dict(hot=hot, cold=cold, mean=mean, rain=rain, driest=driest, add=add.astype(np.float32))


def land_colour(hot, cold, mean, rain, add, driest, elev, noise, plants=True):
    """A true-colour reading of the climate classes, blended rather than stepped."""
    thr = 2 * mean + add
    arid = np.where(thr <= 0, 4.0, np.minimum(4.0, rain / (10 * np.maximum(thr, 1e-3))))
    arid = arid * np.exp(0.35 * noise[0])
    margin = np.maximum(driest - 60, driest - (100 - rain / 25)) + 25 * noise[1]
    cold = cold + 2.0 * noise[2]
    hot = hot + 1.5 * noise[2]

    forest_trop = rgb(30, 56, 24)
    savanna = rgb(118, 112, 62)
    temperate = rgb(50, 76, 34)
    mediterranean = rgb(96, 98, 60)
    boreal = rgb(34, 52, 38)
    tundra = rgb(104, 98, 80)
    steppe = rgb(160, 144, 98)
    desert_hot = rgb(214, 176, 124)
    desert_cold = rgb(170, 152, 124)
    ice = rgb(236, 241, 247)
    rock = rgb(118, 106, 96)
    bare = rgb(150, 112, 82)  # land with nothing growing on it

    tropical = smooth(15, 19, cold)
    wet = smooth(-25, 25, margin)
    coldW = smooth(3, -3, cold)
    summer_dry = smooth(1.6, 1.0, arid)
    veg = mix(temperate, mediterranean, summer_dry * (1 - coldW))
    veg = mix(veg, boreal, coldW)
    veg = mix(veg, mix(savanna, forest_trop, wet), tropical)
    desert = mix(desert_cold, desert_hot, smooth(8, 18, mean))
    dry = mix(steppe, desert, smooth(0.6, 0.38, arid))
    col = mix(veg, dry, smooth(1.15, 0.55, arid))
    if not plants:
        # bare ground: rust, ochre and grey rock, by a pattern like that of outcrops
        rust, ochre, grey = rgb(146, 88, 60), rgb(176, 134, 88), rgb(124, 118, 112)
        g1 = smooth(-0.6, 0.6, noise[0])
        g2 = smooth(-0.5, 0.7, noise[1])
        col = mix(mix(rust, ochre, g1), grey, g2 * 0.55)
        col = mix(col, desert, smooth(0.9, 0.4, arid) * 0.5)
    col = mix(col, rock, 0.65 * smooth(2600, 4800, elev))
    col = mix(col, tundra, smooth(12, 8, hot))
    col = mix(col, ice, smooth(2.0, -1.5, hot))
    col *= (1 + 0.06 * noise[3])[..., None]
    return col


def ocean_colour(depth, lat, warm, noise):
    deep = rgb(5, 17, 42)
    mid = rgb(10, 34, 70)
    shelf = rgb(22, 68, 96)
    reef = rgb(44, 120, 128)
    t = smooth(0, 4500, depth) ** 0.6
    col = mix(mix(shelf, mid, smooth(0, 1, t * 2)), deep, smooth(0.45, 1, t))
    col = mix(col, reef, smooth(80, 10, depth) * smooth(14, 24, warm) * 0.8)
    col *= (1 + 0.04 * noise)[..., None]
    return col


# ---------------------------------------------------------------- today

def water_now(W, H, elev):
    p = CACHE / f'water_{W}.npy'
    if p.exists():
        return np.load(p)
    ocean = np.asarray(rasterize(geojson_polys(DS / 'natural-earth-ocean-5.1.2@5b810162af4b/ne_50m_ocean.geojson'), W, H)) > 127
    lakes = np.asarray(rasterize(geojson_polys(DS / 'natural-earth-lakes-5.1.2@d350b75978b2/ne_50m_lakes.geojson'), W, H)) > 127
    near = ndimage.binary_dilation(ocean, iterations=3)
    core = ndimage.binary_erosion(ocean, iterations=3)
    water = (near & (elev < 0)) | core | lakes
    np.save(p, water)
    return water


def bake_now(W=8192, H=4096):
    elev = etopo(W, H)
    water = water_now(W, H, elev)
    lat, lon = centers(W, H)
    # Climate at 4k, downscaled onto ETOPO's relief by the lapse rate.
    w2, h2 = W // 2, H // 2
    c = li2022(0)
    red = climate_reduce(c['T'], c['P'])
    e2 = resize_f(elev, w2, h2, Image.BOX)
    z2 = to_fine(c['Z'], c['lat'], c['lon'], w2, h2)
    dz = (np.maximum(e2, 0) - np.maximum(z2, 0)) * LAPSE
    fine = {k: to_fine(v, c['lat'], c['lon'], w2, h2) for k, v in red.items()}
    n = [fbm(w2, h2, s, octaves=6, base=6) for s in (1, 2, 3, 4)]
    land = land_colour(fine['hot'] - dz, fine['cold'] - dz, fine['mean'] - dz, fine['rain'], fine['add'], fine['driest'], e2, n)
    sst = resize_f(fine['mean'], W, H, Image.BICUBIC)
    land_full = np.stack([resize_f(land[..., i], W, H, Image.BICUBIC) for i in range(3)], -1)
    # Ocean colour at full resolution from the depth, so the shelves stay sharp.
    ocean_full = ocean_colour(np.maximum(-elev, 0), None, sst, fbm(W, H, 9, 5, 12))
    albedo = np.where(water[..., None], ocean_full, land_full)
    save_rgb(TEX / 'now_albedo.jpg', albedo)
    nx, ny = enc_normal(np.where(water, 0, elev), lat, 6.0)
    hot_full = resize_f(fine['hot'] - dz, W, H, Image.BICUBIC)
    icy = smooth(1.0, -2.0, hot_full) * (~water)
    save_rgba(TEX / 'now_surface.png', np.stack([nx, ny, water.astype(np.float32), icy], -1))
    np.save(CACHE / 'now_hot.npy', hot_full)


def bake_lights(W=8192, H=4096, year='2015'):
    """People at night: HYDE's density, interpolated smoothly, scattered as settlements that cluster."""
    elev = etopo(W, H)
    water = water_now(W, H, elev)
    rng = np.random.default_rng(2015)
    csv = DS / 'hyde-3.2.1-population-grid@a23df5e6a9cb/hyde-3.2.1-population-1deg.csv'
    lines = [l for l in open(csv) if not l.startswith('#')]
    head = lines[0].strip().split(',')
    col = head.index(year)
    dens = np.zeros((180, 360), np.float32)
    for l in lines[1:]:
        p = l.rstrip('\n').split(',')
        if p[col]:
            dens[89 - int(p[0]), int(p[1]) + 180] = float(p[col]) / max(float(p[2]), 1.0)
    D = np.maximum(to_fine(dens, np.linspace(89.5, -89.5, 180).astype(np.float32), np.arange(-179.5, 180).astype(np.float32), W, H, order=1), 0)
    coast = ndimage.gaussian_filter(water.astype(np.float32), 4)
    slope = np.hypot(*np.gradient(elev))
    w = np.exp(-np.maximum(elev, 0) / 800) * (0.5 + 2.0 * coast * (1 - coast) * 4) / (1 + slope / 100)
    w *= np.exp(2.4 * fbm(W, H, 77, 7, 40))
    w /= w.mean()
    w[water] = 0
    pix_km2 = (40075 / W) ** 2 * np.cos(np.radians(centers(W, H)[0]))[:, None]
    lam = np.clip(D * pix_km2 / 25000 * w, 0, 4)
    n = rng.poisson(lam).astype(np.float32)
    b = n * rng.lognormal(0, 0.7, n.shape).astype(np.float32) * np.clip(D / 120, 0.1, 4) ** 0.6
    places = json.load(open(DS / 'natural-earth-places-5.1.2@8e70756b39fa/ne_50m_populated_places_simple.geojson'))
    big = np.zeros_like(b)
    for f in places['features']:
        pr = f['properties']
        x = int((pr['longitude'] + 180) / 360 * W) % W
        y = int(np.clip((90 - pr['latitude']) / 180 * H, 0, H - 1))
        big[y, x] += (pr['pop_max'] / 1e6) ** 0.7
    v = ndimage.gaussian_filter(b, 0.6) * 0.9 + ndimage.gaussian_filter(b, 2.2) * 1.2
    v += ndimage.gaussian_filter(big, 1.3) * 5 + ndimage.gaussian_filter(big, 4) * 4
    v = 1 - np.exp(-v * 0.8)
    v[water] *= 0.1
    save_l(TEX / 'now_lights.png', np.sqrt(np.clip(v, 0, 1)))


def bake_rome(year=120, bbox=(-14.0, 18.0, 52.0, 60.0), res=0.015):
    W = int(round((bbox[2] - bbox[0]) / res))
    H = int(round((bbox[3] - bbox[1]) / res))
    terr = json.load(open(BUILD / 'territory.json'))['territories']
    rows = []
    for t in terr:
        for c in t['claims']:
            if c['claim'].startswith('people/polities/rome'):
                rows += [r for r in c['rows'] if r['from'] <= year < r['to']]
    print('rome rows', [(r['name'], r['from'], r['to'], r['area']) for r in rows])
    polys = []
    for r in rows:
        for ring in r['rings']:
            pts = np.array(ring, np.float64).reshape(-1, 2) / 100
            polys.append([pts])
    fill = np.asarray(rasterize(polys, W, H, bbox), np.float32) / 255
    edge = np.asarray(rasterize(polys, W, H, bbox, width=3), np.float32) / 255
    roads = Image.new('L', (W, H), 0)
    n = 0
    for k in range(4):
        b = json.load(open(BUILD / f'layers/earth-roman-roads/{k}.json'))
        for r in b['rows']:
            if r['from'] <= year <= r['to']:
                for line in r['lines']:
                    pts = np.array(line, np.float64).reshape(-1, 2) / 100
                    rasterize([[pts]], W, H, bbox, width=2, img=roads)
                    n += 1
    print('roads', n)
    roads = np.asarray(roads, np.float32) / 255
    fill = ndimage.gaussian_filter(fill, 1.0)
    edge = ndimage.gaussian_filter(edge, 0.8)
    roads = ndimage.gaussian_filter(roads, 0.5)
    save_rgba(TEX / 'rome_overlay.png', np.stack([fill, edge, roads, np.ones_like(fill)], -1))
    json.dump({'bbox': bbox, 'size': [W, H]}, open(TEX / 'rome_overlay.json', 'w'))


# ---------------------------------------------------------------- deep time

def paleodem(age):
    import pyarrow.parquet as pq
    import pyarrow.compute as pc
    t = pq.read_table(DS / 'paleodem-v2@273da657c3ed/paleodem.parquet', filters=[('age_ma', '=', age)])
    lon = t.column('longitude').to_numpy()
    lat = t.column('latitude').to_numpy()
    e = t.column('elevation_m').to_numpy()
    grid = np.full((181, 361), np.nan, np.float32)
    grid[np.round(90 - lat).astype(int), np.round(lon + 180).astype(int)] = e
    grid = grid[:, :360]  # −180 … 179, rows 90 … −90
    bad = np.isnan(grid)
    if bad.any():  # a missing row or cell takes its nearest neighbour's value
        idx = ndimage.distance_transform_edt(bad, return_distances=False, return_indices=True)
        grid = grid[tuple(idx)]
    return grid


def bake_paleo(age, W=4096, H=2048, plants=True):
    g = paleodem(age)
    lat_c = np.linspace(90, -90, 181).astype(np.float32)
    lon_c = np.arange(-180, 180).astype(np.float32)
    g = ndimage.gaussian_filter(g, (0.8, 0.8), mode=('nearest', 'wrap'))
    elev = to_fine(g, lat_c, lon_c, W, H, order=3)
    lat, lon = centers(W, H)
    # Relief finer than the grid: generated, larger in the mountains. It roughens the coast without moving it far.
    d1 = fbm(W, H, 100 + age, 7, 10)
    rough = np.where(elev > 0, 120 + 0.35 * elev, 90 + 0.05 * np.minimum(-elev, 2000))
    elev_d = elev + d1 * rough
    # finer relief on land: ridges and valleys a grid of a degree cannot hold
    d2 = fbm(W, H, 300 + age, 6, 48)
    ridge = 1 - np.abs(fbm(W, H, 500 + age, 6, 24))
    elev_d = elev_d + np.where(elev_d > 0, d2 * (60 + 0.15 * elev_d) + ridge ** 3 * (80 + 0.4 * np.maximum(elev_d, 0)), 0)
    water = elev_d < 0
    c = li2022(age)
    red = climate_reduce(c['T'], c['P'])
    fine = {k: to_fine(v, c['lat'], c['lon'], W, H) for k, v in red.items()}
    z = to_fine(c['Z'], c['lat'], c['lon'], W, H)
    dz = (np.maximum(elev_d, 0) - np.maximum(z, 0)) * LAPSE
    n = [fbm(W, H, s + age, 6, 6) * 0.6 + fbm(W, H, s + 50 + age, 5, 40) * 0.4 for s in (11, 12, 13, 14)]
    land = land_colour(fine['hot'] - dz, fine['cold'] - dz, fine['mean'] - dz, fine['rain'], fine['add'], fine['driest'], elev_d, n, plants)
    oc = ocean_colour(np.maximum(-elev_d, 0), lat, fine['mean'], n[3])
    albedo = np.where(water[..., None], oc, land)
    save_rgb(TEX / f'p{age}_albedo.jpg', albedo)
    nx, ny = enc_normal(np.where(water, 0, elev_d), lat, 6.0)
    icy = smooth(1.0, -2.0, fine['hot'] - dz) * (~water)
    save_rgba(TEX / f'p{age}_surface.png', np.stack([nx, ny, water.astype(np.float32), icy], -1))



# ---------------------------------------------------------------- the model's layers, as maps

def hsv(h, s, v):
    import colorsys
    return np.array(colorsys.hsv_to_rgb(h % 1.0, s, v), np.float32)


def hillshade(elev, lat, az=315, alt=40, k=1.0):
    nx, ny = enc_normal(elev, lat, 1.0)
    sx = np.arctanh(np.clip(2 * nx - 1, -0.999, 0.999)) * k
    sy = np.arctanh(np.clip(2 * ny - 1, -0.999, 0.999)) * k
    a, e = math.radians(az), math.radians(alt)
    L = np.array([math.sin(a) * math.cos(e), math.cos(a) * math.cos(e), math.sin(e)])
    n = np.stack([-sx, -sy, np.ones_like(sx)], -1)
    n /= np.linalg.norm(n, axis=-1, keepdims=True)
    return np.clip(n @ L, 0, 1)


def coast(W, H):
    water = water_now(8192, 4096, etopo())
    w = resize_f(water.astype(np.float32), W, H, Image.BOX)
    g = np.hypot(*np.gradient(w))
    return np.clip(g * 3, 0, 1), w


def ramp(x, stops):
    xs = np.array([s[0] for s in stops], np.float32)
    cs = np.array([s[1] for s in stops], np.float32) / 255
    out = np.stack([np.interp(x, xs, cs[:, i]) for i in range(3)], -1)
    return out.astype(np.float32)


def bake_plates(W=4096, H=2048):
    polys = json.load(open(CACHE / 'plates_0.json'))
    ids = sorted(set(p['plate'] for p in polys))
    rng = np.random.default_rng(11)
    order = rng.permutation(len(ids))
    pal = {pid: hsv(0.50 + 0.30 * (order[i] / len(ids)), 0.38 + 0.25 * rng.random(), 0.42 + 0.35 * rng.random()) for i, pid in enumerate(ids)}
    idimg = Image.new('I', (W, H), 0)
    d = ImageDraw.Draw(idimg)
    for p in polys:
        r = np.asarray(p['ring'], np.float64)
        pts = list(zip(((r[:, 0] + 180) / 360 * W).tolist(), ((90 - r[:, 1]) / 180 * H).tolist()))
        if len(pts) > 2:
            d.polygon(pts, fill=int(p['plate']))
    pid = np.asarray(idimg, np.int32)
    lut = np.zeros((max(ids) + 1, 3), np.float32)
    for k, v in pal.items():
        lut[k] = v
    col = lut[pid]
    edge = np.zeros(pid.shape, bool)
    edge[:, 1:] |= pid[:, 1:] != pid[:, :-1]
    edge[1:, :] |= pid[1:, :] != pid[:-1, :]
    edge = ndimage.gaussian_filter(ndimage.binary_dilation(edge).astype(np.float32), 0.8)
    cst, water = coast(W, H)
    lat, _ = centers(W, H)
    e4 = resize_f(etopo(), W, H, Image.BOX)
    hs = hillshade(e4, lat, k=4)
    col = col * (0.75 + 0.35 * hs[..., None]) * (1 - 0.25 * water[..., None])
    col = mix(col, rgb(235, 245, 255), np.clip(edge * 1.4, 0, 1))
    col = mix(col, rgb(200, 225, 240), cst * 0.35)
    save_rgb(TEX / 'L_plates.jpg', col)


def bake_terrain(W=4096, H=2048):
    e = resize_f(etopo(), W, H, Image.BOX)
    lat, _ = centers(W, H)
    hs = hillshade(e, lat, k=6)
    sea = ramp(-e, [(0, (60, 130, 150)), (200, (36, 96, 128)), (2000, (22, 56, 96)), (5000, (12, 30, 62)), (9000, (6, 14, 34))])
    land = ramp(e, [(0, (112, 128, 92)), (400, (150, 152, 104)), (1200, (186, 164, 118)), (2500, (156, 120, 92)), (4500, (200, 190, 182)), (6000, (245, 245, 245))])
    _, water = coast(W, H)
    col = np.where(water[..., None] > 0.5, sea * (0.7 + 0.5 * hillshade(e, lat, k=14)[..., None]), land * (0.45 + 0.75 * hs[..., None]))
    save_rgb(TEX / 'L_terrain.jpg', col)


def lic(U, V, lat, L=28, seed=5):
    H, W = U.shape
    rng = np.random.default_rng(seed)
    noise = rng.random((H, W)).astype(np.float32)
    noise = ndimage.gaussian_filter(noise, 0.6)
    cl = np.maximum(np.cos(np.radians(lat)), 0.05)[:, None]
    du = U / cl
    dv = -V
    m = np.hypot(du, dv) + 1e-6
    du, dv = du / m, dv / m
    Y, X = np.mgrid[0:H, 0:W].astype(np.float32)
    acc = noise.copy()
    wsum = np.ones_like(noise)
    for sgn in (1, -1):
        x, y = X.copy(), Y.copy()
        for i in range(L):
            xi = np.mod(np.round(x).astype(np.int32), W)
            yi = np.clip(np.round(y).astype(np.int32), 0, H - 1)
            x += sgn * du[yi, xi] * 1.2
            y += sgn * dv[yi, xi] * 1.2
            xi = np.mod(np.round(x).astype(np.int32), W)
            yi = np.clip(np.round(y).astype(np.int32), 0, H - 1)
            w = 1 - i / L
            acc += noise[yi, xi] * w
            wsum += w
    out = acc / wsum
    out = (out - out.mean()) / (out.std() + 1e-6)
    return out


def bake_climate(W=4096, H=2048, age=0):
    c = li2022(age)
    T = c['T'].mean(0)
    U = c['U'].mean(0)
    V = c['V'].mean(0)
    Tf = to_fine(T, c['lat'], c['lon'], W, H)
    Uf = to_fine(U, c['lat'], c['lon'], W, H)
    Vf = to_fine(V, c['lat'], c['lon'], W, H)
    lat, _ = centers(W, H)
    li = lic(Uf, Vf, lat)
    speed = np.hypot(Uf, Vf)
    col = ramp(Tf, [(-45, (40, 30, 110)), (-25, (60, 90, 190)), (-8, (90, 170, 220)), (2, (200, 230, 235)), (12, (250, 215, 120)), (22, (240, 130, 60)), (30, (200, 50, 50)), (40, (120, 10, 40))])
    shade = 0.62 + 0.28 * np.clip(li, -2, 2) * smooth(0.3, 4.0, speed)
    col = col * shade[..., None]
    cst, _ = coast(W, H)
    col = mix(col, rgb(20, 20, 30), cst * 0.55)
    # isotherms every 10 °C
    iso = np.abs(((Tf + 100) % 10) - 5)
    gx = np.hypot(*np.gradient(Tf)) + 1e-4
    line = 1 - smooth(0.0, 1.2, (5 - iso) / gx)
    col = mix(col, rgb(255, 255, 255), line * 0.45)
    save_rgb(TEX / 'L_climate.jpg', col)


def bake_life(W=4096, H=2048):
    e8 = etopo()
    water = water_now(8192, 4096, e8)
    c = li2022(0)
    red = climate_reduce(c['T'], c['P'])
    fine = {k: to_fine(v, c['lat'], c['lon'], W, H) for k, v in red.items()}
    e = resize_f(e8, W, H, Image.BOX)
    z = to_fine(c['Z'], c['lat'], c['lon'], W, H)
    dz = (np.maximum(e, 0) - np.maximum(z, 0)) * LAPSE
    hot, cold, mean = fine['hot'] - dz, fine['cold'] - dz, fine['mean'] - dz
    thr = 2 * mean + fine['add']
    arid = np.where(thr <= 0, 4.0, np.minimum(4.0, fine['rain'] / (10 * np.maximum(thr, 1e-3))))
    margin = np.maximum(fine['driest'] - 60, fine['driest'] - (100 - fine['rain'] / 25))
    # the classes, in atlas colours
    cls = np.full(e.shape, 4, np.int8)  # temperate
    cls[cold <= 0] = 5
    trop = cold >= 18
    cls[trop & (margin >= 0)] = 0
    cls[trop & (margin < 0)] = 1
    cls[arid < 1] = 3
    cls[arid < 0.5] = 2
    cls[hot < 10] = 6
    cls[hot <= 0] = 7
    pal = np.array([(18, 110, 52), (130, 170, 60), (236, 200, 120), (214, 170, 90), (70, 160, 90), (40, 110, 110), (150, 160, 170), (240, 245, 250)], np.float32) / 255
    col = pal[cls]
    col = np.stack([ndimage.gaussian_filter(col[..., i], 1.2) for i in range(3)], -1)
    lat, _ = centers(W, H)
    hs = hillshade(e, lat, k=5)
    col = col * (0.7 + 0.4 * hs[..., None])
    _, w = coast(W, H)
    sea = rgb(14, 40, 56) * (0.8 + 0.3 * hillshade(e, lat, k=12)[..., None])
    col = np.where(w[..., None] > 0.5, sea, col)
    # every fossil site, as a point
    pts = np.zeros(e.shape, np.float32)
    for f in ('pbdb-land-2026-11-05@3369bbcac369/pbdb-land-2026-11-05.json', 'pbdb-sea-2026-11-06@3718d5c6b0c1/pbdb-sea-2026-11-06.json'):
        d = json.load(open(DS / f))
        s = np.array([[r[1], r[2]] for r in d['sites']], np.float64)
        x = np.mod(((s[:, 1] + 180) / 360 * W).astype(int), W)
        y = np.clip(((90 - s[:, 0]) / 180 * H).astype(int), 0, H - 1)
        np.add.at(pts, (y, x), 1)
    pts = 1 - np.exp(-(ndimage.gaussian_filter(pts, 0.7) * 2.2))
    glow = 1 - np.exp(-ndimage.gaussian_filter(pts, 3) * 3)
    col = mix(col, rgb(255, 250, 220), np.clip(pts * 1.2, 0, 1))
    col = col + rgb(255, 230, 160) * (glow * 0.18)[..., None]
    save_rgb(TEX / 'L_life.jpg', np.clip(col, 0, 1))


def bake_people(W=4096, H=2048, year=117, hyde='100'):
    rows = json.load(open(BUILD / 'polities.json'))['rows']
    sel = [r for r in rows if r['from'] <= year < r['to'] and not r['name'].startswith('(')]
    terr = json.load(open(BUILD / 'territory.json'))['territories']
    for t in terr:
        for c in t['claims']:
            sel += [dict(r, name='Rome') for r in c['rows'] if r['from'] <= year < r['to']]
    print('polities', len(sel))
    img = Image.new('RGB', (W, H), (0, 0, 0))
    d = ImageDraw.Draw(img)
    edges = Image.new('L', (W, H), 0)
    de = ImageDraw.Draw(edges)
    import hashlib
    for r in sorted(sel, key=lambda r: -r['area']):
        h = int(hashlib.sha1(r['name'].encode()).hexdigest()[:8], 16)
        hue = (h % 1000) / 1000
        c = hsv(hue, 0.55, 0.85) if r['name'] != 'Rome' else hsv(0.0, 0.7, 0.85)
        c = tuple(int(v * 255) for v in c)
        for ring in r['rings']:
            pts = np.array(ring, np.float64).reshape(-1, 2) / 100
            xy = list(zip(((pts[:, 0] + 180) / 360 * W).tolist(), ((90 - pts[:, 1]) / 180 * H).tolist()))
            if len(xy) > 2:
                d.polygon(xy, fill=c)
                de.line(xy + [xy[0]], fill=255, width=2)
    pol = np.asarray(img, np.float32) / 255
    has = pol.max(-1) > 0
    edge = ndimage.gaussian_filter(np.asarray(edges, np.float32) / 255, 0.7)
    # people, from HYDE at the step nearest the year
    csv = DS / 'hyde-3.2.1-population-grid@a23df5e6a9cb/hyde-3.2.1-population-1deg.csv'
    lines = [l for l in open(csv) if not l.startswith('#')]
    head = lines[0].strip().split(',')
    col_i = head.index(hyde)
    pop = np.zeros((180, 360), np.float32)
    for l in lines[1:]:
        p = l.rstrip('\n').split(',')
        if p[col_i]:
            pop[89 - int(p[0]), int(p[1]) + 180] = float(p[col_i]) / max(float(p[2]), 1)
    dens = to_fine(np.log10(pop + 0.01), np.linspace(89.5, -89.5, 180).astype(np.float32), np.arange(-179.5, 180).astype(np.float32), W, H, order=1)
    glow = smooth(-0.5, 2.0, dens)
    cst, water = coast(W, H)
    lat, _ = centers(W, H)
    e = resize_f(etopo(), W, H, Image.BOX)
    base = np.where(water[..., None] > 0.5, rgb(16, 18, 30), rgb(52, 50, 58) * (0.7 + 0.4 * hillshade(e, lat, k=5))[..., None])
    col = np.where(has[..., None], mix(base, pol, 0.55), base)
    col = col + rgb(255, 190, 110) * (glow ** 1.6 * 0.85)[..., None]
    col = mix(col, rgb(255, 255, 255), edge * 0.7)
    col = mix(col, rgb(150, 160, 190), cst * 0.4)
    save_rgb(TEX / 'L_people.jpg', np.clip(col, 0, 1))


if __name__ == '__main__':
    for step in sys.argv[1:]:
        name, _, arg = step.partition(':')
        if name == 'now':
            bake_now()
        elif name == 'lights':
            bake_lights()
        elif name == 'rome':
            bake_rome()
        elif name == 'paleo':
            bake_paleo(int(arg), plants=int(arg) < 400)
        elif name == 'plates':
            bake_plates()
        elif name == 'terrain':
            bake_terrain()
        elif name == 'climate':
            bake_climate()
        elif name == 'life':
            bake_life()
        elif name == 'people':
            bake_people()
        elif name == 'etopo':
            etopo()
        else:
            raise SystemExit(f'unknown step {step}')
