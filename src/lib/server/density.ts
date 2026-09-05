// What a 5 means today: the best raw information-density score among public maps (D-30).
import type { Db } from './database.types';

/** Null before migration 0023, on an empty library, or when nothing has been measured yet. */
export async function bestDensity(sb: Db): Promise<number | null> {
  const { data, error } = await sb.from('systems').select('info_density')
    .eq('state', 'public').eq('visibility', 'public')
    .not('info_density', 'is', null)
    .order('info_density', { ascending: false }).limit(1).maybeSingle();
  if (error || !data) return null;
  return typeof data.info_density === 'number' ? data.info_density : null;
}
