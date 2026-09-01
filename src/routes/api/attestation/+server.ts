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
  // Cacheable, but not for long: a wording change should reach apps within the hour.
  setHeaders({ 'cache-control': 'public, max-age=3600', ...PUBLIC_CORS });
  return json({
    version: ATTESTATION_TEXT_VERSION,
    text: ATTESTATION_TEXT,
    note: ATTESTATION_NOTE
  });
};

export const OPTIONS: RequestHandler = async () => preflight();
