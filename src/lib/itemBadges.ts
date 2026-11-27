// THE BADGES ON AN ITEM (SP14, store packs design 9.5). One set for the store and, later, the app.
//
// Alex, 27 Nov 2026: "probably need a badge update on the store now we have more types of content."
//
// EVERY BADGE IS WORKED OUT FROM THE ITEM, never typed by its maker: the file's kinds and contents,
// the listing's fan setting, the row's state. One or two words, with a line of plain words behind
// it, in the order of the table. The table is data: SSE4 is to read the same table (from
// `/api/v4`, which returns each item's badges) so the app and the store cannot disagree.
//
// Not the explorer's own badges (`badges.ts`, achievements earned by doing things); these describe
// a thing on a shelf.
//
// NOT YET WORKED OUT, and why (each arrives with the package named):
//   Real data, Free only   need the pack's `downloaded_data`, which the store does not read yet (SP3)
//   a price                needs paid packs switched on (PP); until then everything is Free
//   Update, Yours          the app's own, never the store's
// ============================================================================================

export type BadgeGroup = 'app' | 'what' | 'where' | 'money' | 'state';

export interface ItemBadgeDef { id: string; words: string; line: string; group: BadgeGroup; warn?: boolean }

export const ITEM_BADGES: ItemBadgeDef[] = [
  { id: 'v3', words: 'V3', line: 'Made in Star System Explorer 3. SSE4 opens it too.', group: 'app' },
  { id: 'v4', words: 'V4', line: 'Made for Star System Explorer 4.', group: 'app' },
  { id: 'campaign', words: 'Campaign', line: 'A whole campaign or star map to open and play.', group: 'what' },
  { id: 'system', words: 'System', line: 'A single star system to place in a campaign.', group: 'what' },
  { id: 'clip', words: 'Clip', line: 'A piece of a map to drop into your own.', group: 'what' },
  { id: 'setting', words: 'Setting', line: 'Places, factions, templates and the rules that dress worlds. Changes no physics.', group: 'what' },
  { id: 'constructs', words: 'Constructs', line: 'Ships, stations or structures on the ground.', group: 'what' },
  { id: 'parts', words: 'Parts', line: 'What constructs are made of: parts and engines.', group: 'what' },
  { id: 'game-system', words: 'Game system', line: 'Reads game codes off the physics. Never feeds it.', group: 'what' },
  { id: 'physics', words: 'Physics', line: 'Changes physics or reference data. Everything it touches is marked.', group: 'what', warn: true },
  { id: 'looks', words: 'Looks', line: 'Changes how things look or are named. Changes no numbers.', group: 'what' },
  { id: 'fan', words: 'Fan-made', line: 'Unofficial fan work for a setting that belongs to someone else. Always free.', group: 'where' },
  { id: 'fictional', words: 'Fictional physics', line: 'Its results are marked fictional wherever they are used.', group: 'where' },
  { id: 'free', words: 'Free', line: 'Free to download and use.', group: 'money' },
  { id: 'needs', words: 'Needs packs', line: 'Needs other packs; SSE4 offers to fetch them.', group: 'state' },
  { id: 'withdrawn', words: 'Withdrawn', line: 'Taken off the shelf by its maker. Its address still works.', group: 'state' },
  { id: 'draft', words: 'Draft', line: 'Not published yet. Only its maker sees it.', group: 'state' }
];

const BY_ID = new Map(ITEM_BADGES.map((b) => [b.id, b]));
const ORDER = new Map(ITEM_BADGES.map((b, i) => [b.id, i]));

/** A badge as shown: its words (with a number where it has one), its line, and whether it warns. */
export interface ItemBadge { id: string; words: string; line: string; warn: boolean }

function make(ids: Iterable<string>, needs = 0): ItemBadge[] {
  return [...new Set(ids)].filter((id) => BY_ID.has(id)).sort((a, b) => ORDER.get(a)! - ORDER.get(b)!).map((id) => {
    const d = BY_ID.get(id)!;
    const words = id === 'needs' ? `Needs ${needs} ${needs === 1 ? 'pack' : 'packs'}` : d.words;
    return { id, words, line: d.line, warn: !!d.warn };
  });
}

