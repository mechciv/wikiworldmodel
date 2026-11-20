// What a scene of the atlas says of its own evidence, in the same words in the bar, on the screen and in the panel: which
// of its stage's list stands at the time shown, how near the record of it is, and, at a time read as a year, that the
// list is the stage's and not the year's.
import { lookup, type Scenario } from '../../../core/scenario.ts';
import { standsAt, type LivingTaxon, type SceneSpec } from '../../../core/scene.ts';
import { formatTime, historical, PRESENT_YEAR } from '../../../core/time.ts';

/** The taxa of a scene that stand at a time: what its renderer draws then, of its list. */
export function standingAt(spec: SceneSpec, t: number, s: Scenario): LivingTaxon[] {
  return spec.taxa.filter((x) => standsAt(lookup(x.variants, s, x.time), t));
}

/** The bar's words: how many of what stands here are recorded here, nearby, or stand in. */
export function barWords(taxa: LivingTaxon[], sea: boolean): string {
  const n = (tier: string) => taxa.filter((x) => x.tier === tier).length;
  // In the sea as on land; where none of what lived in a sea can be drawn yet, it says so.
  const formation = n('formation');
  if (formation) return `${formation} recorded in this formation`;
  if (taxa.length) return `${n('here')} recorded here, ${n('region')} nearby, ${n('standin')} stand-ins`;
  return sea ? 'Nothing of the sea’s life can be drawn here yet' : 'Nothing recorded here';
}

/**
 * Where the record near a place is thin, a sentence that says so: fewer than half of what stands here recorded within a few
 * hundred km, none, or nothing within reach at all. Empty where most of it is recorded close by, and for a formation, whose
 * own fossils are the scene's.
 */
export function thinWords(taxa: LivingTaxon[], stage: string): string {
  const n = (tier: string) => taxa.filter((x) => x.tier === tier).length;
  const here = n('here');
  if (n('formation') || here * 2 >= taxa.length) return taxa.length ? '' : `Nothing of the ${stage} is recorded within reach of here, and nothing is drawn.`;
  if (!here && !n('region')) return 'None of its taxa is recorded within reach of here: all of them stand in for what may have lived here, and are no claim that it did.';
  const rest = `inferred from fossils of the region${n('standin') ? ', or stand in where nothing of a kind is near' : ''}`;
  if (!here) return `None of its taxa is recorded within a few hundred km of here: all of them are ${rest}.`;
  return `Only ${here} of its ${taxa.length} taxa ${here === 1 ? 'is' : 'are'} recorded within a few hundred km of here: the rest are ${rest}.`;
}

/** What a stage's list is of, in a sentence: the fossils of the stage, from its start to its end. */
export function stageWords(spec: SceneSpec): string {
  const [from, to] = spec.site.span;
  const end = to >= PRESENT_YEAR ? 'the present' : formatTime(to);
  return `What lives in this scene is listed from fossils of the ${spec.site.stage ?? 'stage'}, ${formatTime(from)} to ${end}`;
}

/**
 * What the screen says of a scene of the atlas at a time read as a year: that the list is its stage's, not the year's, and
 * how thin the record near the place is. Empty at a time of the deep past, where the stage is how time is read, and for a
 * formation's scene, which says what it is in its own panel.
 */
export function noticeWords(spec: SceneSpec, taxa: LivingTaxon[], t: number): string {
  if (spec.site.place || !historical(t)) return '';
  const thin = thinWords(taxa, spec.site.stage ?? 'stage');
  return `${stageWords(spec)}: the list is the stage’s, not ${formatTime(t)}’s.${thin ? ` ${thin}` : ''}`;
}
