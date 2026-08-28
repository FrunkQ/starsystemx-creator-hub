// The upload gates (design 6.3). Every one reads a config row.
//
// THE PHILOSOPHY, and it runs through all of this: never stop the funnel, just look sooner. A gate
// here refuses an upload for a reason the creator can act on. Everything else - novel assets,
// suspicious patterns - is FLAGGED, not blocked, and moved to the front of the review queue (6.6).
import type { Db } from './database.types';
import type { Gates } from './config';
import type { Viewer } from './auth';

export interface GateRefusal { code: string; message: string }

/** Checks that can be made before a single byte is read. */
export async function checkPreflight(
  sb: Db, gates: Gates, viewer: Viewer, byteLength: number, isUpdate: boolean
): Promise<GateRefusal | null> {
  if (viewer.state !== 'active') {
    return { code: 'account', message: 'This account cannot upload at the moment.' };
  }

  if (byteLength > gates.max_bundle_bytes) {
    const mb = Math.floor(gates.max_bundle_bytes / (1024 * 1024));
    return { code: 'too-big', message: `That save is larger than the ${mb} MB the hub accepts.` };
  }

  if (gates.new_account_cooldown_hours > 0) {
    const { data } = await sb.from('creators').select('created_at').eq('id', viewer.id).maybeSingle();
    if (data?.created_at) {
      const ageHours = (Date.now() - Date.parse(data.created_at)) / 36e5;
      if (ageHours < gates.new_account_cooldown_hours) {
        return {
          code: 'cooldown',
          message: `New accounts can upload after ${gates.new_account_cooldown_hours} hours. Thanks for waiting.`
        };
      }
    }
  }

  // THE DAILY ALLOWANCE COUNTS NOVEL HASHES, NOT UPLOADS (design 6.3). An update to your own map
  // is inherently lower risk - same creator, mostly-known hashes - and a creator iterating on a map
  // would otherwise burn a day's allowance by lunchtime. An update that introduces nothing new is
  // free. This is checked again after hashing; here we only refuse someone already at the ceiling
  // with a non-update.
  if (!isUpdate) {
    const since = new Date(Date.now() - 24 * 36e5).toISOString();
    const { count } = await sb.from('upload_events')
      .select('id', { count: 'exact', head: true })
      .eq('creator_id', viewer.id).eq('is_update', false).gte('created_at', since);
    if ((count ?? 0) >= gates.uploads_per_user_per_day) {
      return {
        code: 'daily-limit',
        message:
          `You have reached today's upload limit of ${gates.uploads_per_user_per_day}. ` +
          'Updating a map you have already published does not count against it.'
      };
    }
  }

  return null;
}

/** THE KILL SWITCH (design 6.3). One check, and it collapses the abuse surface to text. */
export function checkZipsAllowed(gates: Gates, isZipBytes: boolean): GateRefusal | null {
  if (isZipBytes && !gates.zips_allowed) {
    return {
      code: 'zips-off',
      message:
        'The hub is only accepting plain .json saves at the moment. Save without assets and ' +
        'upload again - the map itself will work exactly the same.'
    };
  }
  return null;
}

export function checkAssetCount(gates: Gates, count: number): GateRefusal | null {
  if (count > gates.max_assets_per_bundle) {
    return {
      code: 'too-many-assets',
      message: `That save carries ${count} assets, more than the ${gates.max_assets_per_bundle} the hub accepts.`
    };
  }
  return null;
}

/**
 * The behavioural signal that matters most (design 6.6): a legitimate map reuses models and carries
 * a handful of pictures; an account uploading dozens of never-seen images is the pattern worth
 * flagging. NOT A REFUSAL - it returns whether to flag, and a flagged upload goes to the FRONT of
 * the review queue.
 */
export function shouldFlag(gates: Gates, novelCount: number, accountAgeHours: number): boolean {
  if (novelCount > gates.novel_hash_limit_per_upload) return true;
  // New account + immediate upload + all-novel assets. The classic shape.
  if (accountAgeHours < 24 && novelCount >= 5) return true;
  return false;
}
