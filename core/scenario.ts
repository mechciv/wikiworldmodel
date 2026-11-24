// A scenario is a picture of the world: the default picture, plus at most one alternative
// from each group, plus competing claims picked over the default ones. The build and the
// viewer name scenarios the same way.

export interface Scenario {
  /** alternatives in the picture, at most one per group */
  alts?: string[];
  /** claims (entity#key) chosen over the default claim of their group */
  picks?: string[];
}

/** A canonical name for a scenario: its alternatives and picks, sorted. "" is the default. */
export function scenarioKey(s: Scenario): string {
  return [...(s.alts ?? []).slice().sort(), ...(s.picks ?? []).slice().sort()].join(' ');
}

/**
 * The value a scenario has, from values the build stored where they differ: the scenario
 * itself; else the first pick that changes it (combinations of picks are not precomputed);
 * else the picture without picks; else the default. Nor are combinations of alternatives: each
 * is asked in turn, as alternatives of different groups mostly concern different records.
 */
export function lookup<T>(variants: Record<string, T> | undefined, s: Scenario, fallback: T): T {
  if (!variants) return fallback;
  const exactKey = scenarioKey(s);
  if (Object.hasOwn(variants, exactKey)) return variants[exactKey];
  const alts = (s.alts ?? []).slice().sort();
  const pictures = alts.length > 1 ? alts.map((a) => [a]) : [alts];
  for (const p of (s.picks ?? []).slice().sort()) {
    for (const picture of pictures) {
      const k = scenarioKey({ alts: picture, picks: [p] });
      if (Object.hasOwn(variants, k)) return variants[k];
    }
  }
  for (const picture of pictures) {
    const k = scenarioKey({ alts: picture });
    if (Object.hasOwn(variants, k)) return variants[k];
  }
  return fallback;
}
