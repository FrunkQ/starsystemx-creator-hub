// Flat, Lucide-style icons for what a node IS - one path each, 24-unit box, stroked.
//
// Inline SVG rather than an icon font or an image sprite, because the page's rule is to be fast at
// LOADING (src/app.css): these are a few hundred bytes of path data, painted with the text, and
// they inherit `currentColor` so they follow the theme for free.
//
// Keyed by `roleHint` (the human axis - see bundle/facets.ts), with `kind` as the fallback for the
// one thing that has no role: a barycentre.
export interface RoleIcon {
  d: string;
  /** A dash pattern, for the one icon that is a ring of debris rather than a solid thing. */
  dash?: string;
  /** What it is, for a title attribute and a screen reader. */
  label: string;
}

const ICONS: Record<string, RoleIcon> = {
  // A sun: a disc and eight rays.
  star: {
    label: 'star',
    d: 'M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4l1.4-1.4M17 7l1.4-1.4M16 12a4 4 0 1 1-8 0a4 4 0 0 1 8 0'
  },
  // A disc with a tilted ring across it.
  planet: {
    label: 'planet',
    d: 'M17.5 12a5.5 5.5 0 1 1-11 0a5.5 5.5 0 0 1 11 0M3.2 9.4c-1.4 1.6 1.6 4.4 7.2 6.4s10.4 1.9 11.2-.2c.5-1.2-1-2.6-3.6-3.8M3.2 9.4c.7-.9 2.2-1.2 4.2-1.1'
  },
  moon: { label: 'moon', d: 'M12 3a6 6 0 0 0 9 9a9 9 0 1 1-9-9Z' },
  // Debris in an arc: the dash IS the drawing.
  belt: { label: 'belt', d: 'M3 15a9 9 0 0 1 18 0', dash: '0.1 3.2' },
  ring: { label: 'ring', d: 'M21 12a9 3.5 0 1 1-18 0a9 3.5 0 0 1 18 0M12 12h.01' },
  // Two masses about a common point.
  barycenter: {
    label: 'barycentre',
    d: 'M8 12a3 3 0 1 1-6 0a3 3 0 0 1 6 0M22 12a3 3 0 1 1-6 0a3 3 0 0 1 6 0M8 12h8M12 10.5v3'
  },
  // A hexagonal hull with a core.
  station: { label: 'station', d: 'M12 2l8.7 5v10L12 22l-8.7-5V7L12 2ZM9 9h6v6H9Z' },
  ship: {
    label: 'ship',
    d: 'M4.5 16.5c-1.5 1.3-2 5-2 5s3.7-.5 5-2c.7-.8.7-2 0-2.8c-.8-.7-2-.7-2.8 0zM12 15l-3-3a22 22 0 0 1 2-3.9A12.7 12.7 0 0 1 22 2c0 2.7-.9 7.4-6 11a22 22 0 0 1-4 2zM9 12H4s.6-3.3 2-4.5c1.6-1.3 5 0 5 0M12 15v5s3.3-.6 4.5-2c1.3-1.6 0-5 0-5'
  },
  habitat: { label: 'habitat', d: 'M12 2l8.7 5v10L12 22l-8.7-5V7L12 2ZM9 9h6v6H9Z' },
  infrastructure: { label: 'infrastructure', d: 'M21 8l-9-5-9 5v8l9 5 9-5V8ZM3 8l9 5 9-5M12 13v9' },
  construct: { label: 'construct', d: 'M21 8l-9-5-9 5v8l9 5 9-5V8ZM3 8l9 5 9-5M12 13v9' }
};

const UNKNOWN: RoleIcon = { label: 'object', d: 'M19 12a7 7 0 1 1-14 0a7 7 0 0 1 14 0' };

export function iconFor(roleHint: string | null | undefined, kind?: string | null): RoleIcon {
  const role = String(roleHint ?? '').toLowerCase();
  if (role && ICONS[role]) return ICONS[role];
  const k = String(kind ?? '').toLowerCase();
  if (k && ICONS[k]) return ICONS[k];
  return UNKNOWN;
}

/**
 * The order roles are LISTED in, on a row summary and on the page (owner, 2026-09-04): planets,
 * moons, rings, belts, then the built things, then the rest. Not by count - a fixed order is what
 * lets the eye find "moons" in the same place on every row.
 */
export const ROLE_ORDER = [
  'planet', 'moon', 'ring', 'belt',
  'megastructure', 'construct', 'habitat', 'infrastructure', 'station', 'ship',
  'star', 'barycenter'
];

/** Non-zero counts in ROLE_ORDER, unknown roles after them alphabetically. */
export function orderRoles(counts: Record<string, number>): [string, number][] {
  const rank = (role: string) => { const i = ROLE_ORDER.indexOf(role); return i === -1 ? ROLE_ORDER.length : i; };
  return Object.entries(counts)
    .filter(([, n]) => n > 0)
    .sort((a, b) => rank(a[0]) - rank(b[0]) || a[0].localeCompare(b[0]));
}

// The two actions on every row. Kept here so the tree has one source of icon data.
export const COPY_ICON = 'M8 4h9a2 2 0 0 1 2 2v9M6 8h9a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-9a2 2 0 0 1 2-2Z';
export const TICK_ICON = 'M5 12.5l4.5 4.5L19 7.5';
export const CODE_ICON = 'M8 7l-5 5 5 5M16 7l5 5-5 5';