// What carrying each content slug (read.ts `containsOf`) makes an item. A slug not listed here adds
// no "what it is" badge of its own; the kind written in the file still does.
const CONSTRUCTS = ['ship_designs', 'ships', 'constructs', 'stations', 'craft', 'structures', 'vessels'];
const PARTS = ['parts', 'engines', 'components', 'modules', 'drives'];
const GAME = ['code_sheets', 'rules', 'sifters', 'difficulty'];
const PHYSICS = ['flows', 'boxes', 'quantity_kinds', 'block_edits', 'gas_mixes', 'reference', 'materials', 'colours', 'constants',
  'surface', 'climate', 'cosmology', 'light', 'nav', 'placement', 'patch_model', 'time', 'weather', 'life', 'habitat_rules', 'observe'];
const LOOKS = ['themes', 'lenses', 'tours', 'view_styles', 'overlays', 'name_schemes', 'vocabulary', 'class_atlas', 'ship_styles'];
const SETTING = ['templates', 'dressing_rules', 'places', 'factions', 'programs', 'calendars', 'unit_schemes', 'tag_groups',
  'sol', 'crews', 'memorials', 'in_memory', 'catalogues', 'triggers', 'intents', 'record'];

export interface V4BadgeInput {
  kind: 'campaign' | 'pack';
  pack_kinds?: string[] | null;
  provides?: Record<string, number> | null;
  requires?: unknown[] | null;
  fan_setting?: string | null;
  fictional?: boolean | null;
  state?: string | null;
}

/**
 * An SSE4 item's badges. A pack shows one "what it is" badge for each thing it carries, so a ship
 * pack that also carries a flow is Constructs AND Physics (design section 3: "it will ALSO be
 * categorised as physics"). Physics comes from the contents as well as the written kind.
 */
export function v4Badges(item: V4BadgeInput): ItemBadge[] {
  const ids: string[] = ['v4', 'free'];
  if (item.kind === 'campaign') ids.push('campaign');
  else {
    const kinds = item.pack_kinds ?? [];
    const has = (list: string[]) => list.some((s) => (item.provides ?? {})[s]);
    let what = 0;
    const add = (id: string) => { ids.push(id); what++; };
    if (has(CONSTRUCTS)) add('constructs');
    if (has(PARTS)) add('parts');
    if (has(SETTING)) add('setting');
    if (has(GAME) || kinds.includes('game-system')) add('game-system');
    if (has(LOOKS) || kinds.includes('presentation') || kinds.includes('suite')) add('looks');
    if (has(PHYSICS) || kinds.includes('physics') || kinds.includes('base-physics')) add('physics');
    // A universe pack whose contents name nothing above is still a setting, as its kind says.
    if (kinds.includes('universe') && !ids.some((i) => ['constructs', 'parts', 'setting'].includes(i))) add('setting');
    if (kinds.includes('tag-set') && !what) add('looks');
  }
  if (item.fan_setting) ids.push('fan');
  if (item.fictional) ids.push('fictional');
  const needs = (item.requires ?? []).length;
  if (needs) ids.push('needs');
  if (item.state === 'withdrawn') ids.push('withdrawn');
  if (item.state === 'draft') ids.push('draft');
  return make(ids, needs);
}

export interface V3BadgeInput { kind: string; auto_tags?: string[] | null; fan_setting?: string | null }

/** A V3 map's badges: V3, Campaign (a starmap) or System, Constructs if it carries any, Fan-made, Free. */
export function v3Badges(map: V3BadgeInput): ItemBadge[] {
  const ids: string[] = ['v3', 'free', map.kind === 'starmap' ? 'campaign' : 'system'];
  const tags = map.auto_tags ?? [];
  if (['ships', 'stations', 'megastructures', 'habitats'].some((t) => tags.includes(t))) ids.push('constructs');
  if (map.fan_setting) ids.push('fan');
  return make(ids);
}
