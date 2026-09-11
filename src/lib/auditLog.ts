// THE LOG, IN WORDS (D-42). Turning `admin_actions` rows into something a person reads.
//
// ============================================================================================
// The owner, 2026-09-06, on giving somebody the moderator role: *"have admin get a list of all
// moderator actions in a log."*
//
// The rows have existed since migration 0001 - `audit.record` is called on every staff action, and
// `audit.ts` says why: *"when a creator asks why their map vanished, the answer must exist."* What
// did not exist was anywhere to READ them. A log nobody can open is a log nobody is accountable to,
// which is most of the value gone.
//
// WHY THE LABELS ARE HERE RATHER THAN IN THE PAGE. `creator.banned` and `asset.ban` are written by
// two different files and read by one; a page that de-dots slugs by hand ends up saying "creator
// banned" and "asset ban" side by side. And they are the thing most likely to be wrong - a slug
// this file has never heard of must still render as something, which is what the fallback is for
// and what a test pins.
// ============================================================================================

/** The families a filter offers. The names match the staff nav's (adminNav.ts) where they overlap. */
export type ActionGroup = 'Moderation' | 'Tags' | 'Accounts' | 'Running the place' | 'Other';

export const ACTION_GROUPS: ActionGroup[] = ['Moderation', 'Tags', 'Accounts', 'Running the place', 'Other'];

/**
 * What each action says, as a verb phrase that completes "<who> ___".
 *
 * Written out rather than derived, because the derivation reads worse than the words: `creator.banned`
 * is "banned", not "creator banned", and `comments.remove-all` is "removed every comment by".
 */
const LABELS: Record<string, { verb: string; group: ActionGroup }> = {
  // Pictures
  'asset.approve': { verb: 'approved a picture', group: 'Moderation' },
  'asset.ban': { verb: 'banned a picture', group: 'Moderation' },
  'asset.undo': { verb: 'put a picture back in the queue', group: 'Moderation' },
  // Comments
  'comment.remove': { verb: 'removed a comment', group: 'Moderation' },
  'comment.restore': { verb: 'restored a comment', group: 'Moderation' },
  'comments.remove-all': { verb: 'removed every comment by', group: 'Moderation' },
  // Reports
  'report.dismiss': { verb: 'dismissed a report', group: 'Moderation' },
  // Trust (D-78) is Accounts, not Moderation: it is about a person, not about a picture.
  'creator.trust': { verb: 'trusted an explorer - their pictures now go out on arrival', group: 'Accounts' },
  'creator.untrust': { verb: 'stopped trusting an explorer', group: 'Accounts' },
  'creator.resend-confirm': { verb: 'sent a confirmation email again', group: 'Accounts' },
  // Recorded because it is a DECISION, not a convenience: if the address turns out to be wrong,
  // the answer to "who decided that" has to exist (D-80).
  'creator.confirm': { verb: 'confirmed an email address for somebody', group: 'Accounts' },
  // Holding a map (D-79) IS a judgement about content, so it sits with the rest of moderation.
  'system.hold': { verb: 'put a map on hold', group: 'Moderation' },
  // Staff saw what the hub found wrong with a public map (D-88). Not a fix - only the creator can do that.
  'system.issues-noted': { verb: 'noted the problems the hub found in a map', group: 'Moderation' },
  'system.unhold': { verb: 'took a map off hold', group: 'Moderation' },
  // Takedowns (D-69). Moderation, so "only what a moderator can do" on /admin/log includes them -
  // which is the filter an admin uses to read what was decided on their behalf.
  'takedown.actioned': { verb: 'took material down after a claim', group: 'Moderation' },
  'takedown.rejected': { verb: 'rejected a takedown claim', group: 'Moderation' },
  'takedown.withdrawn': { verb: 'recorded a takedown claim as withdrawn', group: 'Moderation' },
  'takedown.reopen': { verb: 'reopened a takedown claim', group: 'Moderation' },
  // Maps
  'system.takedown': { verb: 'took down', group: 'Moderation' },
  'system.restore': { verb: 'restored', group: 'Moderation' },
  'system.publish': { verb: 'published', group: 'Other' },
  'system.unpublish': { verb: 'unpublished', group: 'Other' },
  // Tags
  'tag.accept': { verb: 'kept the tag', group: 'Tags' },
  'tag.merge': { verb: 'merged the tag', group: 'Tags' },
  'tag.reject': { verb: 'turned down the tag', group: 'Tags' },
  // People
  'creator.suspended': { verb: 'suspended', group: 'Accounts' },
  'creator.banned': { verb: 'banned', group: 'Accounts' },
  'creator.active': { verb: 'reinstated', group: 'Accounts' },
  'creator.role': { verb: 'changed the role of', group: 'Accounts' },
  'creator.delete': { verb: 'DELETED the account of', group: 'Accounts' },
  // Running the place
  'config.set': { verb: 'set', group: 'Running the place' },
  'backup.write': { verb: 'took a backup', group: 'Running the place' },
  'shipped.refresh': { verb: 'asked the engine what it ships', group: 'Running the place' },
  // No longer written - the batch it named was replaced by one map a request (D-87) - but rows
  // already in the log still have to read as something better than the fallback.
  'reindex.batch': { verb: 're-indexed the oldest maps from their stored files', group: 'Running the place' },
  'system.reindex': { verb: 're-read a map from its stored file', group: 'Running the place' },
  'mail.test': { verb: 'sent themselves a test email', group: 'Running the place' },
  'discord.test-share': { verb: 'posted a test to Discord', group: 'Running the place' },
  'debug.invite.create': { verb: 'made a debug upload link', group: 'Running the place' },
  'debug.upload.delete': { verb: 'deleted a debug upload', group: 'Running the place' },
  'debug.push': { verb: 'copied a map into the debug store', group: 'Running the place' },
  // Other people's doing, recorded here because it changes an account
  'identity.link': { verb: 'linked an account', group: 'Other' },
  'device.approve': { verb: 'approved a device', group: 'Other' },
  'entitlement.grant': { verb: 'was granted an entitlement', group: 'Other' },
  'entitlement.revoke': { verb: 'had an entitlement revoked', group: 'Other' }
};

