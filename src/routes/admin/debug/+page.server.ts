import type { PageServerLoad, Actions } from './$types';
import { error, fail } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { loadGates } from '$lib/server/config';
import { createInvite } from '$lib/server/debugUploads';
import * as audit from '$lib/server/audit';

export const load: PageServerLoad = async ({ platform, locals }) => {
  const env = platform?.env;
  if (!env) throw error(500, 'not configured');
  if (locals.viewer?.role !== 'admin') throw error(404, 'Not found');

  const sb = db(env);
  const gates = await loadGates(sb);

  const [{ data: invites }, { data: uploads }] = await Promise.all([
    sb.from('debug_invites').select('id, note, created_at, expires_at, used_at')
      .order('created_at', { ascending: false }).limit(20),
    sb.from('debug_uploads').select('id, filename, byte_size, user_note, uploaded_at, invite_id')
      .order('uploaded_at', { ascending: false }).limit(50)
  ]);

  return {
    invites: invites ?? [],
    uploads: uploads ?? [],
    retentionDays: gates.debug_retention_days
  };
};

export const actions: Actions = {
  create: async ({ request, platform, locals }) => {
    const env = platform?.env;
    if (!env || locals.viewer?.role !== 'admin') throw error(404, 'Not found');

    const sb = db(env);
    const gates = await loadGates(sb);
    if (!gates.debug_uploads_enabled) return fail(400, { message: 'Debug links are switched off.' });

    const note = String((await request.formData()).get('note') ?? '');
    const invite = await createInvite(sb, locals.viewer.id, note, gates.debug_invite_ttl_hours);
    await audit.record(sb, locals.viewer.id, 'debug.invite.create', 'invite:' + invite.id, note);

    // The plaintext token is returned ONCE and never stored. If it is lost, make another.
    return { created: true, token: invite.token, expiresAt: invite.expiresAt };
  },

  remove: async ({ request, platform, locals }) => {
    const env = platform?.env;
    if (!env || locals.viewer?.role !== 'admin') throw error(404, 'Not found');

    const sb = db(env);
    const id = String((await request.formData()).get('id') ?? '');

    // Delete the BYTES first. A row without an object is a tidy-up; an object without a row is an
    // unredacted campaign nobody can see to delete.
    const { data: row } = await sb.from('debug_uploads').select('storage_key').eq('id', id).maybeSingle();
    if (row?.storage_key) await env.HUB_BUNDLES.delete(row.storage_key);
    await sb.from('debug_uploads').delete().eq('id', id);

    await audit.record(sb, locals.viewer.id, 'debug.upload.delete', 'upload:' + id);
    return { deleted: true };
  }
};
