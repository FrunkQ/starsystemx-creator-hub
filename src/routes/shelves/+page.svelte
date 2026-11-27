<script lang="ts">
  import { providesLine } from '$lib/v4/read';
  import { FAN_WORK_BADGE } from '$lib/fanWork';
  import ItemBadges from '$lib/components/ItemBadges.svelte';
  import { v4Badges, v3Badges } from '$lib/itemBadges';
  let { data } = $props();
  const empty = $derived(data.shelves.every((s) => s.items.length === 0) && data.fan.length === 0 && data.v3.every((s) => s.items.length === 0));
  // Built as one string: Svelte drops the space at the start of an {#if} block, which printed
  // "Nothing on the shelvesmatches".
  const nothingLine = $derived('Nothing on the shelves'
    + (data.contains ? ' contains ' + data.contains.label : '')
    + (data.contains && data.q ? ' and' : '')
    + (data.q ? ' matches "' + data.q + '"' : '') + '.');
  const qs = (contains: string | null) => {
    const p = new URLSearchParams();
    if (contains) p.set('contains', contains);
    if (data.q) p.set('q', data.q);
    const t = p.toString();
    return '/shelves' + (t ? '?' + t : '');
  };
</script>

<svelte:head><title>Shelves - {data.site.name}</title></svelte:head>

<h1>Shelves</h1>
<p class="lede">
  Everything on Explorers: packs and campaigns for Star System Explorer 4, and the V3 library of
  starmaps and systems. A pack adds to a campaign: a setting's ships and bases, a game's rules, new
  physics, a vocabulary or a look. <a href="/upload/v4">Share your own</a>.
</p>

<form class="search" method="GET" action="/shelves" role="search">
  {#if data.contains}<input type="hidden" name="contains" value={data.contains.slug} />{/if}
  <input type="search" name="q" value={data.q} placeholder="Search every shelf" maxlength="80" aria-label="Search every shelf" />
  <button type="submit">Search</button>
  {#if data.q}<a href={qs(data.contains?.slug ?? null).replace(/[?&]q=[^&]*/, '')}>clear</a>{/if}
</form>

{#if data.choices.length}
  <nav class="contains" aria-label="Packs that contain">
    <span class="lbl">Contains</span>
    <a href={qs(null)} class:on={!data.contains} data-sveltekit-noscroll>anything</a>
    {#each data.choices as ch (ch.slug)}
      <a href={qs(ch.slug)} class:on={data.contains?.slug === ch.slug} data-sveltekit-noscroll>{ch.label}{#if ch.packs} <span class="n">{ch.packs}</span>{/if}</a>
    {/each}
  </nav>
{/if}

{#if (data.contains || data.q) && empty}
  <p class="panel">{nothingLine} <a href="/shelves">Show everything</a>.</p>
{:else if empty}
  <p class="panel">Nothing on the shelves yet. The first SSE4 packs and campaigns will appear here.</p>
{/if}

{#snippet card(c: any)}
  <a class="card" href="/v/{c.slug}">
    <span class="top"><ItemBadges badges={v4Badges(c)} /></span>
    <strong>{c.title}</strong>
    {#if c.summary}<span class="sum">{c.summary}</span>{/if}
    <span class="meta">
      {#if c.kind === 'pack'}{c.pack_id} {c.pack_version}{#if providesLine(c.provides)}{' · '}{providesLine(c.provides)}{/if}{:else}{c.event_count} events{/if}
    </span>
    <span class="meta">{c.creator ?? 'unknown'} · {c.download_count} downloads</span>
    {#if c.fan_setting}<span class="fan">{FAN_WORK_BADGE}: {c.fan_setting}</span>{/if}
  </a>
{/snippet}

{#each data.shelves.filter((s) => s.items.length) as s (s.id)}
  <section>
    <h2>{s.title}</h2>
    <p class="blurb">{s.blurb}</p>
    <div class="grid">{#each s.items as c (c.id)}{@render card(c)}{/each}</div>
  </section>
{/each}

{#snippet v3card(c: any)}
  <a class="card" href="/s/{c.slug}">
    <span class="top"><ItemBadges badges={v3Badges(c)} /></span>
    <strong>{c.title}</strong>
    {#if c.blurb || c.summary}<span class="sum">{c.blurb ?? c.summary}</span>{/if}
    <span class="meta">{c.kind === 'starmap' ? (c.system_count ?? 0) + ' systems · ' : ''}{c.body_count ?? 0} bodies · {c.download_count} downloads · {c.hearts_count} stars</span>
    {#if c.fan_setting}<span class="fan">{FAN_WORK_BADGE}: {c.fan_setting}</span>{/if}
  </a>
{/snippet}

{#each data.v3 as s (s.id)}
  {#if s.items.length || s.failed}
    <section>
      <h2>{s.title}</h2>
      <p class="blurb">{s.blurb}</p>
      {#if s.failed}<p class="panel">This shelf could not be read right now.</p>{/if}
      <div class="grid">{#each s.items as c (c.slug)}{@render v3card(c)}{/each}</div>
      <p class="all"><a href={s.all}>{s.more ? 'See them all, with every filter' : 'Open on Browse, with every filter'}</a></p>
    </section>
  {/if}
{/each}

{#if data.fan.length}
  <section class="fanshelf">
    <h2>Fan-made, unofficial</h2>
    <p class="blurb">Made by fans for settings that belong to other people. Rules, numbers and plain
      names only; always free; not affiliated with or endorsed by the owners.</p>
    <div class="grid">{#each data.fan as c (c.id)}{@render card(c)}{/each}</div>
  </section>
{/if}

<style>
  h1 { margin: 0 0 6px; }
  .search { display: flex; gap: 8px; align-items: center; margin: 0 0 12px; flex-wrap: wrap; }
  .search input[type='search'] { flex: 1 1 220px; max-width: 420px; }
  .all { margin: 8px 0 0; font-size: 0.92rem; }
  .lede { color: var(--ink-dim); margin: 0 0 20px; max-width: 64ch; }
  section { margin: 26px 0; }
  .contains { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; margin: 0 0 8px; }
  .contains .lbl { color: var(--ink-faint); font-size: 0.85rem; margin-right: 4px; }
  .contains a { font-size: 0.88rem; padding: 2px 8px; border: 1px solid var(--edge); border-radius: var(--radius); color: var(--ink-dim); text-decoration: none; }
  .contains a:hover { border-color: var(--accent); color: var(--ink); }
  .contains a.on { background: var(--ink); color: var(--accent-ink, var(--bg)); border-color: var(--ink); }
  .contains .n { font-family: var(--font-mono); font-size: 0.78rem; opacity: 0.7; }
  h2 { margin: 0 0 4px; }
  .blurb { color: var(--ink-faint); margin: 0 0 12px; font-size: 0.95rem; }
  .fanshelf { border-top: var(--cr-line-heavy, 1.6px) solid var(--edge); padding-top: 16px; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 12px; }
  .card { display: flex; flex-direction: column; gap: 4px; padding: 12px; border: 1px solid var(--edge);
    border-radius: var(--radius); background: var(--panel); color: var(--ink); text-decoration: none; }
  .card:hover { border-color: var(--accent); }
  .top { display: flex; gap: 6px; align-items: center; font-size: 0.8rem; color: var(--ink-faint); }
  .sum { color: var(--ink-dim); font-size: 0.92rem; }
  .meta { color: var(--ink-faint); font-size: 0.85rem; font-family: var(--font-mono); overflow-wrap: anywhere; }
  .fan { font-size: 0.85rem; color: var(--ink-dim); }
</style>
