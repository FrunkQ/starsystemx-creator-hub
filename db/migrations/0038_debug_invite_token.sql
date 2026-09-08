-- A debug link can be copied again while it is still live (owner, 2026-09-09; D-74).
-- Run after 0037. Safe to run twice.
--
-- The owner, looking at a freshly made link: "That is not a very easily pastable link. I should be
-- able to re-copy it from the Links list below."
--
-- 0013 stored only `token_hash` and said so on the page: "only its fingerprint is stored, so it
-- cannot be shown again." That is the right instinct in general and the wrong trade HERE, and it is
-- worth writing down why rather than just reversing it.
--
-- WHAT THE HASH WAS PROTECTING AGAINST: somebody who can read this table using a live link to
-- upload a file. But reading this table means the service role, which is the Worker itself or the
-- owner - and anybody holding it can already create their own invite, read every stored campaign
-- and delete the lot. The fingerprint pattern is load-bearing in the asset ledger (where the bytes
-- decide) and in device pairing (where the code is the credential); here it defended a door that is
-- behind a wall that was already down.
--
-- WHAT IT COST: exactly what the owner hit. You are shown a token once, in a form you cannot paste,
-- and if you lose it the only remedy is to make another and leave the first one lying around live
-- until it expires. The link is emailed to an outsider in plaintext anyway - that is its whole
-- purpose - so the hub holding a copy of something already sitting in somebody's inbox is not the
-- weak link.
--
-- THE TOKEN IS CLEARED THE MOMENT THE LINK IS SPENT, which is the part that keeps this tidy: a used
-- link is dead, and a dead link that still shows a token invites somebody to try it. `used_at` and
-- this column are set in the same write. An EXPIRED link keeps its token harmlessly, because expiry
-- is enforced at validation and the row will be gone within the retention window either way.
--
-- LOOKUP IS UNCHANGED. `usableInvite` still matches on `token_hash`, so nothing about how a link is
-- validated moves - this column is for showing the admin what they already sent.
alter table public.debug_invites add column if not exists token text;

comment on column public.debug_invites.token is
  'The link token in plaintext, so an admin can copy it again while the link is still live. '
  'Cleared when the link is used. Validation still goes through token_hash.';
