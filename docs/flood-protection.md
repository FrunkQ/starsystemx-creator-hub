# Flood protection (D-95)

**What happened, 2026-11-21.** About 160,000 requests in one day, from firms in the US and China,
for a dozen of the hub's files. Workers' free plan allows **100,000 requests a day for the whole
Cloudflare account**, not per site, so the flood on the hub stopped every Worker on the account:
the hub, Star System Explorer 4 (v4.starsystemx.com) and the converter.

## What the code does (0.65.0)

All in `src/lib/server/guard.ts`, called first thing in `src/hooks.server.ts`.

| measure | effect |
|---|---|
| robots.txt names about thirty AI-training and bulk-data crawlers and disallows them everything; `Crawl-delay: 10` for the rest; `/asset/` disallowed | polite crawlers stop |
| a known scraper agent, a bare HTTP library or an empty agent gets a 403 | no Supabase or R2 read for it |
| 300 dynamic requests a minute per address (`[[ratelimits]]` in wrangler.toml), then 429 | a loop from one address stops costing reads within seconds |
| signed-out GETs of anything the route already calls `public` are answered from Cloudflare's edge cache (capped at ten minutes) | the same dozen files read Supabase and R2 a few hundred times instead of 160,000 |

**The limit of all of this:** a request that reaches the Worker has already been counted against
the 100,000. The code makes each counted request cheap and keeps Supabase and R2 safe. Only the
dashboard settings below stop a request **before** it is counted.

What is never cached: anything for a signed-in person, downloads (`no-store`), the admin, account,
manage, upload and private-asset routes, any response that sets a cookie or is not a 200.

A ban (design 6.2) now takes up to ten minutes to reach a new visitor instead of the next request,
because the edge may hold an approved asset that long.

## What only the owner can do, in the Cloudflare dashboard

Menu names move; these are as of November 2026.

1. **Workers Paid, $5 a month. DONE 2026-11-21.** Ten million requests a month are included, then
   $0.30 a million, so a flood no longer takes the other sites down; it adds to the bill instead.
   The steps below are what keep that bill at $5.
These are **zone** settings: pick the `starsystemx.com` domain on the dashboard's home page first.
They are not under *Workers & Pages*.

2. **Block AI crawlers.** *Security* > *Settings*, filter by *Bot traffic*, open **AI Crawler and
   Agent access policies** (it was called "Block AI bots"). Set *Training* to **Block**. Leave
   *Search* allowed, and *Agent* (a person's own assistant reading a page for them) allowed too.
3. **Bot Fight Mode: leave it OFF.** It cannot be given exceptions on the free plan: Cloudflare's
   docs say it "cannot be bypassed or skipped using WAF custom rules or Page Rules", and that it
   "may challenge API or mobile app traffic". Webhooks (Patreon now, the payment provider for paid
   packs later) are automated calls from cloud servers, exactly what it challenges, and a webhook
   cannot answer a challenge. The custom rule below does the same job and can leave the webhooks
   out. Only switch it on during an attack the other rules are not stopping, and off again after.
4. **One custom rule** for data-centre traffic: *Security* > *Security rules* > *Create rule* >
   *Custom rule*. Name it "Explorers: challenge cloud networks". *Edit expression* and paste:

   ```
   (http.host eq "explorers.starsystemx.com" and not cf.client.bot and not starts_with(http.request.uri.path, "/api/webhooks/") and not starts_with(http.request.uri.path, "/api/admin/") and ip.src.asnum in {16509 14618 8075 396982 15169 45102 37963 132203 45090 136907 55990 14061 16276 24940 63949 20473})
   ```

   Action **Managed Challenge**. Those are Amazon, Microsoft, Google Cloud, Alibaba, Tencent, Huawei
   Cloud, DigitalOcean, OVH, Hetzner, Linode and Vultr. People on a home or phone connection never
   see it; a person on a VPN sees a one-click check.

   **Webhooks** (`/api/webhooks/`) are left out, because Patreon and payment providers send them
   from Amazon and Google servers. **A new webhook must live under `/api/webhooks/`** or this rule
   will challenge it. The Worker's own scraper check skips that path too (`hooks.server.ts`).
   **Our own automation:** trailer capture and GPU filming run on the owner's PC, on a home
   connection, so they are not affected. Checks run from Claude's cloud sessions come from a cloud
   network and would be challenged (they cannot reach the live site through their proxy today in
   any case); verify a deploy from the owner's browser or the Workers Builds log instead.
5. **One rate limiting rule** (the free plan has one): *Security rules* > *Create rule* > *Rate
   limiting rule*. Name "Explorers: per address". If incoming requests match `(http.host eq
   "explorers.starsystemx.com" and not starts_with(http.request.uri.path, "/api/webhooks/"))`, counted by **IP**, when rate exceeds **100 requests per 10
   seconds**, then **Block** for **10 seconds**.
6. **Check it worked** next day: *Security* > *Analytics* (or *Events*) shows what was challenged
   and blocked, by country, network (ASN) and agent. The hub's own *Admin* > *Stats* page shows the
   requests that still reached the Worker.
