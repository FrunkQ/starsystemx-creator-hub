import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';
import { db } from '$lib/server/db';

// ONE PAGE UPLOADS A NEW MAP AND A NEW VERSION OF ONE. `?replaces=<id>` names the map being
// updated; the page then says so, sends `replaces` with the file, and the slug - the address
// people have already shared - never changes (containment design, section 6).
//
// Ownership is checked here so the page can name the map, and again by the upload endpoint,
// which is the control. A wrong or foreign id is a 404: whose map an id is, is not a visitor's
// business.
export const load: PageServerLoad = async ({ url, platform, locals }) => {
  const id = url.searchParams.get('replaces');
  if (!id) return { replacing: null };

  const env = platform?.env;
  if (!env || !locals.viewer) throw error(401, 'Sign in first.');
  if (!/^[0-9a-f-]{36}$/.test(id)) throw error(404, 'Not found');

  const { data } = await db(env).from('systems')
    .select('id, title, slug, revision, state, creator_id').eq('id', id).maybeSingle();
  if (!data || data.creator_id !== locals.viewer.id) throw error(404, 'Not found');

  return {
    replacing: { id: data.id, title: data.title, slug: data.slug, revision: data.revision, state: data.state }
  };
};
