<script lang="ts">
  // The cover image is the ONLY picture on the hub (decision 3). No rendered preview, no engine.
  interface System {
    slug: string;
    title: string;
    summary: string | null;
    blurb?: string | null;
    kind: string;
    cover_sha256: string | null;
    hearts_count: number;
    download_count: number;
    // Derived facets, present when the card is rendered from a query that selected them.
    auto_tags?: string[];
    body_count?: number;
    construct_count?: number;
    system_count?: number;
  }
  let { system }: { system: System } = $props();

  // The one line that tells a browsing GM what this actually is. Built from counts rather than
  // prose, because counts are the thing that distinguishes a built-up system from an empty one.
  const whatsInIt = $derived.by(() => {
    const bits: string[] = [];
    if ((system.system_count ?? 0) > 1) bits.push(system.system_count + ' systems');
    if (system.body_count) bits.push(system.body_count + ' bodies');
    if (system.construct_count) bits.push(system.construct_count + ' constructs');
    return bits.join(' · ');
  });

  // At most three pills on a card - enough to characterise, not enough to become wallpaper.
  const pills = $derived((system.auto_tags ?? []).filter((t) => PILLS.has(t)).slice(0, 3));
</script>

<script lang="ts" module>
  /** Worth showing on a card: the ones that change whether somebody clicks. */
  const PILLS = new Set([
    'campaign', 'large-campaign', 'built-up', 'multi-star',
    'has-artwork', 'has-3d-models', 'player-safe'
  ]);
</script>

<a class="card" href="/s/{system.slug}">
  {#if system.cover_sha256}
    <!-- Served through the ledger-checking route. A withheld cover simply 404s and the browser
         shows the alt text, which is honest rather than broken. -->
    <img class="cover" src="/asset/{system.cover_sha256}" alt="" loading="lazy" decoding="async" />
  {:else}
    <div class="cover-fallback">{system.kind === 'starmap' ? 'Campaign' : 'System'}</div>
  {/if}
  <div class="body">
    <h3>{system.title}</h3>
    {#if system.blurb || system.summary}<p>{system.blurb ?? system.summary}</p>{/if}
    {#if whatsInIt}<p class="counts">{whatsInIt}</p>{/if}
    {#if pills.length}
      <div class="pills">{#each pills as t}<span class="tag">{t}</span>{/each}</div>
    {/if}
    <div class="meta">
      <span>{system.hearts_count} hearts</span>
      <span>{system.download_count} downloads</span>
    </div>
  </div>
</a>

<style>
  a.card { color: inherit; }
  a.card:hover { text-decoration: none; border-color: var(--accent); }
  .counts { color: var(--ink-faint); font-size: 0.85rem; margin-top: 6px; }
  .pills { display: flex; flex-wrap: wrap; gap: 5px; margin-top: 8px; }
</style>
