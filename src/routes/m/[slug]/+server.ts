// `/m/<slug>` is the page path the engine's `hub/hubConfig.ts` still carries; the page is `/s/<slug>`.
//
// The one-token fix belongs in the engine and has been asked for. This redirect exists so that a
// link built by an app that has not caught up still lands on the map instead of a 404 - a hub whose
// product is link-sharing does not get to be strict about a path it once described differently.
import type { RequestHandler } from './$types';
import { redirect } from '@sveltejs/kit';

export const GET: RequestHandler = ({ params }) => {
  throw redirect(308, '/s/' + encodeURIComponent(params.slug));
};
