// MAY THIS CARRY A PRICE? (paid packs, PP1; design section 7 and 8; owner's ruling 2026-11-21:
// "fan work based on other people's settings cannot be monetised", and a price is blocked on
// anything using content that is not the seller's own.)
//
// ============================================================================================
// THE SITE REFUSES THE PRICE ITSELF rather than relying on people reading the rules. Every reason
// comes back NAMED, with the files or values that caused it, so the price box can say exactly what
// to change - the same as the provenance gate names the pictures that block publishing.
//
// ALL REASONS, NOT THE FIRST ONE. A creator fixing one refusal at a time, only to meet the next,
// is a creator who gives up. The verdict lists every reason at once.
//
// WHAT A MACHINE CANNOT CHECK is covered by the seller declaration (declaration.ts) and by a
// moderator looking before the first sale (PP6). This file is the part a machine can check.
//
// IT DOES NOT TRUST A STAMP. Every input here is read from the uploaded file or the hub's own
// records, and the file's claims only ever make a refusal MORE likely: a licence field that says
// "non-commercial" refuses, a blank one refuses, and only a positive, commercial-compatible answer
// passes. The hub's rule that "metadata makes a label certain, never a gate" (sse-integration-spec)
// holds because nothing here OPENS on a claim; it can only close.
// ============================================================================================
import type { AttributionEntry } from '$lib/bundle/attribution';
import { noProvenance } from '$lib/bundle/attribution';
import { cleanSetting } from '$lib/fanWork';

/** Why a price was refused. The code is for tests and the audit log; `message` is shown to the creator. */
export type PriceRefusalCode =
  | 'fan-work'
  | 'fan-work-marked'
  | 'includes-fan-pack'
  | 'non-commercial-licence'
  | 'permission-not-commercial'
  | 'uncredited-asset'
  | 'non-commercial-catalogue'
  | 'others-work';

export interface PriceRefusal {
  code: PriceRefusalCode;
  message: string;
  /** What caused it: asset paths, catalogue names, credited works, pack ids. Empty for a whole-item reason. */
  items: string[];
}

/** One run of catalogued values the item still carries (design section 8): which catalogue, how many values. */
export interface CatalogueUse {
  catalogue: string;
  count: number;
}

/** Another work the item says it includes (systems.content_credits, read from the save). */
export interface IncludedWork {
  title: string;
  /** The hub handle of whoever made it, or null when the credit does not say. */
  creator: string | null;
}

/** A pack this item includes or requires as part of what is sold. */
export interface IncludedPack {
  id: string;
  fanWork: boolean;
}

export interface PriceCheckInput {
  /** The hub handle of the person setting the price. */
  sellerHandle: string;
  /** The fan-work field: the setting this is based on (fanWork.ts). Null or empty = the seller's own universe. */
  fanSetting: string | null | undefined;
  /** A moderator has marked it as fan work, whatever the field says. */
  markedFanWork?: boolean;
  /** Every carried asset and its recorded provenance (collectAttributions). */
  assets: AttributionEntry[];
  /** Catalogued values still in the item, by catalogue (empty when exported by reference). */
  catalogues?: CatalogueUse[];
  /** Works by others that this one includes (content credits). */
  includes?: IncludedWork[];
  /** Packs sold with it or required by it as part of the sale. */
  packs?: IncludedPack[];
}

export interface PriceVerdict {
  mayCarryPrice: boolean;
  reasons: PriceRefusal[];
}

/**
 * Catalogues whose terms forbid commercial use, or are not yet confirmed to allow it (design
 * section 8: Gaia is CC BY-NC 3.0 IGO; CNS5 and AT-HYG are treated as non-commercial until the
 * citations thread confirms them at source). Matched without regard to case or punctuation.
 */
export const NON_COMMERCIAL_CATALOGUES = ['gaia', 'cns5', 'at-hyg', 'athyg'];

const squash = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

export function isNonCommercialCatalogue(name: string): boolean {
  const n = squash(name);
  return NON_COMMERCIAL_CATALOGUES.some((c) => n.startsWith(squash(c)));
}

/**
 * A licence that forbids commercial use: any CC NC variant, or one that says so in words -
 * including the negations people actually write ("not for commercial use", "no commercial use").
 */
export function isNonCommercialLicence(licence: string): boolean {
  return /(^|[^a-z])nc([^a-z]|$)/i.test(licence)
    || /non[\s-]?commercial/i.test(licence)
    || /\b(not|no)\s+(for\s+)?(any\s+)?commercial/i.test(licence);
}

