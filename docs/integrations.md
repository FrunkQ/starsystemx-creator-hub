# Patreon, Discord and the hub

All of this is **built and switched off**. `discord_enabled` and `patreon_enabled` are config rows;
nothing runs until they are true and the secrets exist. The point of building it now is that the
schema is the expensive part to change later, and it is much cheaper to get the shape right before
there are real pledges attached to it.

---

## The shape: three systems, and the legs point different ways

This is the thing worth being clear about, because "connect Patreon, Discord and the hub" sounds like
one job and is actually three, running in different directions.

```
                  pays                        posts
   Patreon  ─────────────►  PERSON  ◄───────────────  Discord
      │                       │                          ▲
      │ INBOUND               │ owns                     │ OUTBOUND
      │ entitlement           ▼                          │ badge
      └──────────────►   Creator Hub  ───────────────────┘
                         (the account is the hinge)
```

| leg | direction | what it does | where |
|---|---|---|---|
| **entitlement** | Patreon → hub | you pay, you get Pro | `entitlements.ts`, `integrations/patreon.ts` |
| **identity** | Discord → hub | sign in / link an account | `integrations/discord.ts` |
| **badge** | hub → Discord | you published, you get a role | `integrations/badges.ts` + the outbox |

**The badge leg is the only one the hub is uniquely able to do.** Patreon knows who pays. Discord
knows who is in the server. Neither knows who published a map that forty people downloaded — and in a
community of makers, that is the thing actually worth a badge.

### What NOT to build

**Patreon already has a native Discord integration** that assigns supporter roles directly from a
pledge. If the hub *also* mirrors the Pro tier into a Discord role, two systems own the same role and
they will disagree — usually at cancellation, which is the worst possible moment for it.

`discord_role_pro` exists in config for the case where the owner deliberately wants the hub to own
it. **Leave it blank** and let Patreon do that leg. Set `discord_role_creator` — that is the one only
the hub can award.

---

## Entitlements are a ledger, not a column

A tier is **the best active grant**, never a field somebody sets. Three questions come up the moment
real money is involved and only a ledger answers them:

- *why does this person have Pro?* → the grant row says: patreon, member 12345
- *when does it lapse?* → `expires_at`, taken from Patreon's own paid-through date
- *they cancelled, but I gifted them a year* → two grants; the best active one wins, and cancelling
  one does not silently revoke the other

That third case is the one that generates an angry message from exactly the person you least want to
annoy, and a tier column cannot represent it at all.

**`expires_at` is set from the paid-through date deliberately.** A webhook will be missed eventually.
Setting an expiry means a missed `delete` degrades into a **lapse** rather than into free Pro
forever. A dropped revoke is the failure mode worth designing against precisely because it is silent.

`/account` shows the creator their own grants and when they end, because "why do I have this and when
does it stop" is the question people actually ask, and an answer they can read themselves is one
fewer message to the owner.

---

## What Pro is worth is config, not code

```
pro_uploads_per_user_per_day    10
pro_max_bundle_bytes            200 MB
pro_max_assets_per_bundle       600
```

`gatesForTier()` overlays these on the base gates. Same reasoning as the gates themselves: what Pro
is worth **will** be tuned, and tuning it should not need a deploy.

> **One real ceiling to know about:** `pro_max_bundle_bytes` is not purely a cost control. The
> upload path reads the whole bundle into Worker memory (`decisions.md` D-03), so raising this a lot
> needs the streaming/presigned path (D-04) first. 200 MB is comfortable; 2 GB is not.

---

## Security notes that are not optional

**An unverified webhook endpoint is a free Pro button for anyone who finds the URL.** Two rules:

1. **Verify the signature against the RAW body bytes**, before parsing. Parsing and re-serialising
   produces a different string and a signature that can never match — and the temptation at that
   point is to "fix" it by weakening the check.
2. **Fail closed.** If the runtime cannot compute the HMAC, that is a 500, never an accept. Patreon
   signs with HMAC-**MD5** (their choice); Workers' SubtleCrypto may not expose MD5, in which case a
   small JS implementation is needed — `verifyWebhook` throws a specific error saying exactly this
   rather than silently returning true.

**An entitlement is never derived from anything a client says.** Only a verified webhook or a token
exchange the hub performed itself may grant a tier.

**One provider account links to one hub account.** The unique index on
`(provider, provider_user_id)` is what stops a single pledge buying Pro for a dozen accounts.

**OAuth `state` is CSRF protection, not decoration.** Without it, an attacker completes a link flow
in a victim's browser and attaches *their* Discord account to the victim's hub account. The hub fails
closed on missing or mismatched state.

---

## The outbox

Assigning a Discord role is a network call to somebody else's service. It will fail — rate limits,
outages, a revoked token — and a fire-and-forget failure means a badge silently never arrives and
nobody notices for a month.

So a request writes an **intent** and returns; delivery is separate, retryable and idempotent.
`dedupe_key` is a pure function of the intent, so re-deriving badges on every publish (which happens
constantly) queues nothing new. **Never put a timestamp in a dedupe key** — it defeats the entire
mechanism by making every re-derivation look novel.

Drained by `POST /api/admin/outbox`, on a Cron Trigger or by an admin when something looks stuck.
After six failed attempts an intent is marked `abandoned` rather than retried forever, because a
queue that never drains hides the one entry that actually needs a human.

---

## Turning it on

**Discord**, when the server is ready:

1. Create the application, add a bot, invite it with **Manage Roles** only.
2. **The bot's own role must sit ABOVE the role it assigns** in the server's role list. Discord
   refuses otherwise, and the error is unhelpful — this is the single most common way this goes
   wrong.
3. Redirect URI: `https://<host>/api/link/discord/callback`.
4. Set the secrets, then at `/admin/config`: `discord_enabled` → `true`, `discord_guild_id`, and
   `discord_role_creator`.
5. Add the Cron Trigger for the outbox.

**Patreon**, when the page exists:

1. Create the client; redirect URI `https://<host>/api/link/patreon/callback`.
   **Note: the Patreon OAuth callback route is not written yet** — only the webhook and the
   entitlement logic are. It is a small file modelled on the Discord one, and it is the remaining
   piece of this section.
2. Register the webhook at `https://<host>/api/webhooks/patreon` for
   `members:pledge:create|update|delete`.
3. Set the secrets, then at `/admin/config`: `patreon_enabled` → `true`, `patreon_campaign_id`, and
   `patreon_tier_map` — e.g. `{"12345":"pro"}`. **Patreon tier ids change when you restructure your
   tiers**, which is exactly why that mapping is a row and not a constant.
