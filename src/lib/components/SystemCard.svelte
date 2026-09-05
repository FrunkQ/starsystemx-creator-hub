<script lang="ts">
  // The cover image is the ONLY picture on the hub (decision 3). No rendered preview, no engine.
  //
  // A STARMAP AND A SYSTEM LOOK DIFFERENT AT A GLANCE (owner, 2026-09-04): a starmap card carries
  // a second, offset edge - a map with more inside it - and a kind badge on the picture. A system
  // card is plain. Nobody should have to read the counts to know which they are looking at.
  import PixelText from '$lib/components/PixelText.svelte';
  interface System {
    slug: string;
    title: string;
    summary: string | null;
    blurb?: string | null;
    kind: string;
    cover_sha256: string | null;
    hearts_count: number;
    // Absent from a list read until migration 0021 has run (server/cards.ts).
    comments_count?: number;
    download_count: number;
    // Derived facets, present when the card is rendered from a query that selected them.
    auto_tags?: string[];
    // The creator's own picks from the vocabulary - the tags that say why THIS Earth is different.
    tags?: string[];
    body_count?: number;
    construct_count?: number;
    system_count?: number;
  }
  let { system }: { system: System } = $props();

  const isStarmap = $derived(system.kind === 'starmap');

  // The one line that tells a browsing GM what this actually is. Built from counts rather than
  // prose, because counts are the thing that distinguishes a built-up system from an empty one.
  const whatsInIt = $derived.by(() => {
    const bits: string[] = [];
    if ((system.system_count ?? 0) > 1) bits.push(system.system_count + ' systems');
    if (system.body_count) bits.push(system.body_count + ' bodies');
    if (system.construct_count) bits.push(system.construct_count + ' constructs');
    return bits.join(' · ');
  });

  // At most four pills on a card. The CREATOR'S tags come first - they are the ones that separate
  // one Solar System from the next - then the derived pills that change whether somebody clicks.
  const pills = $derived.by(() => {
    const mine = (system.tags ?? []).slice(0, 3).map((t) => ({ t, mine: true }));
    const auto = (system.auto_tags ?? []).filter((t) => PILLS.has(t)).map((t) => ({ t, mine: false }));
    return [...mine, ...auto].slice(0, 4);
  });
</script>

<script lang="ts" module>
  /** Worth showing on a card: the ones that change whether somebody clicks. */
  const PILLS = new Set([
    'campaign', 'large-campaign', 'built-up', 'multi-star',
    'has-artwork', 'has-3d-models', 'player-safe'
  ]);
</script>

<a class="card" class:starmap={isStarmap} href="/s/{system.slug}">
  <div class="pic">
    {#if system.cover_sha256}
      <!-- Served through the ledger-checking route. A withheld cover simply 404s and the browser
           shows the alt text, which is honest rather than broken. -->
      <img class="cover" src="/asset/{system.cover_sha256}" alt="" loading="lazy" decoding="async" />
    {:else}
      <div class="cover-fallback">{isStarmap ? 'Starmap' : 'System'}</div>
    {/if}
    <!-- The kind, in the cover font: the same pixels the card's own picture is lettered in. -->
    <span class="kind"><PixelText text={isStarmap ? 'Starmap' : 'System'} scale={2} /></span>
  </div>
  <div class="body">
    <h3>{system.title}</h3>
    {#if system.blurb || system.summary}<p>{system.blurb ?? system.summary}</p>{/if}
    {#if whatsInIt}<p class="counts">{whatsInIt}</p>{/if}
    {#if pills.length}
      <div class="pills">{#each pills as p (p.t)}<span class="tag" class:mine={p.mine}>{p.t}</span>{/each}</div>
    {/if}
    <div class="meta">
      <!-- Stars, with the symbol - a map of stars is starred, not hearted. -->
      <span class="stars"><svg viewBox="0 0 24 24"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" /></svg>{system.hearts_count}</span>
      <!-- Comments, counted like stars; a zero on every card at launch says nothing, so only when there are some. -->
      {#if system.comments_count}
        <span class="stars" title="{system.comments_count} {system.comments_count === 1 ? 'comment' : 'comments'}"><svg viewBox="0 0 24 24"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>{system.comments_count}</span>
      {/if}
      <span>{system.download_count} downloads</span>
    </div>
  </div>
</a>

<style>
  a.card { color: inherit; position: relative; }
  a.card:hover { text-decoration: none; border-color: var(--accent); }
  /* The second edge: a starmap is a map with maps inside it. */
  a.card.starmap { outline: 1px solid var(--edge); outline-offset: 3px; }
  a.card.starmap:hover { outline-color: var(--accent); }
  .pic { position: relative; }
  /* Top-RIGHT: a generated cover letters its title top-left in the same pixels, and two lines of
     the same font in the same corner read as one. */
  .kind {
    position: absolute; right: 8px; top: 8px; line-height: 0;
    font-size: 0.7rem; letter-spacing: 0.08em; text-transform: uppercase; font-weight: 600;
    color: var(--ink); background: rgba(10, 13, 20, 0.72);
    border: 1px solid var(--edge); border-radius: 6px; padding: 2px 7px;
  }
  a.card.starmap .kind { border-color: var(--accent); color: var(--accent); }
  .counts { color: var(--ink-faint); font-size: 0.85rem; margin-top: 6px; }
  .pills { display: flex; flex-wrap: wrap; gap: 5px; margin-top: 8px; }
  .tag.mine { border-color: var(--accent); }
  .stars { display: inline-flex; align-items: center; gap: 4px; }
  .stars svg { width: 13px; height: 13px; fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linejoin: round; }
</style>
