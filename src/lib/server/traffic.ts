// Traffic counting, so the usage page can say how close the hub is to the free tiers.
//
// ============================================================================================
// WHAT COSTS MONEY, and therefore what is counted (owner, 2026-09-04: "so we can determine
// roughly how close we are getting to the account limits and when it's going to cost me"):
//
//   Workers    requests per DAY (100,000 free). Every dynamic request - pages, API, assets served
//              through the ledger, downloads. Static files (`/_app/*`) are served by Cloudflare
//              before the Worker runs and are not billed, so they never reach this code.
//   R2         storage (10 GB free), class A operations = writes (1M/month), class B = reads
//              (10M/month). Reads are approximated by asset and download requests; writes by
//              novel assets and bundles stored. R2 EGRESS IS FREE, and so is Cloudflare bandwidth.
//   Supabase   database size (500 MB free) and egress (5 GB/month), which the hub cannot measure
//              from here - it is the traffic between Postgres and the Worker, not to the visitor.
//
// Bytes served are counted anyway, because "data transfer" is what the owner asked to watch and
// because growth in it predicts growth in everything else.
//
// HOW IT IS COUNTED WITHOUT COSTING MORE THAN IT MEASURES. One database write per request would
// double the Supabase traffic to count the Supabase traffic. So counts accumulate in this isolate
// and are flushed in one RPC every twenty requests or forty-five seconds, whichever comes first.
// An isolate that is evicted before its flush loses at most that much - a rounding error against a
// daily limit, and this is a gauge, not a ledger.
// ============================================================================================
import type { Db } from './database.types';

export type Category = 'page' | 'api' | 'asset' | 'download' | 'other';

export function categoryOf(pathname: string): Category {
  if (pathname.startsWith('/asset/') || pathname.startsWith('/private/asset/')) return 'asset';
  if (pathname.startsWith('/api/download/')) return 'download';
  if (pathname.startsWith('/api/')) return 'api';
  if (pathname.startsWith('/_app/') || pathname === '/favicon.ico' || pathname === '/robots.txt') return 'other';
  return 'page';
}

interface Bucket { day: string; category: Category; requests: number; bytes: number }

const FLUSH_EVERY_REQUESTS = 20;
const FLUSH_EVERY_MS = 45_000;

export class TrafficCounter {
  private pending = new Map<string, Bucket>();
  private since = Date.now();
  private count = 0;

  record(category: Category, bytes: number, now = new Date()): void {
    const day = now.toISOString().slice(0, 10);
    const key = day + '|' + category;
    const b = this.pending.get(key) ?? { day, category, requests: 0, bytes: 0 };
    b.requests += 1;
    b.bytes += Math.max(0, bytes | 0);
    this.pending.set(key, b);
    this.count += 1;
  }

  /** True when enough has accumulated to be worth a round trip. */
  due(now = Date.now()): boolean {
    return this.count >= FLUSH_EVERY_REQUESTS || (this.count > 0 && now - this.since >= FLUSH_EVERY_MS);
  }

  /** Hand back what has accumulated and reset. */
  drain(now = Date.now()): Bucket[] {
    const rows = [...this.pending.values()];
    this.pending.clear();
    this.count = 0;
    this.since = now;
    return rows;
  }
}

/** The one counter for this isolate. */
export const counter = new TrafficCounter();

/** Flush when due. Fire and forget: counting must never slow or fail a response. */
export function flushIfDue(
  sb: Db, ctx: { waitUntil?: (p: Promise<unknown>) => void } | undefined, force = false
): void {
  if (!force && !counter.due()) return;
  const rows = counter.drain();
  if (!rows.length) return;
  const p = Promise.resolve(sb.rpc('bump_traffic', { p_rows: rows })).then(() => undefined, () => undefined);
  if (ctx?.waitUntil) ctx.waitUntil(p);
}
