// INFORMATION DENSITY: how much a map's objects have been written about (owner, 2026-09-05).
//
// "If people have taken the time and effort to write descriptions for all their objects" - a
// score from 0 to 5, so the effort shows, and so the ones who have not are nudged. It is a
// FACTOR OF COVERAGE AND LENGTH: every object that matters carries a weight, its description a
// quality from 0 (none) to 1 (a solid paragraph), and the map's raw score is the weighted mean.
// Small objects are ignored, moons count half, rings and belts less, everything else counts in
// full. The public `description` only: GM notes are withheld from players and stripped on a
// player export, so they are not information the map gives anyone.
//
// The RAW score (0..1) is stored. The LEVEL people see (0..5) is relative to the best map on the
// hub - "5 being the best we have" - so the scale moves as the library improves (D-30).
import { nodesWithSystem } from './attribution';
import { displayRole, SMALL_OBJECT } from './roles';

/** A solid paragraph. Longer earns nothing more: the score is about coverage, not novels. */
export const FULL_DESCRIPTION = 280;
/** Shorter than this is a placeholder ("TODO", "-"), not a description. */
export const MIN_DESCRIPTION = 12;

/** How much each kind of object counts. Absent means 1: an unknown role carries honest weight. */
export const WEIGHTS: Record<string, number> = {
  moon: 0.5,
  ring: 0.25,
  belt: 0.5,
  [SMALL_OBJECT]: 0,
  barycenter: 0,
  barycentre: 0
};

export interface Density {
  /** The weighted mean quality, 0..1, to three places. */
  raw: number;
  /** Objects that carry weight, and how many of those have a description at all. */
  total: number;
  described: number;
  /** Mean length of the descriptions that exist, in characters. 0 when none. */
  avgLength: number;
}

const weightOf = (node: any): number => {
  const kind = String(node?.kind ?? '');
  if (kind !== 'body' && kind !== 'construct') return 0;
  const role = (displayRole(node) ?? '').toLowerCase();
  return role in WEIGHTS ? WEIGHTS[role] : 1;
};

/** 0 for nothing or a placeholder, 1 for a paragraph, linear between. */
export const descriptionQuality = (text: unknown): number => {
  const len = typeof text === 'string' ? text.trim().length : 0;
  return len < MIN_DESCRIPTION ? 0 : Math.min(1, len / FULL_DESCRIPTION);
};

export function informationDensity(doc: any): Density {
  let sumW = 0, sumWQ = 0, total = 0, described = 0, lengths = 0;
  for (const { node } of nodesWithSystem(doc)) {
    const w = weightOf(node);
    if (w <= 0) continue;
    total++;
    const text = typeof node?.description === 'string' ? node.description.trim() : '';
    const q = descriptionQuality(text);
    if (q > 0) { described++; lengths += text.length; }
    sumW += w;
    sumWQ += w * q;
  }
  return {
    raw: sumW > 0 ? Math.round((sumWQ / sumW) * 1000) / 1000 : 0,
    total,
    described,
    avgLength: described ? Math.round(lengths / described) : 0
  };
}

/**
 * The level shown: 0 when nothing is described; otherwise 1..5 relative to the best raw score on
 * the hub, so the best map is a 5 and a map at a fifth of it is a 1. With no best known (an
 * empty library, or a database that has not run 0023) the scale is absolute.
 */
export function densityLevel(raw: number | null | undefined, best: number | null | undefined): number {
  if (!raw || raw <= 0) return 0;
  const scale = best && best > 0 ? Math.max(best, raw) : 1;
  return Math.max(1, Math.min(5, Math.ceil((5 * raw) / scale - 1e-9)));
}

/** The words behind the icon, for a tooltip or a sentence. */
export function densitySummary(level: number, d: Density | null | undefined): string {
  if (!d || !d.total) return 'Information: nothing here to describe.';
  if (!d.described) return 'Information 0 of 5: none of its ' + d.total + ' objects is described.';
  return 'Information ' + level + ' of 5: ' + d.described + ' of ' + d.total + ' objects described, about '
    + d.avgLength + ' characters each.';
}

/** Read the stored detail back into a Density, whatever the column holds. */
export function densityFrom(raw: unknown, detail: unknown): Density | null {
  if (typeof raw !== 'number') return null;
  const d = (detail ?? {}) as Partial<Density>;
  return {
    raw,
    total: typeof d.total === 'number' ? d.total : 0,
    described: typeof d.described === 'number' ? d.described : 0,
    avgLength: typeof d.avgLength === 'number' ? d.avgLength : 0
  };
}
