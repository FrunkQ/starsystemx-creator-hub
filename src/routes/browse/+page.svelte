<script lang="ts">
  // Discovery. For a funnel, this IS the product (design 7.5) - a map nobody can find is a map
  // nobody downloads, and every download is Star System Explorer opened.
  //
  // Plain links, not JavaScript state: every filtered view is a URL somebody can paste into a
  // Discord channel. That matters more here than slickness does.
  import SystemCard from '$lib/components/SystemCard.svelte';
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
</p>

<div class="layout">
  <aside>
    <form method="GET" class="search">
      <input name="q" value={data.q} placeholder="Search titles" aria-label="Search titles" />
      {#each data.selected as t}<input type="hidden" name="tag" value={t} />{/each}
      {#if data.kind}<input type="hidden" name="kind" value={data.kind} />{/if}
      <button type="submit">Go</button>
    </form>

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
          <SystemCard {system} best={data.best} />
        {/each}
      </div>
    {/if}
  </div>
</div>

<style>
  h1 { margin: 0 0 6px; }
  .lede { color: var(--ink-dim); margin: 0 0 22px; max-width: 62ch; }
  .layout { display: grid; grid-template-columns: 220px minmax(0, 1fr); gap: 26px; }
  @media (max-width: 760px) { .layout { grid-template-columns: 1fr; } }
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
  .narrow { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin: 0 0 14px;
            color: var(--ink-faint); font-size: 0.9rem; }
</style>
