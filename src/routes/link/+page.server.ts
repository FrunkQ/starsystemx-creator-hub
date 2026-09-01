// Approving a pairing code. THIS PAGE IS THE ENTIRE SECURITY BOUNDARY of device pairing.
//
// A user_code is short and gets read aloud, so it must be worthless on its own - and it is, because
// turning one into a token requires a signed-in session here, and a person deliberately confirming.
import type { PageServerLoad, Actions } from './$types';
import { error, fail, redirect } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { loadGates } from '$lib/server/config';
import { describe, approve } from '$lib/server/devicePairing';
import * as audit from '$lib/server/audit';

export const load: PageServerLoad = async ({ platform, locals, url }) => {
  const env = platform?.env;
  if (!env?.SUPABASE_URL) throw error(500, 'not configured');

  const gates = await loadGates(db(env));
  if (!gates.device_pairing_enabled) throw error(404, 'Not found');

  // Signing in is required BEFORE anything is shown, so an unauthenticated visitor cannot probe
  // which codes are live.
  if (!locals.viewer) redirect(303, '/login?next=' + encodeURIComponent(url.pathname + url.search));

  const prefill = (url.searchParams.get('code') ?? '').slice(0, 12);
  const pending = prefill ? await describe(db(env), prefill) : null;

  return { prefill, pending };
};

export const actions: Actions = {
  default: async ({ request, platform, locals }) => {
    const env = platform?.env;
    if (!env?.SUPABASE_URL) throw error(500, 'not configured');
    if (!locals.viewer) throw error(401, 'Sign in first.');

    const sb = db(env);
    const gates = await loadGates(sb);
    if (!gates.device_pairing_enabled) throw error(404, 'Not found');

    const code = String((await request.formData()).get('code') ?? '');
    if (!code.trim()) return fail(400, { message: 'Enter the code shown in Star System Explorer.' });

    const ok = await approve(sb, code, locals.viewer.id);
    if (!ok) {
      // One message for every failure. Distinguishing "no such code" from "already approved" turns
      // this form into a way to probe which codes exist.
      return fail(400, {
        message: 'That code is not valid. It may have expired, or already been used - the app will show a new one.'
      });
    }

    await audit.record(sb, locals.viewer.id, 'device.approve', 'user_code:' + code.trim().toUpperCase());
    return { approved: true };
  }
};
