// THE GENERATED COVER: a card drawn from the map itself, for maps that carry no picture.
//
// ============================================================================================
// WHY. Most saves arrive with no cover - the Local Neighbourhood starmap has sixty node images and
// not one of them is carried in the bundle (C-06). A page with no picture is a link that previews
// with no picture, and for a hub whose product is link-sharing that is the most expensive small
// failure available (D-18). So when the creator chose nothing and the guess finds nothing, the hub
// draws one: the primary star, its children on tilted orbits, the title, the counts, the byline.
//
// DETERMINISTIC ON PURPOSE. No randomness - every angle and every background star comes from a
// hash of the map's own ids and title - so the same map draws the same bytes, the PNG hashes the
// same, and a re-upload reuses the asset already in R2 rather than minting another.
//
// NOT ART. It is a recognisable, honest card that says "a star system, this many things, by this
// person" at a glance in a Discord embed. The moment a creator picks a real picture (coverAssetId)
// it is never used. See docs/decisions.md D-21 for why it is auto-approved.
// ============================================================================================
import { Raster, type RGB } from './raster';
import { drawText, fold, textWidth, wrapLines } from './font';
import { encodePng } from './png';

export interface CoverNode {
  node_id: string;
  parent_id: string | null;
  name: string;
  kind: string;
  role_hint: string | null;
}

export interface CoverFacts {
  title: string;
  creator: string | null;
  site: string;
  systems: number;
  bodies: number;
  constructs: number;
  nodes: CoverNode[];
}

export const COVER_W = 1200;
export const COVER_H = 630;

const INK: RGB = [232, 236, 245];
const DIM: RGB = [154, 166, 191];
const FAINT: RGB = [107, 119, 148];
const EDGE: RGB = [52, 66, 100];
const ACCENT: RGB = [111, 179, 255];
const STAR: RGB = [255, 233, 176];
const WHITE: RGB = [255, 255, 255];
const WARN: RGB = [255, 194, 102];
const BG_TOP: RGB = [16, 22, 40];
const BG_BOTTOM: RGB = [6, 9, 17];

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

export function renderCover(facts: CoverFacts): Uint8Array {
  const r = new Raster(COVER_W, COVER_H);
  r.gradient(BG_TOP, BG_BOTTOM);

  // ---- a field of background stars, seeded by the title so it is stable ---------------------
  const rand = rng(fnv(facts.title) || 1);
  const dots = Math.min(180, 60 + facts.systems * 2);
  for (let i = 0; i < dots; i++) {
    const x = rand() * COVER_W, y = rand() * COVER_H;
    const size = 0.5 + rand() * 1.1;
    r.circle(x, y, size, INK, 0.25 + rand() * 0.55);
  }
  // Other systems in a starmap: a few brighter points, so "42 systems" has something to point at.
  for (let i = 0; i < Math.min(40, Math.max(0, facts.systems - 1)); i++) {
    const x = rand() * COVER_W, y = rand() * COVER_H;
    r.glow(x, y, 7, STAR, 0.25);
    r.circle(x, y, 1.4 + rand(), WHITE, 0.85);
  }

  // ---- the diagram: the primary star and what orbits it ------------------------------------
  const roots = buildTree(facts.nodes);
  const primary = primaryOf(roots);
  const cx = 860, cy = 392, KY = 0.55;

  if (primary) {
    // Up to eight orbits: the children with the most beneath them, kept in the file's order.
    const chosen = new Set([...primary.children].sort((a, b) => b.total - a.total).slice(0, 8).map((c) => c.node_id));
    const orbiting = primary.children.filter((c) => chosen.has(c.node_id));
    const n = orbiting.length;
    const innermost = 62, outermost = 182;
    const step = n > 1 ? Math.min(24, (outermost - innermost) / (n - 1)) : 0;

    // Orbits first, so the bodies sit on top of them.
    orbiting.forEach((child, i) => {
      const radius = innermost + i * step;
      if (child.role_hint === 'belt') {
        for (let k = 0; k < 48; k++) {
          const a = (k / 48) * Math.PI * 2 + (fnv(child.node_id + k) % 100) / 400;
          r.circle(cx + radius * Math.cos(a), cy + radius * Math.sin(a) * KY, 1.1, FAINT, 0.8);
        }
      } else if (child.role_hint === 'ring') {
        r.ring(cx, cy, radius, 3, EDGE, 0.7, KY);
      } else {
        r.ring(cx, cy, radius, 1.2, EDGE, 0.95, KY);
      }
    });

    r.glow(cx, cy, 120, STAR, 0.38);
    r.circle(cx, cy, 24, STAR);
    r.circle(cx - 3, cy - 3, 12, WHITE, 0.55);

    orbiting.forEach((child, i) => {
      const radius = innermost + i * step;
      const angle = ((fnv(child.node_id) % 3600) / 3600) * Math.PI * 2;
      const x = cx + radius * Math.cos(angle), y = cy + radius * Math.sin(angle) * KY;
      switch (child.role_hint) {
        case 'planet': {
          r.circle(x, y, 6, ACCENT);
          r.circle(x - 1.5, y - 1.5, 2.5, WHITE, 0.45);
          const moons = child.children.filter((m) => m.role_hint === 'moon').slice(0, 4);
          if (moons.length) r.ring(x, y, 13, 0.8, EDGE, 0.8);
          moons.forEach((m, k) => {
            const ma = ((fnv(m.node_id) % 360) / 360) * Math.PI * 2 + k;
            r.circle(x + 13 * Math.cos(ma), y + 13 * Math.sin(ma), 2, DIM);
          });
          break;
        }
        case 'moon': r.circle(x, y, 3, DIM); break;
        case 'belt': break; // the orbit IS the belt
        case 'ring': r.circle(x, y, 2.5, DIM, 0.8); break;
        case 'star': r.glow(x, y, 26, STAR, 0.4); r.circle(x, y, 8, STAR); break;
        case 'barycenter': r.ring(x, y, 5, 1.4, DIM); break;
        default: r.rect(x - 3.5, y - 3.5, 7, 7, WARN); // a construct: station, ship, habitat
      }
    });
  }

  // ---- the words ----------------------------------------------------------------------------
  const titleScale = 6;
  const lines = wrapLines(fold(facts.title), 30, 2);
  let y = 62;
  for (const line of lines) {
    drawText(r, 60, y, line, titleScale, INK);
    y += 7 * titleScale + 14;
  }
  if (facts.creator) {
    drawText(r, 60, y + 6, fold('by ' + facts.creator), 3, DIM);
  }

  const parts: string[] = [];
  if (facts.systems > 1) parts.push(facts.systems + ' systems');
  parts.push(facts.bodies + (facts.bodies === 1 ? ' body' : ' bodies'));
  if (facts.constructs) parts.push(facts.constructs + (facts.constructs === 1 ? ' construct' : ' constructs'));
  drawText(r, 60, COVER_H - 60 - 21, fold(parts.join(' - ')), 3, DIM);

  const site = fold(facts.site);
  drawText(r, COVER_W - 60 - textWidth(site, 3), COVER_H - 60 - 21, site, 3, FAINT);

  return encodePng(COVER_W, COVER_H, r.data);
}
