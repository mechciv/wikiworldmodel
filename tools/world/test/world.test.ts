// The real world validates, and its chronology behaves as the records say it should.
import { cpSync, mkdtempSync, renameSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { dayOnAxis, formatTime, formatTimeValue, toMa } from '../../../core/time.ts';
import { available, claimGroup, pointOf, resolveCycle, solveScenario } from '../src/chronology.ts';
import { WORLD } from '../src/paths.ts';
import { validateWorld } from '../src/validate/index.ts';
import { loadWorld } from '../src/world.ts';

const ma = (y: number) => Math.round(toMa(y) * 1000) / 1000;

describe('the world', async () => {
  const world = await loadWorld();
  const report = await validateWorld(world);

  it('validates, plate frames included', () => {
    expect(report.issues.filter((i) => i.level === 'error')).toEqual([]);
    expect(report.issues.filter((i) => i.level === 'warning')).toEqual([]);
  });

  it('has every record it refers to: the Mesosaurus taxon, once wanted, is written', () => {
    expect(report.wanted).toEqual([]);
    expect(world.entity.get('life/taxa/mesosaurus-tenuidens')?.kind).toBe('taxon');
  });

  it('marks every machine-made claim as proposed', () => {
    for (const e of world.entities) {
      for (const c of [...e.claims, ...e.relations]) if (c.author.startsWith('machine:')) expect(c.status).toBe('proposed');
    }
  });

  it('says so for every claim without a source', () => {
    const unsourced = world.entities.flatMap((e) => e.claims).filter((c) => !c.sources.length);
    expect(unsourced.length).toBeGreaterThan(0);
    for (const c of unsourced) expect(c.unsourced).toBeTruthy();
  });

  const sol = solveScenario(world);
  const best = solveScenario(world, {}, true);
  if (!sol.ok || !best.ok) throw new Error('the world has no solution');
  const at = (b: typeof sol.bounds, subject: string, edge: 'start' | 'end') => {
    const x = b.get(pointOf(world, subject, edge))!;
    return [ma(x.lo), ma(x.hi)];
  };

  it('derives the crater from the impact and the Himalaya from the collision', () => {
    expect(at(sol.bounds, 'earth/structures/chicxulub-crater', 'start')).toEqual(at(sol.bounds, 'earth/events/chicxulub-impact', 'start'));
    expect(at(best.bounds, 'earth/orogens/himalaya', 'start')[0]).toBeCloseTo(59, 6);
  });

  it('tiles the Deccan Traps\' lifetime with its phases', () => {
    expect(at(sol.bounds, 'earth/lips/deccan-traps', 'start')).toEqual([66.413, 66.413]);
    expect(at(sol.bounds, 'earth/lips/deccan-traps@after', 'start')).toEqual([65.422, 65.422]);
    expect(sol.bounds.get(pointOf(world, 'earth/lips/deccan-traps', 'end'))!.hi).toBe(Infinity);
  });

  it('dates the Mesosaurus records by the stage they cite, under either time scale', () => {
    expect(at(sol.bounds, 'life/mesosaurus/kabus', 'start')).toEqual([290.1, 283.5]);
    const pbdb = solveScenario(world, { alts: ['alt:time-scale/pbdb-2022'] });
    expect(pbdb.ok && at(pbdb.bounds, 'life/mesosaurus/kabus', 'start')).toEqual([290.1, 279.3]);
    expect(pbdb.ok && at(pbdb.bounds, 'ics/artinskian', 'end')).toEqual([279.3, 279.3]);
  });

  it('finds the 1992 Chicxulub date inconsistent with the rest of the world, and says why', () => {
    // Two picks, not the thousands solveVariants makes: those are tested in variants.test.ts.
    const picked = (pick: string) => ({ solution: solveScenario(world, { picks: [pick] }), centres: solveScenario(world, { picks: [pick] }, true) });
    const swisher = picked('earth/events/chicxulub-impact#date-swisher-1992');
    expect(swisher.solution.ok).toBe(false);
    if (swisher.solution.ok) return;
    // It is too young for the Deccan eruptions it falls within, and for the extinction it
    // caused at the base of the Danian; the solver names one minimal set of the clashing
    // constraints.
    const clash = swisher.solution.conflict.constraints.map((c) => c.source).sort();
    expect([
      ['earth/events/chicxulub-impact#date-swisher-1992', 'earth/events/chicxulub-impact#during-deccan', 'earth/lips/deccan-traps#main-end'],
      ['earth/events/chicxulub-impact#date-swisher-1992', 'earth/events/kpg-extinction#caused-by-chicxulub', 'earth/events/kpg-extinction#date-ics', 'ics/danian#ics-start'],
    ]).toContainEqual(clash);
    const yin = picked('earth/events/india-asia-collision#date-yin-harrison-2000');
    expect(yin.centres.ok && at(yin.centres.bounds, 'earth/orogens/himalaya', 'start')[0]).toBeCloseTo(70, 6);
  });

  describe('the conquest of Tenochtitlan, as both sides date it (docs/slices/FIFTEENTH-SLICE.md)', () => {
    const claim = (subject: string, key: string) => world.entity.get(subject)!.claims.find((c) => c.key === key)!;
    const named = (subject: string, key: string) => resolveCycle(world, claim(subject, key))!;
    const day = ([a, b]: [number, number]) => formatTimeValue({ kind: 'interval', lo: dayOnAxis(a).t, hi: dayOnAxis(b).t + dayOnAxis(b).whole });
    /** The day a point of a solution falls on, or the days its bounds run from and to. */
    const dayOf = (b: { lo: number; hi: number }) => {
      const [lo, hi] = [formatTime(b.lo, 1 / 365), formatTime(Math.max(b.lo, b.hi - 1e-6), 1 / 365)];
      return lo === hi ? lo : `${lo} to ${hi}`;
    };
    const on = (subject: string) => dayOf(sol.bounds.get(pointOf(world, subject, 'start'))!);

    it('holds the fall to the day both sides give it: 13 August 1521 and 1 Coatl in the year 3 Calli', () => {
      expect(named('people/conquest/fall-of-tenochtitlan', 'date-mexica').days.map(day)).toEqual(['13 August 1521 CE']);
      expect(on('people/conquest/fall-of-tenochtitlan')).toBe('13 August 1521 CE');
    });

    it('finds the native days for the entry off the Spanish one: Book 12 by nineteen days, the Anales de Tlatelolco by one', () => {
      expect(day(named('people/conquest/entry-into-tenochtitlan', 'date-book-12').nearest!)).toBe('20 October 1519 CE');
      expect(day(named('people/conquest/entry-into-tenochtitlan', 'date-anales-de-tlatelolco').nearest!)).toBe('9 November 1519 CE');
    });

    it('sides with the corrected year of the conquest of Tlatelolco: 7 Calli is 1473, not 1463', () => {
      const year = named('people/conquest/conquest-of-tlatelolco', 'date-mexica');
      expect(year.days.length).toBe(1);
      expect(Math.floor(dayOnAxis(year.days[0][0]).t)).toBe(1473);
      expect(solveScenario(world, { picks: ['people/conquest/conquest-of-tlatelolco#date-1463'] }).ok).toBe(false);
    });

    it('counts the killing at Toxcatl and the flight from the entry, in days, as Book 12 does', () => {
      expect(on('people/conquest/toxcatl-massacre')).toBe('21 May 1520 CE');
      const flight = solveScenario(world, { picks: ['people/conquest/noche-triste#date-book-12'] });
      expect(flight.ok && dayOf(flight.bounds.get('people/conquest/noche-triste|date')!)).toBe('30 June 1520 CE');
    });

    it('keeps a town taken into a city: Tlatelolco has no end, and is part of the city from 1473', () => {
      expect(sol.bounds.get(pointOf(world, 'people/cities/tlatelolco', 'end'))!.hi).toBe(Infinity);
      expect(world.entity.get('people/cities/tlatelolco')!.relations.find((r) => r.rel === 'part-of')!.to).toBe('people/cities/tenochtitlan');
      expect(world.entities.flatMap((e) => e.relations).filter((r) => r.rel === 'merged-into' && r.subject.startsWith('people/cities/'))).toEqual([]);
    });

    it('tells how Moctezuma died only in the picture of each side, and says who held each picture and when', () => {
      const g = claimGroup(world, 'people/conquest/death-of-moctezuma', 'account')!;
      expect(available(g, {})).toEqual([]);
      expect(available(g, { alts: ['alt:conquest-accounts/mexica'] }).map((c) => c.key)).toEqual(['account-mexica']);
      expect(available(g, { alts: ['alt:conquest-accounts/conquerors'] }).map((c) => c.key)).toEqual(['account-conquerors']);
      const holders = world.entities.flatMap((e) => e.relations).filter((r) => r.rel === 'holds').map((r) => `${r.subject} ${r.to}`).sort();
      expect(holders).toEqual([
        'people/persons/bernal-diaz-del-castillo alt:conquest-accounts/conquerors',
        'people/persons/hernan-cortes alt:conquest-accounts/conquerors',
        'people/polities/tlatelolco alt:conquest-accounts/mexica',
      ]);
    });
  });

  describe('ids carry no meaning', () => {
    const copy = mkdtempSync(join(tmpdir(), 'wikiworldmodel-'));
    afterAll(() => rmSync(copy, { recursive: true, force: true }));
    it('so moving a file changes nothing but where the layout says it goes', async () => {
      cpSync(WORLD, copy, { recursive: true });
      renameSync(join(copy, 'entities/earth/landforms/himalaya.yaml'), join(copy, 'entities/life/occurrences/somewhere-else.yaml'));
      const moved = await loadWorld(copy);
      const r = await validateWorld(moved, { frames: false });
      // The layout is advice to whoever writes the next record (world/schema/layout.yaml): the one thing a move changes.
      expect(r.issues.filter((i) => i.level !== 'info').map((i) => `${i.level} ${i.check} ${i.file}`)).toEqual(['warning layout entities/life/occurrences/somewhere-else.yaml']);
      const s = solveScenario(moved);
      expect(s.ok && s.bounds.get('earth/orogens/himalaya|start')).toEqual(sol.bounds.get('earth/orogens/himalaya|start'));
      // Nor the order the records come in, which settles which of two of a name search finds first.
      expect(moved.entities.map((e) => e.id)).toEqual(world.entities.map((e) => e.id));
    });
  });
});
