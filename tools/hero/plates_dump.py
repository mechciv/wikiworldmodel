# Present-day PALEOMAP plate polygons, dateline-wrapped, for bake.py's plates map.
# Run with the project's .venv (it has pygplates): .venv/bin/python tools/hero/plates_dump.py 0 tools/hero/cache/plates_0.json
import json, sys
from pathlib import Path
import pygplates
D = str(Path(__file__).resolve().parents[2] / '.cache/datasets/paleomap-plate-model@5a3805a5eaa0') + '/'
age = float(sys.argv[1]) if len(sys.argv) > 1 else 0.0
rot = pygplates.RotationModel(D + 'PALEOMAP_PlateModel.rot')
feats = pygplates.FeatureCollection(D + 'PALEOMAP_PlatePolygons.gpml')
recon = []
pygplates.reconstruct(feats, rot, recon, age)
wrapper = pygplates.DateLineWrapper()
out = []
for r in recon:
    f = r.get_feature()
    pid = f.get_reconstruction_plate_id()
    g = r.get_reconstructed_geometry()
    if not isinstance(g, pygplates.PolygonOnSphere):
        continue
    for w in wrapper.wrap(g):
        pts = [[p.get_longitude(), p.get_latitude()] for p in w.get_exterior_points()]
        out.append({'plate': pid, 'name': f.get_name(), 'ring': [[round(x, 4), round(y, 4)] for x, y in pts]})
json.dump(out, open(sys.argv[2], 'w'))
print(len(out), 'polygons', len(set(o['plate'] for o in out)), 'plates')
