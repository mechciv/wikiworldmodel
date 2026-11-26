import { describe, expect, it } from 'vitest';
import type { CityRecord } from './landscape.ts';
import { activeSiteClaims, settlementFocus, siteClaimHistory } from './site-navigation.ts';

describe('settlement navigation', () => {
  const city: CityRecord = { id: 'test/place', name: 'City', lat: 13, lon: 104, span: [800, 1400] };
  it('uses the dated centre, retaining the representative point in a point-only build', () => {
    const early = { lat: 13.34, lon: 103.97, span: [800, 889] as [number, number] };
    const late = { lat: 13.43, lon: 103.83, span: [889, 1400] as [number, number] };
    const dated = { ...city, cores: [early, late] };
    expect(settlementFocus(dated, 851, {}).cores).toEqual([early]);
    expect(settlementFocus(dated, 889, {}).cores).toEqual([late]);
    expect(settlementFocus(city, 851, {})).toMatchObject({ lat: city.lat, lon: city.lon, radius: 0 });
  });
  it('frames simultaneous cores across the dateline and respects chosen claims', () => {
    const span: [number, number] = [800, 1400];
    const places = [
      { lat: 10, lon: 179.9, span, ref: 'a' },
      { lat: 10, lon: -179.9, span, ref: 'b' },
    ];
    const focus = settlementFocus({ ...city, cores: places }, 1000, {});
    expect(Math.abs(focus.lon)).toBeCloseTo(180);
    expect(focus.radius).toBeLessThan(12000);
    expect(activeSiteClaims(places, 1000, { picks: ['a'] })).toEqual([places[0]]);
    expect(activeSiteClaims([...places, { ...places[0], alt: 'alt:other' }], 1000, { alts: ['alt:other'] })).toHaveLength(1);
  });
  it('preserves the earlier plan when a preferred or alternative centre applies for part of its life', () => {
    const core = { ref: 'a', span: [800, 1200] as [number, number] };
    const other = { ref: 'b', span: [900, 1000] as [number, number], alt: 'other' };
    expect(siteClaimHistory([core, other], {})).toEqual([core]);
    expect(siteClaimHistory([core, other], { alts: ['other'] })).toEqual([{ ...core, span: [800, 900] }, { ...core, span: [1000, 1200] }, other]);
  });
  it('uses only the dated settlement outline in the current picture', () => {
    const extent = {
      ref: 'outline',
      span: [889, 1000] as [number, number],
      polygons: [
        [
          [
            [104, 13],
            [104.1, 13],
            [104, 13.1],
            [104, 13],
          ],
        ],
      ],
    };
    const r = { ...city, extents: [extent] };
    expect(settlementFocus(r, 851, {}).extents).toHaveLength(0);
    expect(settlementFocus(r, 900, {}).extents[0].basis).toBe('evidence');
    expect(settlementFocus(r, 900, {}).radius).toBeGreaterThan(5000);
  });
});
