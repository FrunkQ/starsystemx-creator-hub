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
  // ONE PLACE FOR COPYING, NOT TWO. This tree used to sit above a second, flat list of 172 JSON
  // blocks ("Copy one piece") that had exactly the problem the tree had just solved. Now every row
  // carries its own copy control, and copying a BRANCH copies everything under it: a star and all
  // its planets, a planet and its moons. The format is bundle/clip.ts; the paste side is the
  // engine's R-14.
  import RoleIcon from './RoleIcon.svelte';
  import { COPY_ICON, TICK_ICON, CODE_ICON } from './roleIcons';
  import { buildClip, clipText, type ClipSource } from '$lib/bundle/clip';

  interface Node {
    node_id: string;
    parent_id: string | null;
    name: string;
    kind: string;
    role_hint: string | null;
    tags: string[];
    snippet: unknown;
  }

  let { nodes, source, openDepth = 1 }: { nodes: Node[]; source: ClipSource; openDepth?: number } = $props();

  type Sort = 'orbit' | 'name';
  let sort = $state<Sort>('orbit');
  // Expand/collapse all works by re-keying the tree, which re-applies `open` from scratch.
  let expanded = $state<boolean | null>(null);
  let epoch = $state(0);
  let copiedId = $state<string | null>(null);
  // Whose own JSON is on screen. Rendered lazily: 170 pretty-printed blocks in the DOM at once
  // would be most of the page's weight for something almost nobody opens.
  let shown = $state<Record<string, boolean>>({});

  interface TreeNode extends Node { children: TreeNode[]; total: number; roles: Record<string, number> }

  const tree = $derived.by(() => {
    const byId = new Map<string, TreeNode>();
    for (const n of nodes) byId.set(n.node_id, { ...n, children: [], total: 0, roles: {} });

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

    // Orbit order: stars first, then by what is under them - the biggest branch is the interesting
    // one. A-Z is alphabetical at every level; the hierarchy is never flattened by a sort.
    const byOrbit = (a: TreeNode, b: TreeNode) =>
      (b.role_hint === 'star' ? 1 : 0) - (a.role_hint === 'star' ? 1 : 0)
      || b.total - a.total
      || a.name.localeCompare(b.name);
    const byName = (a: TreeNode, b: TreeNode) => a.name.localeCompare(b.name);
    const order = sort === 'name' ? byName : byOrbit;
    const sortAll = (list: TreeNode[]) => { list.sort(order); for (const n of list) sortAll(n.children); };
    sortAll(roots);

    return roots;
  });

  function summarise(n: TreeNode): string {
    return Object.entries(n.roles)
      .sort((a, b) => b[1] - a[1])
      .map(([role, count]) => count + ' ' + role + (count === 1 ? '' : 's'))
      .join(', ');
  }

  async function copy(id: string) {
    const clip = buildClip(nodes, id, source);
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

{#snippet tagList(tags: string[], limit: number)}
  {#each tags.slice(0, limit) as t}
    {@const [key, value] = t.split(/=(.*)/s)}
    <span class="tag" title={key}>{key.split('/').pop()}{#if value}<b>{value}</b>{/if}</span>
  {/each}
  {#if tags.length > limit}<span class="more">+{tags.length - limit}</span>{/if}
{/snippet}

{#snippet branch(node: TreeNode, depth: number)}
  {#if node.children.length}
    <details open={expanded ?? depth < openDepth} style="--depth: {depth}">
      <summary>
        <RoleIcon role={node.role_hint} kind={node.kind} />
        <span class="name">{node.name}</span>
        {#if node.role_hint}<span class="role">{node.role_hint}</span>{/if}
        <span class="sum">{summarise(node)}</span>
        {@render actions(node, true)}
      </summary>
      {#if node.tags.length}
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
    <details style="--depth: {depth}" ontoggle={(e) => { shown[node.node_id] = e.currentTarget.open; }}>
      <summary>
        <RoleIcon role={node.role_hint} kind={node.kind} />
        <span class="name">{node.name}</span>
        {#if node.role_hint}<span class="role">{node.role_hint}</span>{/if}
        {#if node.tags.length}<span class="tags inline">{@render tagList(node.tags, 6)}</span>{/if}
        {@render actions(node, false)}
      </summary>
      {#if shown[node.node_id]}
        <pre style="--depth: {depth + 1}"><code>{own(node)}</code></pre>
      {/if}
    </details>
  {/if}
{/snippet}

<div class="bar">
  <span class="hint">{nodes.length} {nodes.length === 1 ? 'object' : 'objects'}</span>
  <div class="seg" role="group" aria-label="Order">
    <button type="button" class:on={sort === 'orbit'} onclick={() => (sort = 'orbit')}>Orbit order</button>
    <button type="button" class:on={sort === 'name'} onclick={() => (sort = 'name')}>A to Z</button>
  </div>
  <button type="button" class="ghost" onclick={() => { expanded = true; epoch++; }}>Expand all</button>
  <button type="button" class="ghost" onclick={() => { expanded = false; epoch++; }}>Collapse all</button>
</div>

{#key epoch}
  <div class="tree">
    {#each tree as root (root.node_id)}
      {@render branch(root, 0)}
    {/each}
  </div>
{/key}

<style>
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
  .name { color: var(--ink); font-weight: 550; }
  .role { color: var(--ink-faint); font-size: 0.85rem; }
  .sum { color: var(--ink-dim); font-size: 0.85rem; margin-left: auto; }

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
  .tag b { font-weight: 600; color: var(--ink); margin-left: 4px; }
  .more { color: var(--ink-faint); font-size: 0.8rem; align-self: center; }

  pre {
    margin: 0 12px 10px calc(10px + var(--depth) * 16px);
    padding: 10px 12px; max-height: 360px; overflow: auto;
    background: var(--bg); border: 1px solid var(--edge); border-radius: 8px;
    font-size: 0.8rem; line-height: 1.45;
  }
</style>
