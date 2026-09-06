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
//      server. A moderator will get the first and none of the second, and the nav shows the shape
//      of that BEFORE the role exists, so nobody has to imagine it.
//   2. Adding the role later is this file's `tier` becoming a real check, not a redesign.
//
// **THERE IS NO MODERATOR ROLE YET.** `creator_role` is `('user', 'admin')` (migration 0001), so
// today `visibleTo('admin')` returns everything and `visibleTo('moderator')` is what a moderator
// WOULD see - drawn, dimmed, in the admin's own view, so the decision can be made by looking at
// it. Creating the role is a migration and a decision about who moderates, which is the owner's.
// ============================================================================================

/** Who can reach an area. `moderator` is the smaller set, and is a subset of what an admin sees. */
export type StaffTier = 'moderator' | 'admin';

/** The two kinds of staff work. The group IS the explanation; do not add a third without one. */
export type StaffGroup = 'Moderation' | 'Running the place';

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
}

export const EMPTY_COUNTS: AdminCounts = { review: null, reports: null, debug: null };

/**
 * The areas, in the order they are worth looking at within their group.
 *
 * MODERATION IS FIRST because it is the work that has a queue: a report sat on is a person waiting.
 * Running the place is mostly read-only and mostly the owner's.
 */
export const ADMIN_AREAS: AdminArea[] = [
  { href: '/admin/review', label: 'Review', group: 'Moderation', tier: 'moderator', count: 'review', countNoun: 'pictures waiting to be reviewed' },
  { href: '/admin/reports', label: 'Reports', group: 'Moderation', tier: 'moderator', count: 'reports', countNoun: 'reports still open' },
  { href: '/admin/comments', label: 'Comments', group: 'Moderation', tier: 'moderator' },
  { href: '/admin/explorers', label: 'Explorers', group: 'Moderation', tier: 'admin' },

  { href: '/admin/stats', label: 'Usage', group: 'Running the place', tier: 'admin' },
  { href: '/admin/backup', label: 'Backups', group: 'Running the place', tier: 'admin' },
  { href: '/admin/config', label: 'Gates', group: 'Running the place', tier: 'admin' },
  { href: '/admin/debug', label: 'Debug', group: 'Running the place', tier: 'admin', count: 'debug', countNoun: 'debug uploads kept' }
];

/**
 * WHY `explorers` IS ADMIN AND NOT MODERATION, since it is the one that looks arguable: suspending,
 * banning and DELETING a person is not the same job as removing a picture or a comment. The first
 * ends somebody's account and their maps; the second takes one thing down and can be undone. A
 * moderator watches the content; the account is the owner's to end.
 */
export const GROUPS: StaffGroup[] = ['Moderation', 'Running the place'];

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
 * Only the two real queues count - pictures waiting, and reports still open.
 */
export function outstanding(counts: AdminCounts): number {
  return (counts.review ?? 0) + (counts.reports ?? 0);
}

/** Badges over this are shown as "99+": the exact number stops mattering long before then. */
export const BADGE_MAX = 99;
export const badgeLabel = (n: number): string => (n > BADGE_MAX ? BADGE_MAX + '+' : String(n));
