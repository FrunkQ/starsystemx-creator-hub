// THE SELLER DECLARATION (paid packs, PP1; design section 5). One string, shared by the form and the
// record, for the same reason as the provenance attestation (attestation.ts): the words a seller
// was shown and the words stored against their answer must be the SAME STRING, and the version is
// stored with each answer so an old record still says what was on the screen.
//
// It covers what a machine cannot check (mayCarryPrice.ts covers what it can).

/** Bumped whenever the wording changes. */
export const SELLER_DECLARATION_VERSION = 1;

export const SELLER_DECLARATION_POINTS: readonly string[] = [
  'Everything in what I sell is my own work, or licensed to me for sale.',
  'None of it is based on anyone else\'s setting, and none of it is fan work.',
  'It contains nothing under a non-commercial licence.',
  'I grant Explorers a non-exclusive right to sell it to buyers on my behalf. I keep my copyright, and I may also sell or give it away anywhere else.',
  'I am responsible for my own income tax on what I am paid.',
  'If a sale is refunded or a listing is taken down, the money comes back out of my balance.'
];

export const SELLER_DECLARATION_TEXT = SELLER_DECLARATION_POINTS.join(' ');

/** Under the checkbox: what the site promises back, in the same plain register. */
export const SELLER_DECLARATION_NOTE =
  'Free is always free here. Selling is optional, never exclusive, and the split is shown to every ' +
  'buyer before they pay. The site\'s share pays for hosting, so that everyone else can share free work at no charge.';
