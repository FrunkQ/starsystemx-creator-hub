<script lang="ts">
  // Discovery. For a funnel, this IS the product (design 7.5) - a map nobody can find is a map
  // nobody downloads, and every download is Star System Explorer opened.
  //
  // Plain links, not JavaScript state: every filtered view is a URL somebody can paste into a
  // Discord channel. That matters more here than slickness does.
  import SystemCard from '$lib/components/SystemCard.svelte';
  let { data } = $props();

  const selected = $derived(new Set(data.selected));

  /** Toggle one pill, preserving the rest of the query. */
  function hrefFor(tag: string): string {
    const p = new URLSearchParams();
    for (const t of data.selected) if (t !== tag) p.append('tag', t);
    if (!selected.has(tag)) p.append('tag', tag);
    if (data.q) p.set('q', data.q);
    if (data.sort === 'new') p.set('sort', 'new');
    const s = p.toString();
    return s ? '/browse?' + s : '/browse';
  }

  function sortHref(to: 'loved' | 'new'): string {
    const p = new URLSearchParams();
    for (const t of data.selected) p.append('tag', t);
    if (data.q) p.set('q', data.q);
    if (to === 'new') p.set('sort', 'new');
    const s = p.toString();
    return s ? '/browse?' + s : '/browse';
  }
</script>

<svelte:head>
  <title>Browse maps - StarSystemX Creator Hub</title>
  <meta name="description" content="Star systems and campaign starmaps to download and open in Star System Explorer." />
</svelte:head>

<h1>Browse</h1>
<p class="lede">
  Every map here is free to download in one click, no account needed.
  The pills are worked out from the file itself, so they are accurate rather than claimed.
</p>

<div class="layout">
  <aside>
    <form method="GET" class="search">
      <input name="q" value={data.q} placeholder="Search titles" aria-label="Search titles" />
      {#each data.selected as t}<input type="hidden" name="tag" value={t} />{/each}
      <button type="submit">Go</button>
    </form>

    {#each data.groups as group}
      <section>
        <h2>{group.label}</h2>
        <div class="pills">
          {#each group.tags as tag}
            {@const n = data.counts[tag] ?? 0}
            {#if n > 0 || selected.has(tag)}
              <a class="tag" class:on={selected.has(tag)} href={hrefFor(tag)}>
                {tag}{#if n > 0}<span class="n">{n}</span>{/if}
              </a>
            {/if}
          {/each}
        </div>
      </section>
    {/each}

    {#if data.selected.length}
      <p><a href="/browse">Clear all filters</a></p>
    {/if}
  </aside>

  <div class="results">
    <div class="bar">
      <span>{data.systems.length} {data.systems.length === 1 ? 'map' : 'maps'}</span>
      <span class="spacer"></span>
      <a class:on={data.sort === 'loved'} href={sortHref('loved')}>Most loved</a>
      <a class:on={data.sort === 'new'} href={sortHref('new')}>Newest</a>
    </div>

    {#if !data.systems.length}
      <div class="panel notice">
        <h3>Nothing matches</h3>
        <p>
          {#if data.selected.length || data.q}
            Try removing a filter. <a href="/browse">Clear all</a>.
          {:else}
            No maps have been published yet.
          {/if}
        </p>
      </div>
    {:else}
      <div class="grid">
        {#each data.systems as system (system.slug)}
          <SystemCard {system} />
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
  a.tag.on { background: var(--accent); color: var(--accent-ink); border-color: transparent; }
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
</style>
