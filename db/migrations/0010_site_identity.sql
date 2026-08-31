-- The site's own name and canonical URL, as config rows.
--
-- WHY CONFIG AND NOT CONSTANTS: the hub is going to move. It is on workers.dev now and will become
-- explorers.starsystemx.com, probably via a step or two in between - and each move must not need a
-- deploy to make link previews correct again.
--
-- THE URL IS NOT COSMETIC. Open Graph requires ABSOLUTE urls: a relative og:image is simply ignored
-- by Discord, Twitter and Facebook, so a shared link shows no picture. For a hub whose entire
-- product is link-sharing, that is the most expensive small bug available - and it was live until
-- this landed.
--
-- Leaving site_url empty is SAFE: the code falls back to the origin the request arrived on, so the
-- site works correctly on any host with no configuration at all. Setting it pins previews to the
-- canonical host during a transition, so a link shared from workers.dev still previews as the real
-- domain once that domain exists.

insert into config (key, value, note) values
  ('site_name', '"StarSystemX Explorers"',
   'Shown in page titles and the wordmark. A JSON string.'),
  ('site_url', '""',
   'Canonical absolute base URL, no trailing slash - e.g. "https://explorers.starsystemx.com". Empty = use whatever host the request came in on, which is correct for workers.dev and for local dev. Set it to pin Open Graph previews to the real domain during a URL transition.');
