"""Print what a NetCDF-4 (HDF5) file holds at a few cells of its grid, as JSON: for the build's tests, which hold the
build's tiles to the file itself and cannot read HDF5.

    python months_at.py <request.json>

The request names the file, its `latitude` and `longitude` variables, a `time` index, the `cells` as [latitude,
longitude] of their centres, and the `variables` to read, each of dimensions (time, month, latitude, longitude) or
(time, latitude, longitude). For each variable it prints its values at each cell, twelve for one by month and one for
one by year, with null where the file has none; and the centres of the cells it found, which must be the ones asked for.
Nothing is averaged or rounded.
"""
import json
import sys

import h5py
import numpy as np


def main(req):
    with h5py.File(req['file'], 'r') as f:
        lat = f[req['latitude']][:]
        lon = f[req['longitude']][:]
        at = [(int(np.argmin(np.abs(lat - la))), int(np.argmin(np.abs(lon - lo)))) for la, lo in req['cells']]
        out = {'cells': [[float(lat[j]), float(lon[i])] for j, i in at], 'values': {}}
        for name in req['variables']:
            ds = f[name]
            rows = []
            for j, i in at:
                v = np.asarray(ds[req['time'], :, j, i] if ds.ndim == 4 else ds[req['time'], j, i], dtype='f8').reshape(-1)
                rows.append([float(x) if np.isfinite(x) else None for x in v])
            out['values'][name] = rows
    json.dump(out, sys.stdout)


if __name__ == '__main__':
    with open(sys.argv[1]) as fh:
        main(json.load(fh))
