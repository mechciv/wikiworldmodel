// Where to label and frame a settlement in the displayed historical picture.
import { fromLocal, toLocal } from './city.ts';
import type { CityRecord, SiteClaim } from './landscape.ts';
import type { Scenario } from './scenario.ts';

export function activeSiteClaims<T extends SiteClaim>(claims: T[] | undefined, t: number, scenario: Scenario): T[] {
  const live = claims?.filter((c) => c.span[0] <= t && t < c.span[1]) ?? [];
  const alternative = live.filter((c) => c.alt && scenario.alts?.includes(c.alt));
  const candidates = alternative.length ? alternative : live.filter((c) => !c.alt);
  const picked = candidates.filter((c) => c.ref && scenario.picks?.includes(c.ref));
  const preferred = candidates.filter((c) => c.rank === 'preferred');
  return picked.length ? picked : preferred.length ? preferred : candidates.filter((c) => c.rank !== 'deprecated');
}

/** A town plan spans its entire life. Preserve earlier centres when choosing claims for a later epoch. */
export function siteClaimHistory<T extends SiteClaim>(claims: T[], scenario: Scenario): T[] {
  const edges = [...new Set(claims.flatMap((c) => c.span))].sort((a, b) => a - b);
  const spans = new Map<T, [number, number][]>();
  for (let i = 0; i + 1 < edges.length; i++) {
    for (const claim of activeSiteClaims(claims, edges[i], scenario)) {
      const runs = spans.get(claim) ?? [];
      const previous = runs.at(-1);
      if (previous && previous[1] === edges[i]) previous[1] = edges[i + 1];
      else runs.push([edges[i], edges[i + 1]]);
      spans.set(claim, runs);
    }
  }
  return claims.flatMap((claim) => (spans.get(claim) ?? []).map((span) => ({ ...claim, span })));
}

export function settlementFocus(record: CityRecord, t: number, scenario: Scenario) {
  const cores = activeSiteClaims(record.cores, t, scenario);
  const extents = activeSiteClaims(record.extents, t, scenario);
  const origin = cores[0] ?? record;
  const points = cores.map((c) => toLocal(origin, c.lat, c.lon));
  for (const extent of extents)
    for (const polygon of extent.polygons) {
      for (const [lon, lat] of polygon[0]) points.push(toLocal(origin, lat, lon));
    }
  let west = 0,
    east = 0,
    north = 0,
    south = 0;
  for (const [x, y] of points) {
    west = Math.min(west, x);
    east = Math.max(east, x);
    south = Math.min(south, y);
    north = Math.max(north, y);
  }
  const [lat, lon] = fromLocal(origin, (west + east) / 2, (south + north) / 2);
  return { lat, lon, radius: Math.hypot(east - west, north - south) / 2, cores, extents };
}
