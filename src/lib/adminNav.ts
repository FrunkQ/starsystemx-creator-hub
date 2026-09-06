// THE STAFF AREAS, GROUPED BY CAPABILITY - and coloured by WHO WILL BE ABLE TO REACH THEM.
//
// ============================================================================================
// The owner, 2026-09-06: *"structure better on admin. perhaps use colour to differentiate between
// 'normal user' 'admin user' and 'moderators' - who will have access to a lot less. group by
// area/capability."*
//
// So the nav is DATA, not eight links in a row in the layout. Each area declares the group it
// belongs to and the lowest tier that may reach it, and the chrome draws that. Two consequences
// worth having:
//
//   1. The grouping and the colour say the same thing twice, which is the point. "Moderation" is
//      the work of watching what people post; "Running the place" is the work of owning the
//      server. A moderator gets the first and none of the second.
//   2. The role arrived the day after this file was written, and it cost the enum value and
//      nothing here: the tiers were already declared, so `visibleTo` became a real answer rather
//      than a drawing of one.
//
// **THE MODERATOR ROLE EXISTS** as of migration 0028 (D-39). The owner named the areas himself:
// tag review, review, comments, explorers, reports - "Running the place = just admin."
// ============================================================================================

/** Who can reach an area. `moderator` is the smaller set, and is a subset of what an admin sees. */
export type StaffTier = 'moderator' | 'admin';

/**
 * The three kinds of staff work. The group IS the explanation; do not add a fourth without one.
 *
 * DEBUG IS ITS OWN GROUP, between the other two (owner, 2026-09-06: "Debug is its own category
 * between moderation & running the place - also does debug parse crash files too?"). It is neither:
 * a debug upload is a file somebody's app CHOKED on, sent in to be looked at. It is not the
 * library's content and it is not the server's housekeeping - it is raw, unreviewed bytes from
 * outside, which is why it also gets its own colour rather than sharing one.
 */
export type StaffGroup = 'Moderation' | 'Debug' | 'Running the place';

export interface AdminArea {
  href: string;
  label: string;
  group: StaffGroup;
  tier: StaffTier;
  /** The key in `AdminCounts` this area's badge reads, when it has one. */
  count?: keyof AdminCounts;
  /** What the badge means, for the title attribute. A number with no noun is a puzzle. */
  countNoun?: string;
}

/** Outstanding work, counted where it lives. Null means "could not be counted", never zero. */
export interface AdminCounts {
  review: number | null;
  reports: number | null;
  debug: number | null;
  tags: number | null;
}

export const EMPTY_COUNTS: AdminCounts = { review: null, reports: null, debug: null, tags: null };

/**
 * The areas, in the order they are worth looking at within their group.
 *
 * MODERATION IS FIRST because it is the work that has a queue: a report sat on is a person waiting,
 * and a tag waiting is a creator who cannot describe their map yet. Running the place is mostly
 * read-only and mostly the owner's.
 */
export const ADMIN_AREAS: AdminArea[] = [
  { href: '/admin/tags', label: 'Tag review', group: 'Moderation', tier: 'moderator', count: 'tags', countNoun: 'tags waiting to be reviewed' },
  { href: '/admin/review', label: 'Review', group: 'Moderation', tier: 'moderator', count: 'review', countNoun: 'pictures waiting to be reviewed' },
  { href: '/admin/reports', label: 'Reports', group: 'Moderation', tier: 'moderator', count: 'reports', countNoun: 'reports still open' },
  { href: '/admin/comments', label: 'Comments', group: 'Moderation', tier: 'moderator' },
  { href: '/admin/explorers', label: 'Explorers', group: 'Moderation', tier: 'moderator' },

  { href: '/admin/debug', label: 'Debug', group: 'Debug', tier: 'admin', count: 'debug', countNoun: 'debug uploads kept' },

  { href: '/admin/stats', label: 'Usage', group: 'Running the place', tier: 'admin' },
  { href: '/admin/backup', label: 'Backups', group: 'Running the place', tier: 'admin' },
  { href: '/admin/config', label: 'Config', group: 'Running the place', tier: 'admin' }
];

/**
 * EXPLORERS IS MODERATION, decided by the owner (2026-09-06), and the earlier reading here - that
 * ending an account is not the same job as removing a picture - survives as one exception rather
 * than a whole area: a moderator reaches the page and every action on it that can be UNDONE
 * (suspend, ban, reinstate, remove comments, take a map down, put it back). DELETING an account,
 * and handing out the moderator role itself, stay with the owner, because neither has a way back.
 * That split lives in `routes/admin/explorers/[handle]/+page.server.ts` (`staff` vs `ownerOnly`).
 *
 * "Gates" WAS THE LABEL until the owner said the obvious (2026-09-06): *"Gates - is not a great
 * title - its 'config' surely?"* The route was `/admin/config` all along.
 */
export const GROUPS: StaffGroup[] = ['Moderation', 'Debug', 'Running the place'];

/** What a person of this tier may reach. An admin reaches everything a moderator does, and more. */
export function visibleTo(tier: StaffTier): AdminArea[] {
  return tier === 'admin' ? ADMIN_AREAS : ADMIN_AREAS.filter((a) => a.tier === 'moderator');
}

export const areasIn = (group: StaffGroup, areas: AdminArea[] = ADMIN_AREAS): AdminArea[] =>
  areas.filter((a) => a.group === group);

/** The number on an area's badge: a positive count, or null for no badge at all. */
export function badgeFor(area: AdminArea, counts: AdminCounts): number | null {
  if (!area.count) return null;
  const n = counts[area.count];
  return typeof n === 'number' && n > 0 ? n : null;
}

/**
 * The one number the banner carries, so a page that is not the admin still says there is work.
 *
 * DEBUG UPLOADS ARE DELIBERATELY NOT IN IT. They are kept files, not a queue: the count is how
 * much is stored, and a banner badge that never reaches zero teaches people to stop reading it.
 * Only the real queues count - tags and pictures waiting, and reports still open.
 */
export function outstanding(counts: AdminCounts): number {
  return (counts.review ?? 0) + (counts.reports ?? 0) + (counts.tags ?? 0);
}

/** Badges over this are shown as "99+": the exact number stops mattering long before then. */
export const BADGE_MAX = 99;
export const badgeLabel = (n: number): string => (n > BADGE_MAX ? BADGE_MAX + '+' : String(n));
