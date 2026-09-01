// The attestation wording, fetchable.
//
// WHY THIS EXISTS: the app must show the SAME text the hub stores against the answer. If the app
// copies the words into its own source, the two drift on the first wording change - and a stored
// record that does not match what was shown stops being evidence of anything.
//
// No credentials. It is public text.
import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { ATTESTATION_TEXT, ATTESTATION_NOTE, ATTESTATION_TEXT_VERSION } from '$lib/attestation';
import { PUBLIC_CORS, preflight } from '$lib/server/cors';

export const GET: RequestHandler = async ({ setHeaders }) => {
  // FIVE MINUTES, not an hour. This is small static text, so the saving from a long cache is
  // negligible - and the cost is real: a stale copy at the edge outlives a fix by its full max-age,
  // which is exactly what happened when CORS was added (a pre-fix copy kept being served with
  // Age: 324 while the corrected one sat behind it). Short cache, fast correction.
  setHeaders({ 'cache-control': 'public, max-age=300', ...PUBLIC_CORS });
  return json({
    version: ATTESTATION_TEXT_VERSION,
    text: ATTESTATION_TEXT,
    note: ATTESTATION_NOTE
  });
};

export const OPTIONS: RequestHandler = async () => preflight();
