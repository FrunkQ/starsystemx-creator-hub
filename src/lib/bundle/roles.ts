// THE HUMAN ROLE OF A NODE - the engine's `roleHint`, with one hub-side refinement.
//
// ============================================================================================
// "SMALL OBJECT" (owner, 2026-09-04): "people are starting to model the asteroid belt in detail
// ... below a certain mass - should be in a new category." The engine calls every orbiting rock a
// planet or a moon, so a map with four hundred modelled asteroids reads as "412 planets" - which
// is true in the engine's terms and useless in a person's. Below the threshold a planet or moon
// becomes a SMALL OBJECT: an asteroid, a comet, a moonlet, a sub-moon.
//
// THE THRESHOLD: 1e20 kg. Vesta (2.6e20) and Pallas (2.0e20) stay what the engine called them;
// Hygiea (8.7e19) and everything smaller become small objects; Ceres (9.4e20) is untouched. When a
// mass is missing, a radius under 250 km decides. Nothing else is reclassified: a belt is a belt,
// a station is a station, and a star of any size is a star.
//
// ONE DEFINITION, used by normalise (the stored role), facets (the counts and the pills) and the
// cover (how it is drawn). Two of those disagreeing would be the "two readers of one field"
// trap again.
// ============================================================================================

export const SMALL_OBJECT = 'small object';
export const SMALL_OBJECT_MAX_KG = 1e20;
export const SMALL_OBJECT_MAX_RADIUS_KM = 250;

const RECLASSIFIED = new Set(['planet', 'moon']);

export function displayRole(node: { roleHint?: unknown; massKg?: unknown; radiusKm?: unknown } | null | undefined): string | null {
  const hint = typeof node?.roleHint === 'string' && node.roleHint ? node.roleHint : null;
  if (!hint || !RECLASSIFIED.has(hint)) return hint;

  const mass = typeof node?.massKg === 'number' && Number.isFinite(node.massKg) && node.massKg > 0 ? node.massKg : null;
  const radius = typeof node?.radiusKm === 'number' && Number.isFinite(node.radiusKm) && node.radiusKm > 0 ? node.radiusKm : null;

  if (mass !== null) return mass < SMALL_OBJECT_MAX_KG ? SMALL_OBJECT : hint;
  if (radius !== null) return radius < SMALL_OBJECT_MAX_RADIUS_KM ? SMALL_OBJECT : hint;
  return hint;
}
