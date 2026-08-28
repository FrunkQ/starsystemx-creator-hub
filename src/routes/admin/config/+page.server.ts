import type { PageServerLoad, Actions } from './$types';
import { error, fail } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import * as audit from '$lib/server/audit';

export const load: PageServerLoad = async ({ platform, locals }) => {
  const env = platform?.env;
  if (!env) throw error(500, 'not configured');
  if (locals.viewer?.role !== 'admin') throw error(404, 'Not found');

  const { data } = await db(env).from('config').select('key, value, note, updated_at').order('key');
  return { rows: data ?? [] };
};

export const actions: Actions = {
  // A gate an admin relaxes takes effect on the next request. That is the whole point of putting
  // them in a table: a limit that needs a deploy to relax is a limit nobody relaxes (design 6.3).
  default: async ({ request, platform, locals }) => {
    const env = platform?.env;
    if (!env) throw error(500, 'not configured');
    if (locals.viewer?.role !== 'admin') throw error(404, 'Not found');

    const form = await request.formData();
    const key = String(form.get('key') ?? '');
    const raw = String(form.get('value') ?? '');

    let value: unknown;
    try {
      value = JSON.parse(raw);
    } catch {
      return fail(400, { key, message: 'That is not valid JSON. Use true, false, or a number.' });
    }

    const sb = db(env);
    const { error: e } = await sb.from('config')
      .update({ value, updated_by: locals.viewer.id, updated_at: new Date().toISOString() })
      .eq('key', key);
    if (e) return fail(500, { key, message: e.message });

    await audit.record(sb, locals.viewer.id, 'config.set', key, undefined, { value });
    return { ok: true, key };
  }
};
