<script lang="ts">
  // THE FUNNEL PAGE (design 2). The purpose of this page is to get a bundle into somebody's Star
  // System Explorer. Not to browse, not to preview, not to be a nice place to spend time.
  //
  // So the order on the page is deliberate and should not be rearranged for tidiness:
  //   1. the download, above the fold and above the description
  //   2. what it is, briefly
  //   3. the cover image - the ONLY picture (decision 3)
  //   4. the data, as a tree - and every row of it can be copied, with everything beneath it, for
  //      pasting into SSE. That is SECONDARY: the cheap way to lift one body or one star without
  //      taking the whole map. It serves the same funnel - a clip used is SSE opened.
  import NodeTree from '$lib/components/NodeTree.svelte';
  import RoleIcon from '$lib/components/RoleIcon.svelte';
  import { orderRoles } from '$lib/components/roleIcons';
  import { formatBytes } from '$lib/bundle/facets';
  let { data } = $props();

  const s = $derived(data.system);
  const total = $derived(data.bodies.length + data.constructs.length);
  let reportOpen = $state(false);

  // STARS, not hearts (owner, 2026-09-04: "thematically appropriate"). The column keeps its old
  // name; the word people see is the one that fits a map of stars.
  let starred = $state(data.starred);
  let stars = $state(s.hearts_count);
  let starBusy = $state(false);
  async function toggleStar() {
    if (!data.signedIn) { location.href = '/login'; return; }
    starBusy = true;
    try {
      const res = await fetch('/api/heart', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ slug: s.slug, on: !starred })
      });
      const out = (await res.json()) as { ok: boolean; hearts?: number };
      if (out.ok) { starred = !starred; stars = out.hearts ?? stars; }
    } catch { /* a failed star is not worth a dialog */ } finally { starBusy = false; }
  }

  // Role counts are the human axis - "12 planets, 4 stations" says what "230 bodies" cannot. In
  // the fixed order every row of the tree uses, so the eye learns one layout.
  const roles = $derived(orderRoles((s.role_counts ?? {}) as Record<string, number>));

  // Other cartographers' work in this map, as the engine recorded it on paste (R-16). Each credit
  // may carry a CHAIN - where the work was before the map it was pasted from, deepest first - so a
  // copy of a copy still names its original.
  type Origin = { url: string; title: string | null; creator: string | null };
  type Credit = { title: string; creator: string | null; url: string | null; chain?: Origin[] };
  type Stop = { url: string | null; title: string | null; creator: string | null };
  const credits = $derived((Array.isArray(s.content_credits) ? s.content_credits : []) as Credit[]);
  // The original of each credit, and the maps it passed through on the way here.
  const lineage = (c: Credit): { original: Stop; via: Stop[] } => {
    const chain = c.chain ?? [];
    return chain.length ? { original: chain[0], via: [...chain.slice(1), c] } : { original: c, via: [] };
  };
  // Everyone whose hands this map's content passed through - the owner's "ownership is shared".
  const cartographers = $derived.by(() => {
    const names = new Set<string>();
    for (const c of credits) { for (const o of [...(c.chain ?? []), c]) if (o.creator) names.add(o.creator); }
    const mine = data.creator?.display_name ?? data.creator?.handle;
    if (mine) names.delete(mine);
    return [...names];
  });
</script>

