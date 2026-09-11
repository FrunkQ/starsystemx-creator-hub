<script lang="ts">
  // Discovery. For a funnel, this IS the product (design 7.5) - a map nobody can find is a map
  // nobody downloads, and every download is Star System Explorer opened.
  //
  // Plain links, not JavaScript state: every filtered view is a URL somebody can paste into a
  // Discord channel. That matters more here than slickness does.
  import SystemCard from '$lib/components/SystemCard.svelte';
  import { sseLink } from '$lib/openInSse';
  let { data } = $props();

  const selected = $derived(new Set(data.selected));

  /** The current query, with one change applied. */
  function href(change: { tag?: string; kind?: string | null; sort?: 'loved' | 'new' | 'detailed' }): string {
    const p = new URLSearchParams();
    for (const t of data.selected) if (t !== change.tag) p.append('tag', t);
    if (change.tag && !selected.has(change.tag)) p.append('tag', change.tag);
    if (data.q) p.set('q', data.q);
    const kind = change.kind === undefined ? data.kind : change.kind;
    if (kind) p.set('kind', kind);
    const sort = change.sort ?? data.sort;
    if (sort !== 'loved') p.set('sort', sort);
    const s = p.toString();
    return s ? '/browse?' + s : '/browse';
  }
</script>

<svelte:head>
  <title>Browse maps - {data.site.name}</title>
  <meta name="description" content="Star systems and campaign starmaps to download and open in Star System Explorer." />
</svelte:head>

<h1>Browse</h1>
<p class="lede">
  Every map here is free to download in one click, no account needed. The first pills are worked
  out from the file itself; the rest are what each cartographer says their map is.
  <!-- The rules library sits here rather than in the banner (D-71): it is a second thing to browse,
       and it belongs beside the first rather than competing with it for a nav slot. -->
  Looking for a custom liquid or engine rather than a map? <a href="/rules">Custom rules</a>.
</p>

