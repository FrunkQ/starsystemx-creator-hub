<script lang="ts">
  // A starmap's contents as a TREE - and the place to copy any part of it.
  //
  // ============================================================================================
  // WHY NOT THE FLAT TABLE IT REPLACED. A real campaign is 161 bodies and 11 constructs, and the
  // flat list rendered every one of them alphabetically - so "40 Eridani BC Barycentre" sat between
  // two stars it has nothing to do with, and the page was thousands of pixels of rows nobody reads.
  //
  // The data already has the structure: every node carries `parent_id`. Using it costs nothing and
  // turns a wall into something you can skim - a star, its planets, their moons, in the order they
  // actually orbit.
  // ============================================================================================
  //
  // COLLAPSED BY DEFAULT, and summarised where it is collapsed: a branch has to say what is inside
  // it before somebody decides whether to open it, or collapsing has merely hidden the information
  // rather than organised it.
  //
  // "DISTANCE" MEANS WHAT THE LEVEL MEANS (owner, 2026-09-04). At the top of a starmap it is the
  // distance from the origin star - the one the map was built outward from; inside a system it is
  // the orbit. One number per row (`distance`, 0015), one sort, and the hierarchy is never
  // flattened by it. Rows without a number (older uploads) fall back to size, stars first.
  //
  // FILTER BY WHAT IS IN THE MAP (owner, 2026-09-05; D-31). The roles, the tags the objects carry,
  // a word, and whether an object is described, pictured or modelled - the rules are in
  // src/lib/treeFilter.ts. A match is shown with the path down to it; everything else is hidden.
  //
  // ONE PLACE FOR COPYING, NOT TWO. Every row carries its own copy control, and copying a BRANCH
  // copies everything under it. The format is bundle/clip.ts; the paste side is the engine's R-14.
  //
  // THE TREE REMEMBERS. Which branches you opened and how you sorted are kept per map in this
  // browser (localStorage), so coming back to a map finds it as you left it. A convenience, not
  // state that matters: it is wrapped in try/catch and the page is right without it.
  import { onMount, tick } from 'svelte';
  import RoleIcon from './RoleIcon.svelte';
  import { COPY_ICON, TICK_ICON, CODE_ICON, LINK_ICON, orderRoles } from './roleIcons';
  import { buildClip, clipText, deepLink, nodeFromHash, type ClipSource, type CreditLike } from '$lib/bundle/clip';
  import {
    EMPTY_FILTER, isActive, visibleIds, tagGroups, roleCounts, tagParts, isDescribed,
    type TreeFilter, type FilterableNode
  } from '$lib/treeFilter';

  interface Node extends FilterableNode {
    kind: string;
    // Required here: the clip is built from it (bundle/clip.ts), so a row always carries one.
    snippet: unknown;
    distance?: number | null;
  }

  let { nodes, source, credits = [], openDepth = 1 }: {
    nodes: Node[]; source: ClipSource; credits?: CreditLike[]; openDepth?: number
  } = $props();

  // The row a deep link (#node=<id>) points at: its branch is opened, it is scrolled to and lit.
  let hit = $state<string | null>(null);

  type Sort = 'distance' | 'name';
  let sort = $state<Sort>('distance');
  // Which rows are open, by id. Empty means "the defaults" (open to `openDepth`).
  let open = $state<Record<string, boolean>>({});
  let expanded = $state<boolean | null>(null);
  let epoch = $state(0);
  let copiedId = $state<string | null>(null);
  // Whose own JSON is on screen. Rendered lazily: 170 pretty-printed blocks in the DOM at once
  // would be most of the page's weight for something almost nobody opens.
  let shown = $state<Record<string, boolean>>({});

  // THE FILTER. Not remembered between visits: a filter that survives a reload reads as a broken
  // map ("where did Jupiter go?").
  let filter = $state<TreeFilter>({ ...EMPTY_FILTER });
  const active = $derived(isActive(filter));
  const found = $derived(visibleIds(nodes, filter));
  const roleChips = $derived(orderRoles(roleCounts(nodes)));
  // Every tag, grouped by the engine's namespace: the rare ones are the ones people filter for.
  const groups = $derived(tagGroups(nodes));
  // ROW PILLS ARE OFF BY DEFAULT (owner, 2026-09-05: "too busy"). A row shows its tags when the
  // filter matched it - so you can see why - or when the person switched them on for every row.
  let showTags = $state(false);
  const tagsOn = (id: string) => showTags || (active && found.matched.has(id));
  const anyDescribed = $derived(nodes.some(isDescribed));
  const anyPictured = $derived(nodes.some((n) => !!n.image_sha256));
  const anyModelled = $derived(nodes.some((n) => !!n.model_sha256));

  const setRole = (role: string) => { filter.role = filter.role === role ? null : role; };
  const toggleTag = (t: string) => {
    filter.tags = filter.tags.includes(t) ? filter.tags.filter((x) => x !== t) : [...filter.tags, t];
  };
  const clearFilter = () => { filter = { ...EMPTY_FILTER }; };

  const memoryKey = $derived('tree:' + source.url);

  // Restore what this browser remembers for this map: ONCE, on the client, in onMount.
  //
  // NOT an $effect. The first version was one, and it locked every map page (0.10.1): `epoch++`
  // READS epoch before writing it, so the effect depended on the very value it changed, re-ran on
  // its own write, and Svelte stopped it at the update-depth limit after a quarter of a million
  // console errors. An effect that writes state must not read that state. onMount runs once and
  // tracks nothing, which is what "restore on load" means.
  onMount(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(memoryKey) ?? 'null');
      if (saved && typeof saved === 'object') {
        if (saved.sort === 'name' || saved.sort === 'distance') sort = saved.sort;
        if (typeof saved.showTags === 'boolean') showTags = saved.showTags;
        if (saved.open && typeof saved.open === 'object') { open = saved.open; epoch += 1; }
      }
    } catch { /* no memory is fine */ }

    // A DEEP LINK lands on the object, not the page: open every branch above it, scroll to it,
    // light it for a moment. This is what a credit's "true source" link resolves to.
    const target = nodeFromHash(location.hash);
    if (target && nodes.some((n) => n.node_id === target)) {
      const parentOf = new Map(nodes.map((n) => [n.node_id, n.parent_id]));
      const next = { ...open };
      for (let id: string | null = target; id; id = parentOf.get(id) ?? null) next[id] = true;
      open = next;
      epoch += 1;
      hit = target;
      tick().then(() => {
        document.querySelector('[data-node="' + CSS.escape(target) + '"]')?.scrollIntoView({ block: 'center' });
        setTimeout(() => { if (hit === target) hit = null; }, 3500);
      });
    }
  });

  async function copyLink(id: string) {
    try {
      await navigator.clipboard.writeText(deepLink(source.url, id));
      copiedId = 'link:' + id;
      setTimeout(() => { if (copiedId === 'link:' + id) copiedId = null; }, 1600);
    } catch {
      copiedId = null;
    }
  }

  function remember() {
    try {
      localStorage.setItem(memoryKey, JSON.stringify({ sort, open, showTags }));
    } catch { /* storage refused: nothing lost but a convenience */ }
  }

  interface TreeNode extends Node { children: TreeNode[]; total: number; roles: Record<string, number> }

  const tree = $derived.by(() => {
    const byId = new Map<string, TreeNode>();
    // Under a filter only the matches and the path down to them exist; the rest is not drawn.
    for (const n of nodes) {
      if (active && !found.visible.has(n.node_id)) continue;
      byId.set(n.node_id, { ...n, children: [], total: 0, roles: {} });
    }

    const roots: TreeNode[] = [];
    for (const n of byId.values()) {
      const parent = n.parent_id ? byId.get(n.parent_id) : undefined;
      // A node whose parent is missing becomes a root rather than vanishing. Losing a body because
      // its parent was filtered out would be a silent hole in the listing.
      (parent ? parent.children : roots).push(n);
    }

    // Depth-first totals, so a collapsed branch can say how much it hides.
    const measure = (n: TreeNode): number => {
      for (const c of n.children) {
        measure(c);
        n.total += c.total + 1;
        for (const [r, v] of Object.entries(c.roles)) n.roles[r] = (n.roles[r] ?? 0) + v;
        if (c.role_hint) n.roles[c.role_hint] = (n.roles[c.role_hint] ?? 0) + 1;
      }
      return n.total;
    };
    for (const r of roots) measure(r);

    // Distance: nearest first at every level; rows without a number after them, stars first and
    // then by what is under them. A to Z is alphabetical at every level.
    const fallback = (a: TreeNode, b: TreeNode) =>
      (b.role_hint === 'star' ? 1 : 0) - (a.role_hint === 'star' ? 1 : 0)
      || b.total - a.total
      || a.name.localeCompare(b.name);
    const byDistance = (a: TreeNode, b: TreeNode) => {
      const da = a.distance ?? Infinity, db = b.distance ?? Infinity;
      return da !== db ? da - db : fallback(a, b);
    };
    const byName = (a: TreeNode, b: TreeNode) => a.name.localeCompare(b.name);
    const order = sort === 'name' ? byName : byDistance;
    const sortAll = (list: TreeNode[]) => { list.sort(order); for (const n of list) sortAll(n.children); };
    sortAll(roots);

    return roots;
  });

  // Under a filter every surviving branch is open: the point of filtering is to see the matches.
  const isOpen = (id: string, depth: number) => active || (open[id] ?? expanded ?? depth < openDepth);

  function toggled(id: string, e: Event) {
    if (active) return; // a toggle inside a filtered view is not a preference worth keeping
    open[id] = (e.currentTarget as HTMLDetailsElement).open;
    remember();
  }

  function setSort(to: Sort) { sort = to; remember(); }
  function setAll(to: boolean) { expanded = to; open = {}; epoch++; remember(); }

  /** An orbit, in the unit a person would use for it. Only children have one worth showing. */
  function orbitLabel(au: number): string {
    if (au >= 0.05) return au.toFixed(au >= 10 ? 1 : 2) + ' AU';
    return Math.round(au * 149597870.7).toLocaleString('en-GB') + ' km';
  }

  async function copy(id: string) {
    const clip = buildClip(nodes, id, source, credits);
    if (!clip) return;
    try {
      await navigator.clipboard.writeText(clipText(clip));
      copiedId = id;
      setTimeout(() => { if (copiedId === id) copiedId = null; }, 1600);
    } catch {
      copiedId = null; // a denied clipboard permission is not an error worth shouting about
    }
  }

  // A control inside <summary> must not also toggle the <details> it sits in.
  const swallow = (e: Event) => { e.preventDefault(); e.stopPropagation(); };

  const own = (n: Node) => JSON.stringify(n.snippet, null, 2);