<svelte:head>
  <title>{s.title} - {data.site.name}</title>
  <meta name="description" content={s.summary ?? 'A star system for Star System Explorer, free to download.'} />
  <!-- OG previews are why the cover image matters more than any in-page richness (design 2). -->
  <meta property="og:title" content={s.title} />
  <meta property="og:description" content={s.summary ?? 'Free to download and open in Star System Explorer.'} />
  <meta property="og:type" content="article" />
  <meta property="og:site_name" content={data.site.name} />
  <!-- ABSOLUTE, and that is not a detail: Open Graph ignores relative urls, so a relative og:image
       means Discord and Twitter show a link with NO PICTURE. For a hub whose product is
       link-sharing, that is the most expensive small bug available. -->
  <meta property="og:url" content="{data.site.url}/s/{s.slug}" />
  <link rel="canonical" href="{data.site.url}/s/{s.slug}" />
  {#if data.coverServable && s.cover_sha256}
    <meta property="og:image" content="{data.site.url}/asset/{s.cover_sha256}" />
    <meta name="twitter:card" content="summary_large_image" />
  {:else}
    <meta name="twitter:card" content="summary" />
  {/if}
</svelte:head>

<article>
  <h1>{s.title}</h1>
  <p class="by">
    {s.kind === 'starmap' ? 'A campaign starmap' : 'A star system'}
    {#if data.creator}by {data.creator.display_name ?? data.creator.handle}{/if}
    - {total} {total === 1 ? 'object' : 'objects'}
  </p>

  <!-- 1. THE DOWNLOAD. One click, no account. -->
  <p>
    <a class="download" href="/api/download/{s.slug}" data-sveltekit-reload>
      Download for Star System Explorer
    </a>
  </p>
  <p class="download-note">
    Free. No account needed. Opens directly in
    <a href="https://starsystemx.com" target="_blank" rel="noopener">Star System Explorer</a>,
    which runs in your browser - nothing to install.
  </p>
  <p>
    <button class="star" class:on={starred} onclick={toggleStar} disabled={starBusy}
      title={data.signedIn ? (starred ? 'Take your star back' : 'Give this map a star') : 'Sign in to give this map a star'}>
      <svg viewBox="0 0 24 24"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" /></svg>
      {starred ? 'Starred' : 'Star this map'} · {stars}
    </button>
  </p>

  {#if data.withheldCount > 0}
    <div class="panel notice">
      <h3>{data.withheldCount} {data.withheldCount === 1 ? 'picture is' : 'pictures are'} awaiting review</h3>
      <p>
        Every image uploaded here is looked at by a person before it is shared onward. The map is
        complete and downloads normally - those pictures are simply not included yet.
      </p>
    </div>
  {/if}

  {#if s.description}
    <div class="panel"><p>{s.description}</p></div>
  {/if}

  <!-- 3. The cover image, and it is the only picture on the page. -->
  {#if data.coverServable && s.cover_sha256}
    <img class="cover" src="/asset/{s.cover_sha256}" alt="Cover image for {s.title}" />
  {/if}

  {#if data.screenshots.length}
    <div class="shots">
      {#each data.screenshots as shot (shot.sha256)}
        <figure>
          <img src="/asset/{shot.sha256}" alt={shot.caption ?? 'Screenshot of ' + s.title} loading="lazy" />
          {#if shot.caption}<figcaption>{shot.caption}</figcaption>{/if}
        </figure>
      {/each}
    </div>
  {/if}

  <!-- 4. The data. -->
  <h2>What is in it</h2>

  <!-- The facts, counted from the file. Above the table because a browsing GM wants the shape of
       the thing before the list of it. -->
  <div class="facts">
    {#if s.system_count > 1}<div><b>{s.system_count}</b> systems</div>{/if}
    {#if s.body_count}<div><b>{s.body_count}</b> bodies</div>{/if}
    {#if s.construct_count}<div><b>{s.construct_count}</b> constructs</div>{/if}
    {#if s.carried_images}<div><b>{s.carried_images}</b> pictures</div>{/if}
    {#if s.carried_models}<div><b>{s.carried_models}</b> 3D models</div>{/if}
    <div><b>{formatBytes(s.source_bytes ?? 0)}</b> download</div>
    {#if s.created_with}<div>made with SSE <b>{s.created_with}</b></div>{/if}
  </div>

  {#if roles.length}
    <p class="roles">
      {#each roles as [role, n] (role)}
        <span class="rc"><RoleIcon role={role} size={13} />{n} {role}{n === 1 ? '' : 's'}</span>
      {/each}
    </p>
  {/if}

  {#if (s.auto_tags ?? []).length}
    <div class="pills">
      {#each s.auto_tags as t}<a class="tag" href="/browse?tag={t}">{t}</a>{/each}
    </div>
  {/if}

  <!-- CREDIT FOLLOWS CONTENT. When this map was built partly from clips pasted out of other maps,
       the engine recorded whose (R-16) and the hub says so, with a way back. -->
  {#if credits.length}
    <div class="credits">
      <p>
        Includes work from
        {#each credits as c, i (c.title + (c.url ?? ''))}
          {@const l = lineage(c)}
          {#if l.original.url}<a href={l.original.url}>{l.original.title ?? c.title}</a>{:else}{l.original.title ?? c.title}{/if}{#if l.original.creator} by {l.original.creator}{/if}{#if l.via.length} (via {#each l.via as v, j}{#if v.url}<a href={v.url}>{v.title ?? 'a map'}</a>{:else}{v.title ?? 'a map'}{/if}{#if v.creator} by {v.creator}{/if}{j < l.via.length - 1 ? ', ' : ''}{/each}){/if}{i < credits.length - 1 ? '; ' : '.'}
        {/each}
      </p>
      {#if cartographers.length}
        <p class="shared">Cartographers whose work is in this map: {cartographers.join(', ')}{#if data.creator}, and {data.creator.display_name ?? data.creator.handle}{/if}.</p>
      {/if}
    </div>
  {/if}

  <!-- The other direction: where this map's work has gone. -->
  {#if data.usedIn.length}
    <p class="credits">
      Used in
      {#each data.usedIn as u, i (u.slug)}
        <a href="/s/{u.slug}">{u.title}</a>{#if u.creator} by {u.creator}{/if}{i < data.usedIn.length - 1 ? ', ' : '.'}
      {/each}
    </p>
  {/if}

  <!-- A TREE, not a flat table. 161 alphabetised rows put a barycentre between two unrelated
       stars and asked nobody to read any of it; the parent/child data was there all along.
       Copying lives on the rows: a branch copies itself and everything under it. -->
  <p class="muted">
    Open a star to see what orbits it. Copy any row to take that object - or that object and
    everything beneath it - into your own campaign in Star System Explorer.
  </p>
  <NodeTree
    nodes={[...data.bodies, ...data.constructs]}
    {credits}
    source={{
      site: data.site.name, url: data.site.url + '/s/' + s.slug, title: s.title,
      creator: data.creator?.display_name ?? data.creator?.handle ?? null
    }}
  />

  <div class="foot-actions">
    <button onclick={() => (reportOpen = !reportOpen)}>Report a problem with this map</button>
  </div>
  {#if reportOpen}
    <form class="panel" method="POST" action="/api/report">
      <input type="hidden" name="slug" value={s.slug} />
      <p class="muted">You need an account to report. Tell us what is wrong and we will look.</p>
      <label>
        Reason
        <select name="reason">
          <option value="content">Offensive or inappropriate content</option>
          <option value="copyright">Copyright - this is my work</option>
          <option value="spam">Spam or nonsense</option>
          <option value="other">Something else</option>
        </select>
      </label>
      <label>Detail <textarea name="detail" rows="3"></textarea></label>
      <button class="primary" type="submit">Send report</button>
    </form>
  {/if}
</article>

<style>
  h1 { margin: 0 0 4px; font-size: 1.9rem; letter-spacing: -0.02em; }
  .by { margin: 0 0 20px; color: var(--ink-faint); }
  .star {
    display: inline-flex; align-items: center; gap: 8px; font: inherit; font-size: 0.92rem;
    background: var(--panel); color: var(--ink-dim); border: 1px solid var(--edge); border-radius: 8px;
    padding: 6px 12px; cursor: pointer;
  }
  .star svg { width: 16px; height: 16px; fill: none; stroke: currentColor; stroke-width: 1.7; stroke-linejoin: round; }
  .star.on { color: var(--warn); border-color: var(--warn); }
  .star.on svg { fill: currentColor; }
  .star:hover { color: var(--ink); }
  .cover {
    width: 100%; max-width: 100%; border-radius: var(--radius);
    border: 1px solid var(--edge); margin: 22px 0; display: block;
  }
  h2 { margin: 32px 0 8px; font-size: 1.2rem; }
  .shots { display: grid; gap: 12px; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); margin: 22px 0; }
  .shots figure { margin: 0; }
  .shots img { width: 100%; border-radius: var(--radius); border: 1px solid var(--edge); display: block; }
  .shots figcaption { color: var(--ink-faint); font-size: 0.85rem; margin-top: 6px; }
  .muted { color: var(--ink-dim); margin: 0 0 12px; }
  .facts { display: flex; flex-wrap: wrap; gap: 8px 22px; margin: 0 0 10px; color: var(--ink-dim); }
  .facts b { color: var(--ink); font-variant-numeric: tabular-nums; }
  .roles { color: var(--ink-faint); margin: 0 0 12px; font-size: 0.92rem; display: flex; flex-wrap: wrap; gap: 4px 14px; }
  .rc { display: inline-flex; align-items: center; gap: 5px; white-space: nowrap; }
  .rc :global(.role-icon) { opacity: 0.7; }
  .pills { display: flex; flex-wrap: wrap; gap: 6px; margin: 0 0 18px; }
  .credits { color: var(--ink-dim); margin: 0 0 18px; font-size: 0.92rem; }
  .credits p { margin: 0 0 6px; }
  .shared { color: var(--ink-faint); }
  .pills a.tag { text-decoration: none; }
  .pills a.tag:hover { border-color: var(--accent); }
  .foot-actions { margin-top: 36px; }
  label { display: block; margin: 10px 0; color: var(--ink-dim); }
  select, textarea {
    display: block; width: 100%; margin-top: 4px; font: inherit;
    background: var(--panel-2); color: var(--ink);
    border: 1px solid var(--edge); border-radius: 8px; padding: 8px;
  }
</style>
