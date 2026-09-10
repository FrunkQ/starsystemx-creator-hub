// COUNTING A MAP LEAVING THE HUB, in one place (D-77).
//
// ============================================================================================
// The owner, 2026-09-10: *"Count clicking on 'copy a System' as a download - and open in SSE (prob
// does already)."*
//
// He was right about the second one: `?open=` fetches `/api/download/<slug>`, so it has always
// counted. The first one did not, and the reason it should is what this module is named after.
//
// THE NUMBER MEANS "SOMEBODY TOOK THIS MAP AWAY", not "somebody used the download button". A system
// cannot be opened in Star System Explorer - the engine refuses a single system through `?open=`
// (R-18) - so the hub offers Copy instead (D-56), and for those maps Copy IS the download. Counting
// only the button would make the busiest systems look like the least popular, purely because of a
// limitation in a different program.
//
// WHAT IS NOT COUNTED, and the line matters: copying ONE ROW out of a map is not taking the map. A
// row copy is somebody borrowing a planet, and folding those into the same number would turn a
// distribution count into a fiddling-about count - the cards sort on it, so it has to keep meaning
// one thing.
//
// EXTRACTED RATHER THAN COPIED. This was written out inline in the download route; a second copy in
// the copy route is two places to remember when the shape of the event changes.
// ============================================================================================
import type { Db } from './database.types';
import type { HubEnv } from './db';
import { visitorHash } from './visitor';

/**
 * Record that a map left the hub: bump the counter, and write the one row behind it.
 *
 * NEVER THROWS AND NEVER AWAITED BY THE CALLER'S CRITICAL PATH. A counter is not worth failing a
 * download over, and `download_events` predates nothing that would make its absence fatal - before
 * 0014 created the table this simply fails quietly.
 *
 * Pass `waitUntil` so the work outlives the response; without it the two writes are still made, they
 * just hold the request open a moment longer.
 */
export function countTakeaway(
  env: HubEnv,
  sb: Db,
  systemId: string,
  request: Request,
  waitUntil?: (p: Promise<unknown>) => void
): void {
  const run = (p: Promise<unknown>) => (waitUntil ? waitUntil(p) : void p);

  // The postgrest builder is a THENABLE, not a Promise - wrap it before attaching a catch, or the
  // rejection escapes and takes the request with it.
  run(Promise.resolve(sb.rpc('increment_download', { p_system_id: systemId }))
    .then(() => undefined, () => undefined));

  // The history behind the counter: one row per takeaway, carrying a week-scoped visitor hash and
  // nothing else - never an address (server/visitor.ts).
  run(visitorHash(request, env.VISITOR_SALT)
    .then((visitor_hash) => Promise.resolve(sb.from('download_events').insert({
      id: crypto.randomUUID(), system_id: systemId, visitor_hash
    })))
    .then(() => undefined, () => undefined));
}
