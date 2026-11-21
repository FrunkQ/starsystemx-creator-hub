-- Paid packs: the master switch and its settings (owner, 2026-11-21; design SSE4-explorers-paid-packs.md
-- sections 1a, 3.4, 11; D-94). Run after 0041. Safe to run twice. ADDS ROWS TO `config` ONLY.
--
-- The code already falls back to exactly these values when a row is absent (src/lib/server/config.ts),
-- so running this changes nothing anyone sees. What it adds is the ability to CHANGE them from the
-- admin Config page: the page can only set a row that exists (setConfigRow refuses to invent one).
--
-- THE SWITCH IS OFF. `paid_packs` must be a literal true to turn anything on; while it is false every
-- money route is a 404 and no price, buy button or seller page is drawn for anyone.
insert into config (key, value, note) values
  ('paid_packs', 'false'::jsonb,
   'THE MASTER SWITCH for paid packs (D-94). false = off: no price, buy button, seller page or payment route exists for anyone. true = on (test mode until live keys are set). Only a literal true turns it on.'),
  ('paid_packs_sell_eu', 'false'::jsonb,
   'Sell to buyers in the EU. Leave false until the EU VAT One Stop Shop (non-Union scheme) registration exists: there is no small-seller threshold for a UK business. Independent of paid_packs.'),
  ('paid_packs_site_share_bp', '2000'::jsonb,
   'The site''s share of what is left after VAT and card fees, in basis points (2000 = 20%). The creator gets the rest.'),
  ('paid_packs_min_price_pence', '200'::jsonb,
   'The lowest price a seller may set, in pence (200 = £2.00). Below £2 the fixed card fee eats a quarter of the sale.'),
  ('paid_packs_price_steps', '[300, 500, 800]'::jsonb,
   'Prices offered as the usual steps, in pence. Any price at or above the minimum is still allowed.'),
  ('paid_packs_payout_floor_pence', '2500'::jsonb,
   'A creator is paid out monthly once owed at least this much, in pence (2500 = £25).'),
  ('paid_packs_hold_days', '30'::jsonb,
   'Days a creator''s share is held after a sale before it counts toward a payout (the refund window).')
on conflict (key) do nothing;
