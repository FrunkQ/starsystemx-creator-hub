// THE GENERATED COVER: a card drawn from the map itself.
//
// ============================================================================================
// WHY. Most saves arrive with no cover - the Local Neighbourhood starmap has sixty node images and
// not one of them is carried in the bundle (C-06). A page with no picture is a link that previews
// with no picture, and for a hub whose product is link-sharing that is the most expensive small
// failure available (D-18). So when the creator chose nothing and the guess finds nothing, the hub
// draws one - and since 0.8.0 the creator can also DESIGN one: pick the base, switch the words on
// and off, add a QR code, choose a palette (docs/decisions.md D-22).
//
// TWO BASES, because a starmap and a system are different things:
//   starmap  a constellation - every system's star at its real map position, the origin star
//            largest and named, faint lines to its nearest neighbours. An Elite-style chart.
//   system   an orbital diagram - the primary star and what orbits it, orbit radii on a log scale
//            of the real semi-major axes, bodies sized and coloured from their real mass and radius.
//
// DETERMINISTIC ON PURPOSE. No randomness - every angle and every background star comes from a
// hash of the map's own ids and title - so the same map with the same options draws the same
// bytes, the PNG hashes the same, and a re-upload reuses the asset already in R2.
//
// NOT ART. It is a recognisable, honest card that says "a star system, this many things, by this
// person" at a glance in a Discord embed. See D-21 for why it is auto-approved.
// ============================================================================================
import { Raster, type RGB } from './raster';
import { drawText, fold, textWidth, wrapLines, type FontStyle } from './font';
import { encodePng } from './png';
import { qrModules } from './qr';
import type { DecodedImage } from './png-decode';

export interface CoverNode {
  node_id: string;
  parent_id: string | null;
  name: string;
  kind: string;
  role_hint: string | null;
  /** Orbit semi-major axis in AU for a child; map distance from the origin for a starmap root. */
  distance?: number | null;
  /** Position relative to the map's origin star, in map units. Starmap roots only. */
  map_x?: number | null;
  map_y?: number | null;
  /** From the node itself, when the row carried it: sizes and colours. */
  radius_km?: number | null;
  mass_kg?: number | null;
  /** e.g. 'G2V', from `classes: ['star/G2V']`. */
  star_class?: string | null;
  has_hydrosphere?: boolean;
}

/** 'image' is one of the creator's own approved screenshots, named by `baseImage`. */
export type CoverBase = 'auto' | 'system' | 'starmap' | 'plain' | 'image';
export type CoverPalette = 'night' | 'amber' | 'mono' | 'green';

export interface CoverOptions {
  base: CoverBase;
  palette: CoverPalette;
  font: FontStyle;
  title: boolean;
  byline: boolean;
  counts: boolean;
  /** The bottom-right label: the site's domain. */
  label: boolean;
  /** A QR code to the map's page. */
  qr: boolean;
  /** sha256 of the screenshot under a base of 'image'; ignored otherwise. */
  baseImage: string | null;
}

export const DEFAULT_COVER_OPTIONS: CoverOptions = {
  base: 'auto', palette: 'night', font: 'pixel',
  title: true, byline: true, counts: true, label: true, qr: false, baseImage: null
};

const BASES: CoverBase[] = ['auto', 'system', 'starmap', 'plain', 'image'];
const PALETTES: CoverPalette[] = ['night', 'amber', 'mono', 'green'];
const FONTS: FontStyle[] = ['pixel', 'bold', 'outline', 'wide'];

/** Options from JSON or a form: anything unrecognised falls back to the default. */
export function coverOptionsFrom(value: unknown): CoverOptions {
  const v = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>;
  const flag = (k: 'title' | 'byline' | 'counts' | 'label' | 'qr') =>
    typeof v[k] === 'boolean' ? (v[k] as boolean) : v[k] === 'on' ? true : v[k] === 'off' ? false : DEFAULT_COVER_OPTIONS[k];
  return {
    base: BASES.includes(v.base as CoverBase) ? (v.base as CoverBase) : 'auto',
    palette: PALETTES.includes(v.palette as CoverPalette) ? (v.palette as CoverPalette) : 'night',
    font: FONTS.includes(v.font as FontStyle) ? (v.font as FontStyle) : 'pixel',
    title: flag('title'), byline: flag('byline'), counts: flag('counts'), label: flag('label'), qr: flag('qr'),
    baseImage: typeof v.baseImage === 'string' && /^[0-9a-f]{64}$/.test(v.baseImage) ? v.baseImage : null
  };
}

