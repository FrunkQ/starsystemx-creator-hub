// Sign out. POST only.
//
// A GET logout can be triggered by any image tag or link on another site, which is a small but
// real nuisance vector - so the sign-out control is a form, not a link.
import type { RequestHandler } from './$types';
import { redirect } from '@sveltejs/kit';
import { clearSession } from '$lib/server/session';

export const POST: RequestHandler = async ({ cookies }) => {
  clearSession(cookies);
  redirect(303, '/');
};