/** A slug this file has never heard of still has to read as something. */
export function describeAction(action: string): { verb: string; group: ActionGroup } {
  const known = LABELS[action];
  if (known) return known;
  if (action.startsWith('patreon.')) return { verb: 'Patreon: ' + action.slice(8), group: 'Other' };
  // De-dot and de-hyphen, so a new action added by a later session is readable before anybody
  // remembers to add it here.
  return { verb: action.replace(/[.\-_]/g, ' '), group: 'Other' };
}

export type TargetKind =
  'creator' | 'system' | 'asset' | 'report' | 'takedown' | 'config' | 'tag' | 'comment' | 'unknown';

/**
 * What the action was done TO.
 *
 * Most targets carry their own prefix (`creator:`, `system:`, `sha256:`…). A comment's does not -
 * it is a bare id - so the ACTION supplies the kind. Inferring from the action rather than guessing
 * at the shape of a uuid is the difference between right and usually right.
 */
export function parseTarget(action: string, target: string): { kind: TargetKind; id: string } {
  const at = target.indexOf(':');
  if (at > 0) {
    const prefix = target.slice(0, at);
    const id = target.slice(at + 1);
    if (prefix === 'creator') return { kind: 'creator', id };
    if (prefix === 'system') return { kind: 'system', id };
    if (prefix === 'sha256') return { kind: 'asset', id };
    if (prefix === 'report') return { kind: 'report', id };
    if (prefix === 'takedown') return { kind: 'takedown', id };
    if (prefix === 'config') return { kind: 'config', id };
    if (prefix === 'tag') return { kind: 'tag', id };
  }
  if (action.startsWith('comment.')) return { kind: 'comment', id: target };
  if (action.startsWith('system.')) return { kind: 'system', id: target };
  return { kind: 'unknown', id: target };
}

/** A hash or a uuid, shortened for a table. The full value is in the row's title attribute. */
export const shortId = (id: string): string => (id.length > 12 ? id.slice(0, 8) + '…' : id);

/** Whether this row is one of the actions a moderator can take - the owner's actual question. */
export function isModeratorAction(action: string): boolean {
  const { group } = describeAction(action);
  return group === 'Moderation' || group === 'Tags' || group === 'Accounts';
}