<div class="layout">
  <!-- SEARCH IS ITS OWN GRID AREA, not the first thing in the sidebar. On a phone the sidebar drops
       BELOW the results (see the grid areas in the styles) and the search box must not go with it -
       looking for a map by name is the one thing somebody arrives on this page already wanting. -->
  <form method="GET" class="search">
    <input name="q" value={data.q} placeholder="Search titles" aria-label="Search titles" />
    {#each data.selected as t}<input type="hidden" name="tag" value={t} />{/each}
    {#if data.kind}<input type="hidden" name="kind" value={data.kind} />{/if}
    <button type="submit">Go</button>
  </form>

  <aside class="filters">
    <h2 class="filters-head">Narrow it down</h2>
    <section>
      <h2>Kind</h2>
      <div class="pills">
        <a class="tag" class:on={!data.kind} href={href({ kind: null })}>all</a>
        <a class="tag" class:on={data.kind === 'starmap'} href={href({ kind: 'starmap' })}>starmaps</a>
        <a class="tag" class:on={data.kind === 'system'} href={href({ kind: 'system' })}>systems</a>
      </div>
    </section>

    {#each data.groups as group}
      <section>
        <h2>{group.label}</h2>
        <div class="pills">
          {#each group.tags as tag}
            {@const n = data.counts[tag] ?? 0}
            {#if n > 0 || selected.has(tag)}
              <a class="tag" class:on={selected.has(tag)} href={href({ tag })}>
                {tag}{#if n > 0}<span class="n">{n}</span>{/if}
              </a>
            {/if}
          {/each}
        </div>
      </section>
    {/each}

    <!-- The cartographers' own tags: how one version of the Solar System differs from the next. -->
    {#each data.mine as group}
      {@const live = group.tags.filter((tag) => (data.counts[tag] ?? 0) > 0 || selected.has(tag))}
      {#if live.length}
        <section>
          <h2>{group.label}</h2>
          <div class="pills">
            {#each live as tag}
              {@const n = data.counts[tag] ?? 0}
              <a class="tag mine" class:on={selected.has(tag)} href={href({ tag })}>
                {tag}{#if n > 0}<span class="n">{n}</span>{/if}
              </a>
            {/each}
          </div>
        </section>
      {/if}
    {/each}

    {#if data.selected.length || data.kind}
      <p><a href="/browse">Clear all filters</a></p>
    {/if}
  </aside>

  <div class="results">
    <div class="bar">
      <span>{data.systems.length} {data.systems.length === 1 ? 'map' : 'maps'}</span>
      <span class="spacer"></span>
      <a class:on={data.sort === 'loved'} href={href({ sort: 'loved' })}>Most loved</a>
      <a class:on={data.sort === 'new'} href={href({ sort: 'new' })}>Newest</a>
      <a class:on={data.sort === 'detailed'} href={href({ sort: 'detailed' })} title="The maps with the most written about their objects, first">Most written up</a>
    </div>

    {#if data.narrow.length}
      <!-- Forty Earths: the pills that split this crowd, right where the crowd is. -->
      <div class="narrow">
        <span>Narrow it down:</span>
        {#each data.narrow as tag}
          <a class="tag" href={href({ tag })}>{tag}<span class="n">{data.counts[tag]}</span></a>
        {/each}
      </div>
    {/if}

    {#if data.failed}
      <div class="panel notice bad">
        <h3>Could not read the library</h3>
        <p>Something went wrong at our end - this is not an empty shelf. Please try again shortly.</p>
      </div>
    {:else if !data.systems.length}
      <div class="panel notice">
        <h3>Nothing matches</h3>
        <p>
          {#if data.selected.length || data.q || data.kind}
            Try removing a filter. <a href="/browse">Clear all</a>.
          {:else}
            No maps have been published yet.
          {/if}
        </p>
      </div>
    {:else}
      <div class="grid">
        {#each data.systems as system (system.slug)}
          <SystemCard {system} best={data.best} open={sseLink(data.openPrefixes, data.site.url, system.slug, system.kind)} />
        {/each}
      </div>
    {/if}
  </div>
</div>

<style>
  h1 { margin: 0 0 6px; }
  .lede { color: var(--ink-dim); margin: 0 0 22px; max-width: 62ch; }
  /* ============================================================================================
     THE FILTERS GO UNDER THE MAPS ON A PHONE (D-65), and this was the worst thing on the site at
     375px. The sidebar is 924px tall with the library as small as it is today, so a reader on a
     phone scrolled ONE AND A HALF SCREENS of tag pills before the first map appeared - and that
     block grows as the hub succeeds, so it was getting worse on its own.

     Grid AREAS rather than `order`, because the search box has to stay at the top while the rest
     of the sidebar moves to the bottom, and order alone cannot split a single element in two.
     ============================================================================================ */
  .layout {
    display: grid; gap: 0 26px; align-items: start;
    grid-template-columns: 220px minmax(0, 1fr);
    grid-template-areas: "search results" "filters results";
  }
  .search { grid-area: search; }
  .filters { grid-area: filters; }
  .results { grid-area: results; }
  /* The sidebar says what it is on a desktop by sitting where sidebars sit. Under the maps on a
     phone it needs the words, or it reads as a stray heap of pills at the end of the page. */
  .filters-head { display: none; }
  @media (max-width: 760px) {
    .layout { grid-template-columns: 1fr; grid-template-areas: "search" "results" "filters"; }
    .filters { margin-top: 28px; border-top: 1px solid var(--edge); padding-top: 20px; }
    .filters-head {
      display: block; margin: 0 0 14px; font-size: 1rem; text-transform: none; letter-spacing: 0;
      color: var(--ink);
    }
  }
  aside section { margin-bottom: 18px; }
  aside h2 { font-size: 0.82rem; text-transform: uppercase; letter-spacing: 0.06em;
             color: var(--ink-faint); margin: 0 0 8px; }
  .pills { display: flex; flex-wrap: wrap; gap: 6px; }
  a.tag { text-decoration: none; }
  a.tag:hover { border-color: var(--accent); }
  a.tag.mine { border-style: dashed; }
  a.tag.on { background: var(--accent); color: var(--accent-ink); border-color: transparent; border-style: solid; }
  .n { opacity: 0.6; margin-left: 5px; font-variant-numeric: tabular-nums; }
  .search { display: flex; gap: 6px; margin-bottom: 20px; }
  .search input {
    min-width: 0; flex: 1; font: inherit; background: var(--panel-2); color: var(--ink);
    border: 1px solid var(--edge); border-radius: 8px; padding: 6px 8px;
  }
  .bar { display: flex; align-items: center; gap: 14px; margin-bottom: 14px;
         color: var(--ink-faint); font-size: 0.9rem; }
  .bar .spacer { flex: 1; }
  .bar a.on { color: var(--ink); font-weight: 600; }
  /* The sort links were 22px of tappable height sitting 14px apart - two thumb-sized mistakes in a
     row. Padding and a wrap, so "Most loved / Newest / Most detailed" is usable rather than lucky. */
  @media (max-width: 720px) {
    .bar { flex-wrap: wrap; gap: 4px 14px; }
    .bar a { padding: 8px 0; }
    .bar .spacer { flex-basis: 100%; height: 0; }
  }
  .narrow { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin: 0 0 14px;
            color: var(--ink-faint); font-size: 0.9rem; }
</style>
