// WHICH STAR IS IN THE MIDDLE OF A SYSTEM COVER (D-85).
//
// The owner, 2026-09-11: "do we need a slight tweak to the system view default cover image ... to
// cope with multistar systems?" Drawing Alpha Centauri from the engine's own Local Neighbourhood
// showed a sun in the middle that is not there (the barycentre), A and B missing entirely, and their
// pair drawn as a construct's square. These pin the DECISION; the pixels follow from it.
import { describe, it, expect } from 'vitest';
import { systemLayout, renderCover, type CoverNode } from '../src/lib/cover/generate';

const SUN = 1.989e30;
const node = (node_id: string, parent_id: string | null, extra: Partial<CoverNode> = {}): CoverNode => ({
  node_id, parent_id, name: node_id, kind: 'body', role_hint: null, ...extra
});
const star = (id: string, parent: string | null, cls: string, solar?: number, distance?: number) =>
  node(id, parent, { role_hint: 'star', star_class: cls, mass_kg: solar ? solar * SUN : null, distance: distance ?? null });
const bary = (id: string, parent: string | null, distance?: number) =>
  node(id, parent, { kind: 'barycenter', distance: distance ?? null });
const planet = (id: string, parent: string, distance?: number) =>
  node(id, parent, { role_hint: 'planet', distance: distance ?? null });

describe('a system cover puts a real star in the middle', () => {
  it('a single star is its own middle, as it always was', () => {
    const layout = systemLayout([star('sol', null, 'G2V', 1), planet('earth', 'sol', 1), planet('mars', 'sol', 1.5)]);
    expect(layout).toEqual({ centre: 'sol', orbiting: ['earth', 'mars'], companions: [] });
  });

  it('a binary: the heavier star in the middle, the lighter on a ring - never the barycentre', () => {
    const layout = systemLayout([
      bary('sirius', null), star('sirius-a', 'sirius', 'A1V', 2.06, 6.5), star('sirius-b', 'sirius', 'WD', 1.02, 13.3)
    ]);
    expect(layout.centre).toBe('sirius-a');
    expect(layout.companions).toEqual(['sirius-b']);
  });

  it('a hierarchical triple: down through both barycentres, companions closest first', () => {
    // Alpha Centauri as the engine writes it: A and B one barycentre below the root, Proxima beside
    // them with her own planets. The old cover drew neither A nor B.
    const layout = systemLayout([
      bary('system', null),
      bary('ab', 'system', 0.1),
      star('a', 'ab', 'G2V', 1.1, 10.6), star('b', 'ab', 'K1V', 0.9, 12.9),
      star('proxima', 'system', 'M5.5V', 0.12, 8700),
      planet('proxima-b', 'proxima', 0.05), planet('proxima-d', 'proxima', 0.03)
    ]);
    expect(layout.centre).toBe('a');
    expect(layout.companions).toEqual(['b', 'proxima']);
    // Proxima's planets are hers. Putting them on A's rings would say they orbit A.
    expect(layout.orbiting).not.toContain('proxima-b');
  });

  it('a planet round the barycentre itself is circumbinary, and gets a ring', () => {
    const layout = systemLayout([
      bary('kepler-16', null), star('k16a', 'kepler-16', 'K', 0.69, 0.1), star('k16b', 'kepler-16', 'M', 0.2, 0.2),
      planet('k16b-planet', 'kepler-16', 0.7)
    ]);
    expect(layout.centre).toBe('k16a');
    expect(layout.orbiting).toContain('k16b-planet');
    expect(layout.companions).toEqual(['k16b']);
  });

  it('with no masses, the class decides - one G star outweighs a pair of red dwarfs', () => {
    const layout = systemLayout([
      bary('root', null), star('g', 'root', 'G2V'), bary('pair', 'root'), star('m1', 'pair', 'M4V'), star('m2', 'pair', 'M5V')
    ]);
    expect(layout.centre).toBe('g');
    expect(layout.companions).toEqual(['pair']);
  });

  it('a barycentre with no stars in it is not a star system - Pluto and Charon stay on Sol\'s rings', () => {
    const layout = systemLayout([
      star('sol', null, 'G2V', 1), planet('neptune', 'sol', 30), bary('pluto-charon', 'sol', 39.5),
      planet('pluto', 'pluto-charon'), planet('charon', 'pluto-charon')
    ]);
    expect(layout.centre).toBe('sol');
    expect(layout.orbiting).toEqual(['neptune', 'pluto-charon']);
    expect(layout.companions).toEqual([]);
  });

  it('several roots with stars (a multi-root import): the heaviest is the system, the rest companions', () => {
    const layout = systemLayout([star('big', null, 'F5V', 1.3), star('small', null, 'M2V', 0.4), planet('p', 'big', 1)]);
    expect(layout.centre).toBe('big');
    expect(layout.companions).toEqual(['small']);
  });

  it('no star anywhere falls back to the old rule rather than failing', () => {
    const layout = systemLayout([node('station', null, { kind: 'construct', role_hint: 'station' })]);
    expect(layout.centre).toBe('station');
  });

  it('still draws, and draws the same bytes twice', () => {
    const nodes = [bary('s', null), star('a', 's', 'A1V', 2), star('b', 's', 'WD', 1), bary('c', 's'), star('c1', 'c', 'M'), star('c2', 'c', 'M')];
    const facts = { title: 'Pairs', creator: null, label: 'x', url: null, kind: 'system' as const, systems: 1, bodies: 5, constructs: 0, nodes };
    expect(renderCover(facts)).toEqual(renderCover(facts));
  });
});
