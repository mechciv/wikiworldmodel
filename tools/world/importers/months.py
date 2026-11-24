"""Read a climate model's months from a NetCDF-4 (HDF5) file into WikiWorldModel's import format, which the build reads
without a library for HDF5.

    python months.py <request.json>

The request names the file, the output directory, and the file's variables: `temperature` and `precipitation`, each of
dimensions (time, month, latitude, longitude), and `time`, `latitude` and `longitude`. For each time slice i, in the
file's order, it writes:

  land/<i>.u32   the cells with a value, as row * longitudes + column on the file's own grid
  t/<i>.i16      their twelve months of temperature, in tenths of a degree, month by month for each cell
  p/<i>.u16      their twelve months of precipitation, in tenths of a millimetre, the same way

and meta.json, with the grid's latitudes and longitudes, the times and their unit, and how many cells each slice has.
A cell has a value when all twelve months of both variables have one.

The request may also name other variables of the file to keep for the same cells, as `more`: for each, the name it is
kept under, the file's `variable`, whether it is given by `month` (time, month, latitude, longitude) or by `year` (time,
latitude, longitude), and the `scale` its values are multiplied by before they are rounded to whole numbers:

  <name>/<i>.u16   twelve values for each cell, or one, as uint16

meta.json then says of each what the file calls it (its unit, its long name and its other attributes, as a legend of a
variable of classes is), its least and greatest value, and whether every value was whole once scaled. A cell that has
its months and lacks one of these stops the import: nothing is filled in.

Nothing is regridded, averaged or corrected: the build reads the values themselves.
"""
import json
import os
import sys

import h5py
import numpy as np

# Attributes of a variable that are the file's own bookkeeping, not what it says of the variable.
BOOKKEEPING = ('DIMENSION_LIST', 'REFERENCE_LIST', 'CLASS', 'NAME', '_Netcdf4Dimid', '_Netcdf4Coordinates', '_FillValue')


def text(v):
    return v.decode() if isinstance(v, bytes) else str(v)


def attributes(ds):
    """What the file says of a variable, as text: its unit, its long name, the names of its classes."""
    out = {}
    for k, v in ds.attrs.items():
        if k in BOOKKEEPING:
            continue
        if isinstance(v, (bytes, str)):
            out[k] = text(v)
        elif isinstance(v, np.ndarray) and v.size == 1 and v.dtype.kind in 'SOU':
            out[k] = text(v.reshape(-1)[0])
    return out


def fill_values(ds):
    """Finite sentinel values declared by _FillValue or missing_value attributes."""
    vals = []
    for attr in ('_FillValue', 'missing_value'):
        if attr not in ds.attrs:
            continue
        raw = ds.attrs[attr]
        arr = np.atleast_1d(raw)
        for v in arr:
            try:
                fv = float(v)
                if np.isfinite(fv):
                    vals.append(fv)
            except (TypeError, ValueError):
                pass
    return vals


def valid_mask(arr, fills):
    ok = np.isfinite(arr)
    for fv in fills:
        ok &= arr != fv
    return ok