</script>

{#snippet actions(node: TreeNode, isBranch: boolean)}
  <span class="acts">
    <button type="button" class:done={copiedId === 'link:' + node.node_id} title="Copy a link to this object"
      onclick={(e) => { swallow(e); copyLink(node.node_id); }}>
      <svg viewBox="0 0 24 24"><path d={copiedId === 'link:' + node.node_id ? TICK_ICON : LINK_ICON} /></svg>
    </button>
    {#if isBranch}
      <button type="button" class:on={shown[node.node_id]} title="Show this object's JSON"
        onclick={(e) => { swallow(e); shown[node.node_id] = !shown[node.node_id]; }}>
        <svg viewBox="0 0 24 24"><path d={CODE_ICON} /></svg>
      </button>
    {/if}
    <button type="button" class="copy" class:done={copiedId === node.node_id}
      title={isBranch ? 'Copy this and everything under it, for Star System Explorer' : 'Copy this object, for Star System Explorer'}
      onclick={(e) => { swallow(e); copy(node.node_id); }}>
      <svg viewBox="0 0 24 24"><path d={copiedId === node.node_id ? TICK_ICON : COPY_ICON} /></svg>
      <span>{copiedId === node.node_id ? 'Copied' : isBranch ? 'Copy ' + (node.total + 1) : 'Copy'}</span>
    </button>
  </span>
{/snippet}

{#snippet summaryOf(node: TreeNode)}
  <!-- A fixed order, each count with its symbol: planets, moons, rings, belts, then the built
       things. The eye finds "moons" in the same place on every row. -->
  <span class="sum">
    {#each orderRoles(node.roles) as [role, n] (role)}
      <span class="rc"><RoleIcon role={role} size={12} />{n} {role}{n === 1 ? '' : 's'}</span>
    {/each}
  </span>
{/snippet}

{#snippet tagList(tags: string[], limit: number)}
  {#each tags.slice(0, limit) as t}
    {@const p = tagParts(t)}
    <button type="button" class="tag" class:on={filter.tags.includes(t)} title={'Filter the map by ' + t}
      onclick={(e) => { swallow(e); toggleTag(t); }}>{p.key}{#if p.value}<b>{p.value}</b>{/if}</button>
  {/each}
  {#if tags.length > limit}<span class="more">+{tags.length - limit}</span>{/if}
{/snippet}

{#snippet distanceOf(node: TreeNode)}
  {#if sort === 'distance' && node.parent_id && node.distance != null}
    <span class="dist">{orbitLabel(node.distance)}</span>
  {/if}
{/snippet}

{#snippet branch(node: TreeNode, depth: number)}
  {#if node.children.length}
    <details open={isOpen(node.node_id, depth)} style="--depth: {depth}" data-node={node.node_id}
      class:hit={hit === node.node_id} class:dim={active && !found.matched.has(node.node_id)}
      ontoggle={(e) => toggled(node.node_id, e)}>
      <summary>
        <RoleIcon role={node.role_hint} kind={node.kind} />
        <span class="name">{node.name}</span>
        {#if node.role_hint}<span class="role">{node.role_hint}</span>{/if}
        {@render distanceOf(node)}
        {@render summaryOf(node)}
        {@render actions(node, true)}
      </summary>
      {#if node.tags.length && tagsOn(node.node_id)}
        <div class="tags" style="--depth: {depth + 1}">{@render tagList(node.tags, 40)}</div>
      {/if}
      {#if shown[node.node_id]}
        <pre style="--depth: {depth + 1}"><code>{own(node)}</code></pre>
      {/if}
      {#each node.children as child (child.node_id)}
        {@render branch(child, depth + 1)}
      {/each}
    </details>
  {:else}
    <!-- A leaf opens to its own JSON: that IS the drill-down to a single body. -->
    <details style="--depth: {depth}" data-node={node.node_id} class:hit={hit === node.node_id}
      class:dim={active && !found.matched.has(node.node_id)}
      open={hit === node.node_id ? true : undefined}
      ontoggle={(e) => { shown[node.node_id] = e.currentTarget.open; }}>
      <summary>
        <RoleIcon role={node.role_hint} kind={node.kind} />
        <span class="name">{node.name}</span>
        {#if node.role_hint}<span class="role">{node.role_hint}</span>{/if}
        {@render distanceOf(node)}
        {#if node.tags.length && tagsOn(node.node_id)}<span class="tags inline">{@render tagList(node.tags, 6)}</span>{/if}
        {@render actions(node, false)}
      </summary>
      {#if shown[node.node_id]}
        <pre style="--depth: {depth + 1}"><code>{own(node)}</code></pre>
      {/if}
    </details>
  {/if}
{/snippet}

<!-- THE FILTER: what is in this map, as controls. Roles with their counts, then the map's own
     tags, most common first. Every chip narrows; the row pills below toggle the same tags. -->
<div class="filters">
  <input class="q" type="search" placeholder="Find a planet, a station, a tag" bind:value={filter.text} aria-label="Find in this map" />
  <div class="chips">
    {#each roleChips as [role, n] (role)}
      <button type="button" class="chip" class:on={filter.role === role} onclick={() => setRole(role)}>
        <RoleIcon role={role} size={12} />{n} {role}{n === 1 ? '' : 's'}
      </button>
    {/each}
    {#if anyDescribed}<button type="button" class="chip" class:on={filter.described} onclick={() => (filter.described = !filter.described)}>described</button>{/if}
    {#if anyPictured}<button type="button" class="chip" class:on={filter.pictured} onclick={() => (filter.pictured = !filter.pictured)}>with a picture</button>{/if}
    {#if anyModelled}<button type="button" class="chip" class:on={filter.modelled} onclick={() => (filter.modelled = !filter.modelled)}>with a 3D model</button>{/if}
  </div>
  {#if groups.length}
    <!-- Every tag in the map, by the engine's namespace, so a biosignature on one world is as
         findable as a lock on sixty. -->
    <div class="groups">
      {#each groups as g (g.ns)}
        <div class="chips group">
          <span class="lbl">{g.ns || 'other'}</span>
          {#each g.tags as [t, n] (t)}
            {@const p = tagParts(t)}
            <button type="button" class="chip tag" class:on={filter.tags.includes(t)} onclick={() => toggleTag(t)} title={t}>
              {p.key}{#if p.value}<b>{p.value}</b>{/if}<i>{n}</i>
            </button>
          {/each}
        </div>
      {/each}
    </div>
  {/if}
</div>

<div class="bar">
  <span class="hint">
    {#if active}{found.matched.size} of {nodes.length} match{:else}{nodes.length} {nodes.length === 1 ? 'object' : 'objects'}{/if}
  </span>
  {#if active}<button type="button" class="ghost" onclick={clearFilter}>Clear the filter</button>{/if}
  <div class="seg" role="group" aria-label="Order">
    <button type="button" class:on={sort === 'distance'} onclick={() => setSort('distance')}
      title="Nearest first: from the origin star at the top of a starmap, by orbit inside a system">Distance</button>
    <button type="button" class:on={sort === 'name'} onclick={() => setSort('name')}>A to Z</button>
  </div>
  <button type="button" class="ghost" onclick={() => setAll(true)}>Expand all</button>
  <button type="button" class="ghost" onclick={() => setAll(false)}>Collapse all</button>
  <button type="button" class="ghost" class:on={showTags} onclick={() => { showTags = !showTags; remember(); }}
    title="Show every object's tags on its row. Off, a row shows them only when the filter matched it.">
    {showTags ? 'Hide tags' : 'Show tags'}
  </button>
</div>

{#key epoch}
  <div class="tree">
    {#each tree as root (root.node_id)}
      {@render branch(root, 0)}
    {/each}
    {#if active && !tree.length}
      <p class="none">Nothing in this map matches. <button type="button" class="linkish" onclick={clearFilter}>Clear the filter</button></p>
    {/if}
  </div>
{/key}

<style>
  .filters { display: flex; flex-direction: column; gap: 6px; margin: 0 0 10px; }
  .q {
    font: inherit; font-size: 0.9rem; width: min(100%, 360px);
    background: var(--panel-2); color: var(--ink); border: 1px solid var(--edge); border-radius: 8px; padding: 6px 10px;
  }
  .chips { display: flex; flex-wrap: wrap; gap: 4px 6px; align-items: center; }
  .lbl { color: var(--ink-faint); font-size: 0.8rem; margin-right: 4px; }
  .groups { display: flex; flex-direction: column; gap: 4px; }
  .group .lbl { min-width: 84px; text-transform: lowercase; letter-spacing: 0.02em; }
  .ghost.on { background: var(--panel-2); color: var(--ink); }
  .chip {
    display: inline-flex; align-items: center; gap: 5px;
    font: inherit; font-size: 0.8rem; padding: 2px 9px; cursor: pointer;
    background: var(--panel-2); color: var(--ink-dim); border: 1px solid var(--edge); border-radius: 999px;
  }
  .chip:hover { color: var(--ink); border-color: var(--ink-faint); }
  .chip.on { color: var(--accent-ink); background: var(--accent); border-color: var(--accent); }
  .chip.on :global(.role-icon) { color: var(--accent-ink); }
  .chip.tag b { font-weight: 600; margin-left: 2px; }
  .chip.tag i { font-style: normal; opacity: 0.6; font-size: 0.72rem; }

  .bar { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin: 0 0 8px; }
  .hint { color: var(--ink-faint); font-size: 0.9rem; margin-right: auto; }
  .seg { display: inline-flex; border: 1px solid var(--edge); border-radius: 8px; overflow: hidden; }
  .seg button, .ghost {
    font: inherit; font-size: 0.85rem; padding: 5px 10px; cursor: pointer;
    background: var(--panel); color: var(--ink-dim); border: none;
  }
  .seg button + button { border-left: 1px solid var(--edge); }
  .seg button.on { background: var(--panel-2); color: var(--ink); }
  .ghost { border: 1px solid var(--edge); border-radius: 8px; }
  .ghost:hover, .seg button:hover { color: var(--ink); }

  .tree { border: 1px solid var(--edge); border-radius: var(--radius); overflow: hidden; }
  details { border-top: 1px solid var(--edge); padding-left: calc(10px + var(--depth) * 16px); }
  .tree > :first-child { border-top: none; }
  summary {
    display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
    padding: 7px 10px 7px 0; cursor: pointer; color: var(--ink-faint);
  }
  summary::marker { color: var(--ink-faint); }
  summary:hover { background: var(--panel-2); }
  /* The row a deep link landed on: lit, then let go. */
  details.hit > summary { background: var(--panel-2); box-shadow: inset 3px 0 0 var(--accent); }
  /* Under a filter, a row that is only the way down to a match. */
  details.dim > summary > .name { color: var(--ink-faint); font-weight: 500; }
  .none { margin: 0; padding: 14px 12px; color: var(--ink-faint); }
  .name { color: var(--ink); font-weight: 550; }
  .role { color: var(--ink-faint); font-size: 0.85rem; }
  .dist { color: var(--ink-faint); font-size: 0.8rem; font-variant-numeric: tabular-nums; }
  .sum { color: var(--ink-dim); font-size: 0.85rem; margin-left: auto; display: inline-flex; flex-wrap: wrap; gap: 4px 12px; }
  .rc { display: inline-flex; align-items: center; gap: 4px; white-space: nowrap; }
  .rc :global(.role-icon) { opacity: 0.7; }

  /* The actions: quiet until the row is hovered or focused, so 170 rows do not become 340 buttons
     shouting at once - but always present, so keyboard users find them. */
  .acts { display: inline-flex; gap: 4px; margin-left: 6px; }
  .acts button {
    display: inline-flex; align-items: center; gap: 5px;
    font: inherit; font-size: 0.78rem; padding: 3px 7px; cursor: pointer;
    background: transparent; color: var(--ink-faint); border: 1px solid transparent; border-radius: 6px;
    opacity: 0.55;
  }
  summary:hover .acts button, .acts button:focus-visible, .acts button.on, .acts button.done { opacity: 1; }
  .acts button:hover, .acts button.on { color: var(--ink); border-color: var(--edge); background: var(--panel); }
  .acts button.done { color: var(--accent); }
  .acts svg { width: 14px; height: 14px; fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }

  .tags { display: flex; flex-wrap: wrap; gap: 4px; padding: 0 12px 8px calc(10px + var(--depth) * 16px); }
  .tags.inline { padding: 0; margin-left: auto; }
  .sum + .acts { margin-left: 0; }
  /* A row's pills are buttons that toggle the filter, styled as the pills they were. */
  .tags .tag { font: inherit; cursor: pointer; }
  .tags .tag:hover { border-color: var(--ink-faint); color: var(--ink); }
  .tags .tag.on { color: var(--accent-ink); background: var(--accent); border-color: var(--accent); }
  .tags .tag.on b { color: var(--accent-ink); }
  .tag b { font-weight: 600; color: var(--ink); margin-left: 4px; }
  .more { color: var(--ink-faint); font-size: 0.8rem; align-self: center; }

  pre {
    margin: 0 12px 10px calc(10px + var(--depth) * 16px);
    padding: 10px 12px; max-height: 360px; overflow: auto;
    background: var(--bg); border: 1px solid var(--edge); border-radius: 8px;
    font-size: 0.8rem; line-height: 1.45;
  }
</style>