export interface CoverFacts {
  title: string;
  creator: string | null;
  /** Bottom-right text - the site's domain, e.g. explorers.starsystemx.com. */
  label: string;
  /** The map page, for the QR code. Null draws no code even when asked. */
  url: string | null;
  kind: 'starmap' | 'system';
  systems: number;
  bodies: number;
  constructs: number;
  nodes: CoverNode[];
  /** The creator's own picture, already fitted to the card, when the base is 'image'. */
  baseImage?: DecodedImage | null;
}

export const COVER_W = 1200;
export const COVER_H = 630;

interface Palette {
  bgTop: RGB; bgBottom: RGB; ink: RGB; dim: RGB; faint: RGB; edge: RGB; accent: RGB; star: RGB; warn: RGB;
}

const PALETTE: Record<CoverPalette, Palette> = {
  night: {
    bgTop: [16, 22, 40], bgBottom: [6, 9, 17], ink: [232, 236, 245], dim: [154, 166, 191],
    faint: [107, 119, 148], edge: [52, 66, 100], accent: [111, 179, 255], star: [255, 233, 176], warn: [255, 194, 102]
  },
  amber: {
    bgTop: [30, 20, 10], bgBottom: [10, 7, 4], ink: [255, 234, 200], dim: [205, 170, 130],
    faint: [150, 120, 90], edge: [96, 66, 36], accent: [255, 190, 100], star: [255, 226, 160], warn: [255, 150, 90]
  },
  mono: {
    bgTop: [22, 22, 25], bgBottom: [6, 6, 8], ink: [238, 238, 240], dim: [168, 168, 174],
    faint: [112, 112, 120], edge: [66, 66, 74], accent: [205, 205, 212], star: [255, 255, 255], warn: [190, 190, 196]
  },
  // The green screen: phosphor on black, the terminal every starship bridge was drawn from.
  green: {
    bgTop: [4, 16, 8], bgBottom: [1, 5, 2], ink: [130, 255, 150], dim: [90, 205, 110],
    faint: [55, 140, 75], edge: [30, 92, 46], accent: [170, 255, 180], star: [210, 255, 210], warn: [235, 255, 120]
  }
};

const WHITE: RGB = [255, 255, 255];
const QR_DARK: RGB = [8, 10, 16];

