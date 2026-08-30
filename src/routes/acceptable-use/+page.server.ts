import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

// THERE IS NO SEPARATE ACCEPTABLE-USE DOCUMENT, DELIBERATELY.
//
// The owner's brief was "No formal AUP... it's just protective", and the rules live in the terms as
// the "Keep it tabletop-safe" section. A second page restating them would be a second thing to keep
// in step, and two documents that disagree about what is allowed is worse than one that is blunt.
//
// The link is kept because people look for it by that name; it lands on the section that answers it.
export const load: PageServerLoad = async () => {
  redirect(308, '/terms#keep-it-tabletop-safe');
};
