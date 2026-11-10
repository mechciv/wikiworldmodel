// A sample module: the shape every props-*.js file takes.
import { THREE, mat, glow, mesh, at, group, cone, cyl, ball, lathe, C, range } from './kit.js';

function volcano(rng) {
  const g = group();
  g.add(lathe([[0.62, 0], [0.5, 0.25], [0.3, 0.6], [0.16, 0.74], [0.12, 0.72]], mat(C.basalt, { flat: true }), 11));
  g.add(at(cyl(0.12, 0.12, 0.02, glow(C.lava, 3)), 0, 0.73, 0));
  return g;
}
function field(rng) {
  const g = group();
  g.add(at(mesh(new THREE.BoxGeometry(1, 0.02, 0.6), mat(0xd8b84a)), 0, 0.01, 0));
  return g;
}
export const flat = ['field'];
export default { volcano, field };
