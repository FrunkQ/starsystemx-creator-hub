// THE LICENCES PEOPLE ACTUALLY PICK, offered as suggestions rather than as a menu (D-59).
//
// ============================================================================================
// The owner, 2026-09-06: *"licence selection should be a drop down box and a manual type in."*
// Both, and in ONE control: a `<datalist>` is a text input that offers a list. Pick from it, or
// type something it has never heard of - a bespoke asset licence, a studio's own terms, a line
// from a bundle nobody else has - and it posts as plain text either way, so nothing downstream
// has to know whether it was chosen or written.
//
// A `<select>` with an "Other..." option would have been the same idea with an extra click and a
// second piece of state to keep in step, and the "Other" box is always the one that gets forgotten.
//
// WHY A LIST AT ALL, when the field was already free text: because "CC BY 4.0" and "cc-by-4",
// "Creative Commons Attribution" and "CC-BY" are the same licence spelled four ways, and the hub
// SHOWS this string to whoever downloads the map. A suggestion costs nothing and makes the common
// answer the easy one - the same reasoning as the creator vocabulary (`vocabulary.ts`).
//
// IT IS NOT A VALIDATION. Nothing checks a licence against this list, and nothing should: a licence
// the hub has not heard of is somebody's real licence, not a mistake.
// ============================================================================================

/**
 * Ordered by how often a map's picture actually carries one, not alphabetically.
 *
 * NOTE HOW THIS MEETS THE GATE. `breachesCcBy` (`bundle/attribution.ts`) refuses any CC-BY variant
 * with nobody named - which is correct and is the whole of what CC-BY asks - so every entry here
 * containing "CC BY" needs a name beside it, and the ones that do not are exactly the ones that do
 * not require attribution. `tests/licences.test.ts` pins that agreement, so this list can never
 * quietly suggest something the gate then refuses for a reason the creator cannot see.
 */
export const LICENCES: string[] = [
  'My own work',
  'CC0 1.0 (public domain)',
  'CC BY 4.0',
  'CC BY-SA 4.0',
  'CC BY-NC 4.0',
  'CC BY-NC-SA 4.0',
  'CC BY-ND 4.0',
  'Public domain',
  'Used with permission',
  'Bought - commercial licence',
  'NASA / public domain image'
];

/** Does this licence require a name beside it? True for every Creative Commons attribution licence. */
export const needsCredit = (licence: string): boolean => /cc[- ]?by/i.test(licence);
