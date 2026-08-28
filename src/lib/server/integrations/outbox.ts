// The outbound integration outbox.
//
// WHY THIS EXISTS RATHER THAN JUST CALLING DISCORD. Assigning a role is a network call to somebody
// else's service inside a request that is about to return a page. It will fail - rate limits,
// outages, a revoked token - and a fire-and-forget failure means a badge silently never arrives
// and nobody notices for a month.
//
// So the request writes an INTENT and returns. Delivery is separate, retryable, and idempotent.
//
// IDEMPOTENCE IS THE WHOLE TRICK: `dedupe_key` is unique, so re-deriving the same intent (which
// happens constantly - every publish re-checks the badge rules) queues nothing new.
import type { Db } from './../database.types';

export type OutboxKind = 'discord.role.add' | 'discord.role.remove';

export interface Intent {
  kind: OutboxKind;
  creatorId: string;
  payload: Record<string, unknown>;
  /**
   * Must be a pure function of the INTENT, never of the moment. Including a timestamp here would
   * defeat the whole mechanism by making every re-derivation look novel.
   */
  dedupeKey: string;
}

export async function enqueue(sb: Db, intent: Intent): Promise<void> {
  const { error } = await sb.from('integration_outbox').upsert(
    {
      id: crypto.randomUUID(),
      kind: intent.kind,
      creator_id: intent.creatorId,
      payload: intent.payload,
      dedupe_key: intent.dedupeKey,
      state: 'pending'
    },
    { onConflict: 'dedupe_key', ignoreDuplicates: true }
  );
  // An outbox write that fails must not take down the action that caused it. A missing badge is a
  // nuisance; a failed publish because a badge could not be queued is a broken product.
  if (error) console.error('OUTBOX ENQUEUE FAILED', { kind: intent.kind, error: error.message });
}

export async function claimPending(sb: Db, limit = 25) {
  const { data, error } = await sb.from('integration_outbox')
    .select('id, kind, creator_id, payload, attempts')
    .eq('state', 'pending')
    .order('created_at', { ascending: true })
    .limit(limit);
  if (error) throw new Error('outbox unreadable: ' + error.message);
  return data ?? [];
}

/** Give up after this many tries rather than retrying a permanently-broken intent forever. */
const MAX_ATTEMPTS = 6;

export async function markSent(sb: Db, id: string): Promise<void> {
  await sb.from('integration_outbox')
    .update({ state: 'sent', sent_at: new Date().toISOString() })
    .eq('id', id);
}

export async function markFailed(sb: Db, id: string, attempts: number, err: string): Promise<void> {
  await sb.from('integration_outbox').update({
    // `abandoned` rather than an endless `pending`: a queue that never drains hides the one entry
    // that actually needs a human to look at it.
    state: attempts + 1 >= MAX_ATTEMPTS ? 'abandoned' : 'pending',
    attempts: attempts + 1,
    last_error: err.slice(0, 500)
  }).eq('id', id);
}