def main(req):
    out = req['out']
    more = req.get('more') or {}
    for name, m in more.items():
        if name in ('land', 't', 'p') or not name.replace('_', '').isalnum():
            raise ValueError(f'"{name}" is not a name a variable can be kept under')
        if m.get('per') not in ('month', 'year'):
            raise ValueError(f'{name}: per is "month" or "year"')
    for d in ('land', 't', 'p', *more):
        os.makedirs(os.path.join(out, d), exist_ok=True)
    with h5py.File(req['file'], 'r') as f:
        temp = f[req['temperature']]
        prec = f[req['precipitation']]
        times = f[req['time']][:]
        lat = f[req['latitude']][:]
        lon = f[req['longitude']][:]
        n, months, nlat, nlon = temp.shape
        if prec.shape != temp.shape or months != 12 or (nlat, nlon) != (len(lat), len(lon)) or n != len(times):
            raise ValueError(f'unexpected shapes: temperature {temp.shape}, precipitation {prec.shape}')
        t_fills = fill_values(temp)
        p_fills = fill_values(prec)
        units = {'temperature': text(temp.attrs.get('units', '')), 'precipitation': text(prec.attrs.get('units', '')), 'time': text(f[req['time']].attrs.get('units', ''))}
        others = {}
        for name, m in more.items():
            ds = f[m['variable']]
            want = temp.shape if m['per'] == 'month' else (n, nlat, nlon)
            if ds.shape != want:
                raise ValueError(f'{name}: {m["variable"]} has the shape {ds.shape}, not {want}')
            others[name] = {
                'ds': ds,
                'fills': fill_values(ds),
                'scale': float(m.get('scale', 1)),
                'per': m['per'],
                'signed': bool(m.get('signed', False)),
                'min': None,
                'max': None,
                'whole': True,
            }
        slices = []
        # Read as the file is chunked, several slices at a time.
        block = (temp.chunks or (1,))[0]
        for start in range(0, n, block):
            t_block = temp[start:start + block]
            p_block = prec[start:start + block]
            o_block = {name: o['ds'][start:start + block] for name, o in others.items()}
            for k in range(t_block.shape[0]):
                i = start + k
                t = t_block[k].reshape(12, -1)
                p = p_block[k].reshape(12, -1)
                ok = np.all(valid_mask(t, t_fills), axis=0) & np.all(valid_mask(p, p_fills), axis=0)
                cells = np.nonzero(ok)[0].astype('<u4')
                tt = np.rint(t[:, cells].T * 10)
                pp = np.rint(np.maximum(p[:, cells].T, 0) * 10)
                if tt.size and (tt.min() < -32768 or tt.max() > 32767 or pp.max() > 65535):
                    raise ValueError(f'slice {i}: a value does not fit its integer')
                cells.tofile(os.path.join(out, 'land', f'{i}.u32'))
                tt.astype('<i2').tofile(os.path.join(out, 't', f'{i}.i16'))
                pp.astype('<u2').tofile(os.path.join(out, 'p', f'{i}.u16'))
                for name, o in others.items():
                    # Month by month for each cell, as the temperature is; or the year's one value.
                    v = o_block[name][k].reshape(12, -1)[:, cells].T if o['per'] == 'month' else o_block[name][k].reshape(-1)[cells]
                    v = v.astype('<f8')
                    if v.size and not np.all(valid_mask(v, o['fills'])):
                        raise ValueError(f'slice {i}: a cell with its months has no {name}')
                    scaled = v * o['scale']
                    vv = np.rint(scaled)
                    lo_bound, hi_bound = (-32768, 32767) if o['signed'] else (0, 65535)
                    if vv.size and (vv.min() < lo_bound or vv.max() > hi_bound):
                        raise ValueError(f'slice {i}: a value of {name} does not fit its integer')
                    if v.size:
                        o['min'] = float(v.min()) if o['min'] is None else min(o['min'], float(v.min()))
                        o['max'] = float(v.max()) if o['max'] is None else max(o['max'], float(v.max()))
                        o['whole'] = o['whole'] and bool(np.all(np.abs(scaled - vv) < 1e-6))
                    if o['signed']:
                        vv.astype('<i2').tofile(os.path.join(out, name, f'{i}.i16'))
                    else:
                        vv.astype('<u2').tofile(os.path.join(out, name, f'{i}.u16'))
                slices.append({'index': i, 'time': int(times[i]), 'cells': int(cells.size),
                               'min_t': round(float(tt.min()) / 10, 1) if tt.size else None,
                               'max_t': round(float(tt.max()) / 10, 1) if tt.size else None,
                               'max_p': round(float(pp.max()) / 10, 1) if pp.size else None})
                print(f'  slice {i:3d} ({int(times[i])} {units["time"]}): {cells.size} cells', flush=True)
        doc = {
            'format': 'lightworld-months-import@1',
            'grid': {'latitudes': [float(x) for x in lat], 'longitudes': [float(x) for x in lon], 'order': 'row-major, latitude by latitude as the file has them'},
            'arrays': {'land': 'uint32 little-endian cell, land/<i>.u32', 't': 'int16 little-endian tenths of the unit, 12 per cell, t/<i>.i16', 'p': 'uint16 little-endian tenths of the unit, 12 per cell, p/<i>.u16'},
            'units': units,
            'h5py': h5py.__version__,
            'slices': slices,
        }
        if others:
            doc['format'] = 'lightworld-months-import@2'
            doc['arrays']['more'] = 'uint16 (or int16 if signed) little-endian, the value times its scale, 12 per cell by month or 1 by year, <name>/<i>.{u16,i16}'
            doc['more'] = {
                name: {
                    'variable': more[name]['variable'],
                    'per': o['per'],
                    'scale': o['scale'],
                    **({'signed': True} if o['signed'] else {}),
                    'min': o['min'],
                    'max': o['max'],
                    'whole': o['whole'],
                    'attributes': attributes(o['ds']),
                }
                for name, o in others.items()
            }
    with open(os.path.join(out, 'meta.json'), 'w') as fh:
        json.dump(doc, fh, indent=1, sort_keys=True)
        fh.write('\n')


if __name__ == '__main__':
    with open(sys.argv[1]) as fh:
        main(json.load(fh))
