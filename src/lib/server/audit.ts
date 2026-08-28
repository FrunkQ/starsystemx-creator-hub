// An admin action is always recorded - who, what, when, why (design 6.7).
//
// Not bureaucracy: when a creator asks why their map vanished, the answer must exist. A hub that
// removes things silently loses the people it wants.
import type { Db } from './database.types';

export async function record(
  sb: Db,
  actorId: string | null,
  action: string,
  target: string,
  reason?: string,
  detail?: unknown
): Promise<void> {
  const { error } = await sb.from('admin_actions').insert({
    id: crypto.randomUUID(),
    actor_id: actorId,
    action,
    target,
    reason: reason ?? null,
    detail: detail ?? null
  });
  // An audit write that fails must not silently vanish, but it must also not roll back the action
  // it describes - a moderator who cannot ban because logging is down is worse than a gap in a log.
  if (error) console.error('AUDIT WRITE FAILED', { action, target, error: error.message });
}
