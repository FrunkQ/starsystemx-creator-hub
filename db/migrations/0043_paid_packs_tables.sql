-- Paid packs: the money tables, EMPTY (owner, 2026-11-21; design SSE4-explorers-paid-packs.md sections
-- 5, 6, 10, 11 package PP2). Run after 0042. Safe to run twice.
--
-- ============================================================================================
-- WHAT THIS DOES NOT TOUCH: every statement below creates something NEW. No existing table, column,
-- row or stored map is altered. Nothing writes to these tables until the master switch is on and
-- Stripe test keys are set, and the switch is off (0042).
--
-- LOCKED TO THE SERVER: row-level security ON and NO policies, the standing rule from 0003. Every
-- read and write goes through the Worker's service role; the browser's key reaches none of it.
--
-- RECORDS OUTLIVE ACCOUNTS. Tax law keeps a purchase for 6 years (10 for an EU sale), so nothing
-- here cascades from `creators` or `systems`: a deleted account or map sets its reference to null,
-- and the handle and title are copied in as TEXT so the record still reads afterwards (the same
-- reasoning as `takedowns`, 0036). The privacy page must say so before the switch goes on (PP8).
--
-- NOT STORED, BY DESIGN: card numbers, bank details, identity documents. Those are Stripe's. The site
-- holds Stripe's ids and the amounts, nothing more.
--
-- STATES ARE TEXT WITH A CHECK, not enums, so the file stays safe to run twice (`create type` is not).
-- MONEY IS WHOLE PENCE in `integer`, matching src/lib/paid/split.ts; nothing here is a float.
-- ============================================================================================

-- A SELLER: a creator who has set up payouts. Invitation only at first (design question 7).
create table if not exists seller_accounts (
  id                    uuid primary key,
  creator_id            uuid unique references creators (id) on delete set null,
  handle                text not null,
  -- Stripe Connect Express account id (acct_...). Stripe holds identity and bank details, not us.
  stripe_account_id     text unique,
  -- Stripe says the account can receive payouts. A listing cannot be bought until this is true.
  payouts_ready         boolean not null default false,
  country               text,
  -- The seller declaration they agreed to, by version (src/lib/paid/declaration.ts), and when.
  declaration_version   integer,
  declared_at           timestamptz,
  invited_by            uuid references creators (id) on delete set null,
  invited_at            timestamptz,
  -- Selling taken away (repeated disputes, a sale without the right to sell). The record stays.
  suspended_at          timestamptz,
  suspended_reason      text,
  created_at            timestamptz not null default now()
);

