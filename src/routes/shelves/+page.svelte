<script lang="ts">
  import { providesLine } from '$lib/v4/read';
  import { FAN_WORK_BADGE } from '$lib/fanWork';
  let { data } = $props();
  const empty = $derived(data.shelves.every((s) => s.items.length === 0) && data.fan.length === 0);
</script>

<svelte:head><title>Shelves - {data.site.name}</title></svelte:head>

<h1>Shelves <span class="gen">v4</span></h1>
<p class="lede">
  Packs and campaigns for Star System Explorer 4. A pack adds to a campaign: a setting's ships and
  bases, a game's rules, new physics, a vocabulary or a look. V3 maps are on <a href="/browse">Browse</a>.
  <a href="/upload/v4">Share your own</a>.
</p>

{#if data.choices.length}
  <nav class="contains" aria-label="Packs that contain">
    <span class="lbl">Contains</span>
    <a href="/shelves" class:on={!data.contains} data-sveltekit-noscroll>anything</a>
    {#each data.choices as ch (ch.slug)}
      <a href="/shelves?contains={ch.slug}" class:on={data.contains?.slug === ch.slug} data-sveltekit-noscroll>{ch.label} <span class="n">{ch.packs}</span></a>
    {/each}
  </nav>
{/if}

{#if data.contains && empty}
  <p class="panel">Nothing on the shelves contains {data.contains.label} yet. <a href="/shelves">Show everything</a>.</p>
{:else if empty}
  <p class="panel">Nothing on the shelves yet. The first SSE4 packs and campaigns will appear here.</p>
{/if}

{#snippet card(c: any)}
  <a class="card" href="/v/{c.slug}">
    <span class="top"><span class="gen">v4</span> <span class="kind">{c.kind === 'pack' ? c.pack_kinds.join(', ') : 'campaign'}</span>
      {#if c.fictional}<span class="flag">fictional physics</span>{/if}</span>
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
  .gen { font-family: var(--font-mono); font-size: 0.75rem; border: 1px solid var(--edge); padding: 0 5px; color: var(--ink-dim); }
  .flag { color: var(--warn, var(--ink-dim)); }
  .sum { color: var(--ink-dim); font-size: 0.92rem; }
  .meta { color: var(--ink-faint); font-size: 0.85rem; font-family: var(--font-mono); overflow-wrap: anywhere; }
  .fan { font-size: 0.85rem; color: var(--ink-dim); }
</style>
