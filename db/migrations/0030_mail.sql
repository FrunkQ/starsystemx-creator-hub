-- The hub's own mail (D-49). Run after 0029. Safe to run twice.
--
-- The owner set SMTP in Supabase Auth and the password-reset test arrived, which proves the Resend
-- credentials and the domain. It does not give the hub a way to send its own mail - Supabase Auth
-- sends ITS templates to ITS users - so the hub calls Resend's API directly, and these two rows say
-- who it writes as and who it writes to.
--
-- THE KEY ITSELF IS A WORKER SECRET, never a row and never a file:
--   wrangler secret put RESEND_API_KEY
--
-- Both empty by default: with either one blank, nothing is sent and every surface that would have
-- sent something says so plainly rather than failing quietly.
insert into config (key, value, note)
values
  ('mail_from', '""'::jsonb,
   'The address the hub sends AS. Must be on the verified Resend domain, e.g. hub@starsystemx.com. Empty = the hub sends nothing.'),
  ('mail_admin', '""'::jsonb,
   'Where the hub writes TO: takedown notices from the contact form, and a nudge when the review queues have been waiting. Empty = nothing is sent.')
on conflict (key) do nothing;