-- A PRICE ON AN ITEM. Maps and systems now; packs once pack shelves exist (TG15).
create table if not exists paid_listings (
  id                    uuid primary key,
  system_id             uuid unique references systems (id) on delete set null,
  title                 text not null,
  seller_account_id     uuid not null references seller_accounts (id),
  price_pence           integer not null check (price_pence > 0),
  currency              text not null default 'GBP' check (currency = 'GBP'),
  -- draft: priced, not yet looked at. review: waiting for a moderator (the first version of every
  -- paid item is checked before sale, design question 12). listed: on sale. delisted: off sale,
  -- with the reason; buyers keep what they bought.
  state                 text not null default 'draft' check (state in ('draft', 'review', 'listed', 'delisted')),
  -- The bundle content hash of the version a moderator approved for sale.
  approved_sha256       text,
  reviewed_by           uuid references creators (id) on delete set null,
  reviewed_at           timestamptz,
  delisted_reason       text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create index if not exists paid_listings_listed_idx on paid_listings (state) where state = 'listed';

-- A PURCHASE: one row per checkout. The split is stored as it was worked out at the time, so a
-- later change to the share or the fee schedule never rewrites a past receipt.
create table if not exists purchases (
  id                         uuid primary key,
  -- A human-readable order number for the receipt.
  order_no                   text unique not null,
  listing_id                 uuid references paid_listings (id) on delete set null,
  system_id                  uuid references systems (id) on delete set null,
  item_title                 text not null,
  item_sha256                text,
  buyer_id                   uuid references creators (id) on delete set null,
  buyer_handle               text not null,
  seller_account_id          uuid references seller_accounts (id) on delete set null,
  seller_handle              text not null,
  price_pence                integer not null check (price_pence > 0),
  vat_pence                  integer not null default 0,
  -- The buyer's country as Stripe Tax decided it (two letters), and the rate applied.
  vat_country                text,
  vat_bp                     integer,
  fee_pence                  integer not null default 0,
  creator_pence              integer not null default 0,
  site_pence                 integer not null default 0,
  site_share_bp              integer not null,
  -- Stripe's ids. Unique, so a replayed webhook finds the row it already wrote.
  stripe_checkout_session_id text unique,
  stripe_payment_intent_id   text unique,
  -- pending: checkout started. paid: money taken. refunded: given back. disputed: a chargeback is
  -- open. dispute_lost: the bank took it back.
  state                      text not null default 'pending'
                             check (state in ('pending', 'paid', 'refunded', 'disputed', 'dispute_lost')),
  -- The buyer ticked the box agreeing that the 14-day cancellation right ends when the download starts.
  waived_cancellation_at     timestamptz,
  first_download_at          timestamptz,
  created_at                 timestamptz not null default now(),
  paid_at                    timestamptz,
  refunded_at                timestamptz,
  refund_reason              text,
  -- The four parts always add to the price (split.ts); the database holds the same line.
  constraint purchases_split_adds_up check (
    state = 'pending' or vat_pence + fee_pence + creator_pence + site_pence = price_pence
  )
);
create index if not exists purchases_buyer_idx on purchases (buyer_id) where buyer_id is not null;
create index if not exists purchases_seller_idx on purchases (seller_account_id);
create index if not exists purchases_paid_at_idx on purchases (paid_at) where paid_at is not null;

-- THE PAYOUT LEDGER: every movement of a creator's money, with its reason. A balance is a sum over
-- these rows, never a number kept somewhere and nudged.
--   sale_share         + the creator's share of a paid purchase, available after the hold
--   refund_reversal    - taken back when that purchase is refunded
--   dispute_reversal   - taken back when a chargeback is lost
--   payout             - paid to their bank by Stripe
--   adjustment         +/- by an admin, with a note
create table if not exists payout_ledger (
  id                    uuid primary key,
  seller_account_id     uuid not null references seller_accounts (id),
  purchase_id           uuid references purchases (id) on delete set null,
  kind                  text not null check (kind in ('sale_share', 'refund_reversal', 'dispute_reversal', 'payout', 'adjustment')),
  amount_pence          integer not null,
  -- When this counts toward a payout (sale time plus the hold). Null = at once.
  available_at          timestamptz,
  stripe_transfer_id    text,
  note                  text,
  created_by            uuid references creators (id) on delete set null,
  created_at            timestamptz not null default now(),
  -- ONE share, ONE reversal per purchase and kind: a webhook delivered twice cannot pay twice.
  constraint payout_ledger_once unique (purchase_id, kind)
);
create index if not exists payout_ledger_seller_idx on payout_ledger (seller_account_id, created_at);

-- STRIPE EVENTS ALREADY HANDLED, by Stripe's own event id. A webhook Stripe retries is recognised
-- and ignored, so it changes nothing (PP3 check: "a replayed webhook changes nothing").
create table if not exists stripe_events (
  id                    text primary key,
  type                  text not null,
  received_at           timestamptz not null default now(),
  processed_at          timestamptz
);

alter table seller_accounts enable row level security;
alter table paid_listings   enable row level security;
alter table purchases       enable row level security;
alter table payout_ledger   enable row level security;
alter table stripe_events   enable row level security;

comment on table purchases is
  'Paid pack purchases (D-94). Kept 6 years (UK VAT) or 10 (EU sale), surviving account and map deletion: references set null, handles and titles kept as text.';
comment on table payout_ledger is
  'Every movement of a creator''s paid-pack money. Balances are sums over these rows. unique (purchase_id, kind) makes webhook replays harmless.';