/** FNV-1a: a stable 32-bit hash of a string, for angles and seeds. */
export function fnv(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

/** mulberry32: a tiny seeded generator, for the background stars. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface TreeNode extends CoverNode { children: TreeNode[]; total: number }

function buildTree(nodes: CoverNode[]): TreeNode[] {
  const byId = new Map<string, TreeNode>();
  for (const n of nodes) byId.set(n.node_id, { ...n, children: [], total: 0 });
  const roots: TreeNode[] = [];
  for (const n of byId.values()) {
    const parent = n.parent_id ? byId.get(n.parent_id) : undefined;
    (parent ? parent.children : roots).push(n);
  }
  const measure = (n: TreeNode): number => {
    for (const c of n.children) n.total += measure(c) + 1;
    return n.total;
  };
  for (const r of roots) measure(r);
  return roots;
}

/** The star the card is about: a star with the most beneath it, or the biggest root of any kind. */
function primaryOf(roots: TreeNode[]): TreeNode | null {
  if (!roots.length) return null;
  const stars = roots.filter((r) => r.role_hint === 'star');
  const pool = stars.length ? stars : roots;
  return [...pool].sort((a, b) => b.total - a.total)[0];
}

// ---- what a thing looks like, from what the file says it is -------------------------------------

const EARTH_KG = 5.972e24;

/** Star colour from the spectral letter. Anything unknown is the palette's star colour. */
function starColour(cls: string | null | undefined, p: Palette): RGB {
  const letter = (cls ?? '').trim().charAt(0).toUpperCase();
  switch (letter) {
    case 'O': case 'B': return [170, 190, 255];
    case 'A': return [222, 230, 255];
    case 'F': return [255, 246, 222];
    case 'G': return p.star;
    case 'K': return [255, 200, 140];
    case 'M': return [255, 150, 110];
    case 'L': case 'T': case 'Y': return [196, 120, 112];
    case 'W': case 'D': return [232, 236, 255]; // white dwarf
    default: return p.star;
  }
}

/** Star radius on the chart, from the class: bright stars big, dwarfs small. */
function starSize(cls: string | null | undefined): number {
  const letter = (cls ?? '').trim().charAt(0).toUpperCase();
  switch (letter) {
    case 'O': case 'B': case 'A': return 4.2;
    case 'F': return 3.8;
    case 'G': return 3.4;
    case 'K': return 3;
    case 'M': return 2.5;
    case 'L': case 'T': case 'Y': return 2;
    case 'W': case 'D': return 2;
    default: return 3;
  }
}

/** A planet's disc: size from its radius, colour from its mass and whether it has an ocean. */
function planetStyle(n: CoverNode, p: Palette): { r: number; c: RGB } {
  const earths = n.mass_kg ? n.mass_kg / EARTH_KG : null;
  if (earths !== null && earths >= 50) return { r: 11, c: [214, 180, 140] }; // gas giant
  if (earths !== null && earths >= 8) return { r: 9, c: [150, 190, 230] };   // ice giant
  const km = n.radius_km ?? null;
  const r = km ? Math.max(3, Math.min(8, 2.5 + km / 2000)) : 6;
  if (n.has_hydrosphere) return { r, c: [80, 140, 220] };
  return { r, c: km || earths !== null ? [168, 158, 148] : p.accent };
}

// ---- the bases -----------------------------------------------------------------------------------

function starfield(r: Raster, seedText: string, count: number, p: Palette): void {
  const rand = rng(fnv(seedText) || 1);
  for (let i = 0; i < count; i++) {
    const x = rand() * COVER_W, y = rand() * COVER_H;
    r.circle(x, y, 0.5 + rand() * 1.1, p.ink, 0.25 + rand() * 0.55);
  }
}

/** The orbital diagram. `box` is where it may sit; the diagram fills it. */
function drawSystem(r: Raster, facts: CoverFacts, p: Palette, box: { cx: number; cy: number; inner: number; outer: number }): void {
  const roots = buildTree(facts.nodes);
  const primary = primaryOf(roots);
  const { cx, cy } = box;
  const KY = 0.55;

  if (!primary) {
    r.glow(cx, cy, 120, p.star, 0.38);
    r.circle(cx, cy, 24, p.star);
    return;
  }

  // Up to eight orbits: the children with the most beneath them. Ordered by real distance when the
  // file says, by file order otherwise.
  const chosen = new Set([...primary.children].sort((a, b) => b.total - a.total).slice(0, 8).map((c) => c.node_id));
  const orbiting = primary.children.filter((c) => chosen.has(c.node_id));
  const known = orbiting.filter((c) => (c.distance ?? 0) > 0);
  if (known.length >= 2) orbiting.sort((a, b) => (a.distance ?? Infinity) - (b.distance ?? Infinity));

  const n = orbiting.length;
  const { inner, outer } = box;
  // Log scale of the real semi-major axes when at least two are known: Mercury to Neptune spans
  // two orders of magnitude and a linear scale would put the inner planets on top of the star.
  let radii: number[];
  if (known.length >= 2 && known.length === n) {
    const lo = Math.log(orbiting[0].distance as number), hi = Math.log(orbiting[n - 1].distance as number);
    radii = orbiting.map((c) => (hi > lo ? inner + ((Math.log(c.distance as number) - lo) / (hi - lo)) * (outer - inner) : inner));
  } else {
    const step = n > 1 ? Math.min(24, (outer - inner) / (n - 1)) : 0;
    radii = orbiting.map((_, i) => inner + i * step);
  }

  // Orbits first, so the bodies sit on top of them.
  orbiting.forEach((child, i) => {
    const radius = radii[i];
    if (child.role_hint === 'belt') {
      for (let k = 0; k < 56; k++) {
        const a = (k / 56) * Math.PI * 2 + (fnv(child.node_id + k) % 100) / 400;
        const wobble = ((fnv(child.node_id + 'w' + k) % 100) / 100 - 0.5) * 6;
        r.circle(cx + (radius + wobble) * Math.cos(a), cy + (radius + wobble) * Math.sin(a) * KY, 1.1, p.faint, 0.8);
      }
    } else if (child.role_hint === 'ring') {
      r.ring(cx, cy, radius, 3, p.edge, 0.7, KY);
    } else {
      r.ring(cx, cy, radius, 1.2, p.edge, 0.95, KY);
    }
  });

  const sc = starColour(primary.star_class, p);
  r.glow(cx, cy, 120, sc, 0.38);
  r.circle(cx, cy, 24, sc);
  r.circle(cx - 3, cy - 3, 12, WHITE, 0.55);

  orbiting.forEach((child, i) => {
    const radius = radii[i];
    const angle = ((fnv(child.node_id) % 3600) / 3600) * Math.PI * 2;
    const x = cx + radius * Math.cos(angle), y = cy + radius * Math.sin(angle) * KY;
    switch (child.role_hint) {
      case 'planet': {
        const { r: pr, c } = planetStyle(child, p);
        // A ringed planet wears its ring: a thin tilted ellipse around the disc.
        if (child.children.some((k) => k.role_hint === 'ring')) r.ring(x, y, pr + 5, 1.6, p.dim, 0.8, 0.35);
        r.circle(x, y, pr, c);
        r.circle(x - pr * 0.3, y - pr * 0.3, pr * 0.4, WHITE, 0.4);
        const moons = child.children.filter((m) => m.role_hint === 'moon').slice(0, 4);
        if (moons.length) r.ring(x, y, pr + 9, 0.8, p.edge, 0.8);
        moons.forEach((m, k) => {
          const ma = ((fnv(m.node_id) % 360) / 360) * Math.PI * 2 + k;
          r.circle(x + (pr + 9) * Math.cos(ma), y + (pr + 9) * Math.sin(ma), 2, p.dim);
        });
        break;
      }
      case 'moon': r.circle(x, y, 3, p.dim); break;
      case 'small object': r.circle(x, y, 1.8, p.dim, 0.9); break;
      case 'belt': break; // the orbit IS the belt
      case 'ring': r.circle(x, y, 2.5, p.dim, 0.8); break;
      case 'star': {
        const c = starColour(child.star_class, p);
        r.glow(x, y, 26, c, 0.4); r.circle(x, y, 8, c); break;
      }
      case 'barycenter': r.ring(x, y, 5, 1.4, p.dim); break;
      default: r.rect(x - 3.5, y - 3.5, 7, 7, p.warn); // a construct: station, ship, habitat
    }
  });
}

/** A system's star colour and size: the root's own class, or the brightest child's for a barycentre. */
function systemClass(root: TreeNode): string | null {
  if (root.star_class) return root.star_class;
  const stars = root.children.filter((c) => c.star_class);
  return stars.length ? stars.sort((a, b) => starSize(b.star_class) - starSize(a.star_class))[0].star_class ?? null : null;
}

/** What to call a system on the chart: the star's name, or a barycentre's name without the scaffolding. */
function systemLabel(root: TreeNode): string {
  const name = root.role_hint === 'star' ? root.name : root.name.replace(/\s*(system\s*)?bary(centre|center)?\s*$/i, '');
  return fold(name).slice(0, 24);
}

/** The constellation: every root star at its real map position, the origin named. */
function drawStarmap(r: Raster, facts: CoverFacts, p: Palette, box: { x0: number; y0: number; x1: number; y1: number }): boolean {
  const roots = buildTree(facts.nodes).filter((n) => typeof n.map_x === 'number' && typeof n.map_y === 'number');
  if (roots.length < 2) return false;

  // THE ORIGIN AT THE CENTRE, AND A ROBUST SCALE. Fitting the bounding box lets one far-flung
  // system shrink the whole neighbourhood into a blob; fitting the nearest 85 percent and pinning
  // the outliers to the edge keeps the part people recognise readable.
  const origin = roots.find((n) => (n.distance ?? 1) === 0) ?? roots[0];
  const ox0 = origin.map_x as number, oy0 = origin.map_y as number;
  const radii = roots.map((n) => Math.hypot((n.map_x as number) - ox0, (n.map_y as number) - oy0)).sort((a, b) => a - b);
  const r85 = Math.max(1e-9, radii[Math.min(radii.length - 1, Math.floor(radii.length * 0.85))]);
  const halfW = (box.x1 - box.x0) / 2, halfH = (box.y1 - box.y0) / 2;
  const scale = Math.min(halfW, halfH) * 0.92 / r85;
  const cx = (box.x0 + box.x1) / 2, cy = (box.y0 + box.y1) / 2;
  const at = (n: TreeNode) => {
    let x = ((n.map_x as number) - ox0) * scale, y = ((n.map_y as number) - oy0) * scale;
    // Beyond the box: pin to its edge, along the line from the origin.
    const k = Math.max(Math.abs(x) / halfW, Math.abs(y) / halfH);
    if (k > 1) { x /= k; y /= k; }
    return { x: cx + x, y: cy + y, far: k > 1 };
  };
  const o = at(origin);

  // Faint lines: the origin to its six nearest, and each star to its nearest neighbour. That is
  // the whole "chart" feel - routes and neighbourhoods, not a scatter of dots.
  const others = roots.filter((n) => n !== origin);
  const dist = (a: TreeNode, b: TreeNode) => {
    const pa = at(a), pb = at(b);
    return Math.hypot(pa.x - pb.x, pa.y - pb.y);
  };
  for (const n of [...others].sort((a, b) => dist(a, origin) - dist(b, origin)).slice(0, 6)) {
    const q = at(n);
    r.line(o.x, o.y, q.x, q.y, 1, p.edge, 0.9);
  }
  for (const n of others) {
    let best: TreeNode | null = null, bd = Infinity;
    for (const m of roots) {
      if (m === n) continue;
      const d = dist(n, m);
      if (d < bd) { bd = d; best = m; }
    }
    if (best) {
      const a = at(n), b = at(best);
      r.line(a.x, a.y, b.x, b.y, 0.8, p.edge, 0.45);
    }
  }

  for (const n of others) {
    const q = at(n);
    const cls = systemClass(n);
    const c = starColour(cls, p);
    const s = starSize(cls);
    const alpha = q.far ? 0.45 : 1;
    r.glow(q.x, q.y, s * 5, c, 0.3 * alpha);
    r.circle(q.x, q.y, s, c, alpha);
  }

  const oc = starColour(systemClass(origin), p);
  r.glow(o.x, o.y, 48, oc, 0.45);
  r.circle(o.x, o.y, 7, oc);
  r.circle(o.x - 2, o.y - 2, 3, WHITE, 0.6);
  drawText(r, o.x + 14, o.y - 7, systemLabel(origin), 2, p.ink, 0.9);
  return true;
}

// ---- the overlays --------------------------------------------------------------------------------

function drawQr(r: Raster, url: string, right: number, bottom: number): number {
  const modules = qrModules(url);
  const n = modules.length;
  const cell = Math.max(2, Math.floor(112 / n));
  const quiet = 3 * cell;
  const size = n * cell + quiet * 2;
  const x0 = right - size, y0 = bottom - size;
  r.rect(x0, y0, size, size, WHITE);
  for (let row = 0; row < n; row++) {
    for (let col = 0; col < n; col++) {
      if (modules[row][col]) r.rect(x0 + quiet + col * cell, y0 + quiet + row * cell, cell, cell, QR_DARK);
    }
  }
  return size;
}

export function renderCover(facts: CoverFacts, options: CoverOptions = DEFAULT_COVER_OPTIONS): Uint8Array {
  const p = PALETTE[options.palette] ?? PALETTE.night;
  const r = new Raster(COVER_W, COVER_H);

  const wordsOn = options.title || options.byline;
  const footOn = options.counts || options.label || (options.qr && !!facts.url);
  const qrOn = options.qr && !!facts.url;
  const font: FontStyle = options.font ?? 'pixel';

  // ---- the base ------------------------------------------------------------------------------
  // The creator's own picture, when they chose one and it could be read; otherwise the card.
  const picture = options.base === 'image' && facts.baseImage
    && facts.baseImage.width === COVER_W && facts.baseImage.height === COVER_H ? facts.baseImage : null;
  // Words over a photograph get a halo whatever the font, or they vanish into the picture.
  const halo = font === 'outline' || !!picture;
  const shadow = picture ? ([0, 0, 0] as RGB) : p.bgBottom;

  let base: CoverBase = options.base === 'auto' || (options.base === 'image' && !picture)
    ? (facts.kind === 'starmap' ? 'starmap' : 'system')
    : options.base;
  if (picture) {
    r.image(picture);
    if (wordsOn || footOn) r.shade(0.45, 0.9);
    base = 'image';
  } else {
    r.gradient(p.bgTop, p.bgBottom);
    starfield(r, facts.title, Math.min(180, 60 + facts.systems * 2), p);
  }

  let drawn = false;
  if (base === 'starmap') {
    drawn = drawStarmap(r, facts, p, wordsOn || footOn
      ? { x0: qrOn ? 440 : 520, y0: 170, x1: qrOn ? 960 : 1120, y1: 540 }
      : { x0: 100, y0: 70, x1: 1100, y1: 560 });
  }
  if (base === 'system' || (base === 'starmap' && !drawn)) {
    // Other systems in a starmap: a few brighter points, so "42 systems" has something to point at.
    const rand = rng(fnv(facts.title + 'x') || 1);
    for (let i = 0; i < Math.min(40, Math.max(0, facts.systems - 1)); i++) {
      const x = rand() * COVER_W, y = rand() * COVER_H;
      r.glow(x, y, 7, p.star, 0.25);
      r.circle(x, y, 1.4 + rand(), WHITE, 0.85);
    }
    drawSystem(r, facts, p, wordsOn || footOn
      ? { cx: qrOn ? 760 : 860, cy: 392, inner: 62, outer: 182 }
      : { cx: 600, cy: 315, inner: 90, outer: 270 });
  }

  // ---- the words -----------------------------------------------------------------------------
  const write = (x: number, y: number, text: string, scale: number, c: RGB) =>
    drawText(r, x, y, text, scale, c, 1, font, halo ? shadow : undefined);
  const width = (text: string, scale: number) => textWidth(text, scale, font);
  // A wide face fits fewer letters on a line.
  const perLine = font === 'wide' ? 20 : 30;

  let y = 62;
  if (options.title) {
    for (const line of wrapLines(fold(facts.title), perLine, 2)) {
      write(60, y, line, 6, p.ink);
      y += 7 * 6 + 14;
    }
  }
  if (options.byline && facts.creator) {
    write(60, options.title ? y + 6 : y, fold('by ' + facts.creator), 3, p.dim);
  }

  const baseline = COVER_H - 60 - 21;
  let countsWidth = 0;
  if (options.counts) {
    const parts: string[] = [];
    if (facts.systems > 1) parts.push(facts.systems + ' systems');
    parts.push(facts.bodies + (facts.bodies === 1 ? ' body' : ' bodies'));
    if (facts.constructs) parts.push(facts.constructs + (facts.constructs === 1 ? ' construct' : ' constructs'));
    const counts = fold(parts.join(' - '));
    countsWidth = width(counts, 3);
    write(60, baseline, counts, 3, p.dim);
  }

  const right = COVER_W - 60;
  let labelTop = baseline;
  if (options.label && facts.label) {
    const label = fold(facts.label);
    const w = width(label, 3);
    // The counts and the domain share the bottom line; when the two would touch, the domain
    // moves up a line rather than running into the numbers.
    if (options.counts && 60 + countsWidth + 40 > right - w) labelTop = baseline - 30;
    write(right - w, labelTop, label, 3, p.faint);
  }
  if (qrOn) {
    // Above the label when there is one, otherwise on the baseline.
    const bottom = options.label && facts.label ? labelTop - 16 : COVER_H - 60;
    drawQr(r, facts.url as string, right, bottom);
  }

  return encodePng(COVER_W, COVER_H, r.data);
}