/**
 * "Used with permission" passes only when it also says the permission covers commercial use.
 * A permission to SHARE is not a permission to SELL.
 */
export function isPermissionWithoutCommercial(licence: string): boolean {
  if (!/permission/i.test(licence)) return false;
  return !/commercial/i.test(licence) || isNonCommercialLicence(licence);
}

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

export function mayCarryPrice(input: PriceCheckInput): PriceVerdict {
  const reasons: PriceRefusal[] = [];

  // 1. FAN WORK. The field the hub already asks (D-61). Filled in at all means it is someone
  //    else's setting, and that can never be sold - not as a price, a tip, a tier or a bundle.
  const setting = cleanSetting(input.fanSetting);
  if (setting) {
    reasons.push({
      code: 'fan-work',
      message: `This is fan work based on ${setting}. Fan work can be shared here for free, but it can never carry a price.`,
      items: [setting]
    });
  } else if (input.markedFanWork) {
    reasons.push({
      code: 'fan-work-marked',
      message: 'A moderator has marked this as fan work based on someone else\'s setting, so it cannot carry a price.',
      items: []
    });
  }

  const fanPacks = (input.packs ?? []).filter((p) => p.fanWork).map((p) => p.id);
  if (fanPacks.length) {
    reasons.push({
      code: 'includes-fan-pack',
      message: `A paid item cannot include or require fan work as part of what is sold: ${fanPacks.join(', ')}.`,
      items: fanPacks
    });
  }

  // 2. LICENCES. Every carried asset already has its provenance recorded; the price adds one
  //    question to each: may this be SOLD?
  const nc: string[] = [];
  const permission: string[] = [];
  const uncredited: string[] = [];
  for (const a of input.assets) {
    const licence = a.license ?? '';
    // An in-app screenshot of the seller's own map is the seller's own (C-07) - unless it claims a
    // licence, in which case the licence is read like any other.
    if (noProvenance(a) || (!licence.trim() && !a.capturedInApp)) uncredited.push(a.path);
    else if (licence && isNonCommercialLicence(licence)) nc.push(a.path);
    else if (licence && isPermissionWithoutCommercial(licence)) permission.push(a.path);
  }
  if (nc.length) {
    reasons.push({
      code: 'non-commercial-licence',
      message: `${nc.length} ${plural(nc.length, 'picture or model has', 'pictures or models have')} a non-commercial licence, which forbids selling it. Replace ${plural(nc.length, 'it', 'them')} or keep this free.`,
      items: nc
    });
  }
  if (permission.length) {
    reasons.push({
      code: 'permission-not-commercial',
      message: `${permission.length} ${plural(permission.length, 'asset is', 'assets are')} "used with permission" without saying the permission covers selling. Record a commercial permission, or keep this free.`,
      items: permission
    });
  }
  if (uncredited.length) {
    reasons.push({
      code: 'uncredited-asset',
      message: `${uncredited.length} ${plural(uncredited.length, 'asset has', 'assets have')} no licence recorded. Something can only be sold when every part of it says whose it is and that it may be sold.`,
      items: uncredited
    });
  }

  // 3. CATALOGUE VALUES (design section 8). A paid pack may NEED the free real-sky pack but may not
  //    CONTAIN its data. SSE4 exports catalogued stars by reference; anything still carried as
  //    values from a non-commercial catalogue refuses the price, naming the catalogue.
  const cats = (input.catalogues ?? []).filter((c) => c.count > 0 && isNonCommercialCatalogue(c.catalogue));
  if (cats.length) {
    reasons.push({
      code: 'non-commercial-catalogue',
      message: `This still contains measured values from ${cats.map((c) => `${c.catalogue} (${c.count})`).join(', ')}, which may not be sold. A paid pack can require the free real-sky pack, but must refer to its stars rather than carry them.`,
      items: cats.map((c) => c.catalogue)
    });
  }

  // 4. OTHER PEOPLE'S WORK. A credit is the hub's own record that something came from somebody
  //    else's map (D-62, D-63). A credit with no creator, or someone else's handle, refuses.
  const seller = input.sellerHandle.trim().toLowerCase();
  const others = (input.includes ?? []).filter((w) => !w.creator || w.creator.trim().toLowerCase() !== seller);
  if (others.length) {
    reasons.push({
      code: 'others-work',
      message: `This includes work by other people (${others.map((w) => w.creator ? `${w.title} by ${w.creator}` : w.title).join('; ')}). Only your own work can carry a price.`,
      items: others.map((w) => w.title)
    });
  }

  return { mayCarryPrice: reasons.length === 0, reasons };
}
