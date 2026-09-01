<script lang="ts">
  // A starmap's contents as a TREE, collapsed by default and summarised at every level.
  //
  // ============================================================================================
  // WHY NOT THE FLAT TABLE IT REPLACES. A real campaign is 161 bodies and 11 constructs, and the
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
  interface Node {
    node_id: string;
    parent_id: string | null;
    name: string;
    kind: string;
    role_hint: string | null;
    tags: string[];
  }

  let { nodes, openDepth = 1 }: { nodes: Node[]; openDepth?: number } = $props();

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

    // Stars first, then by what is under them: the biggest branch is the interesting one.
    const order = (a: TreeNode, b: TreeNode) =>
      (b.role_hint === 'star' ? 1 : 0) - (a.role_hint === 'star' ? 1 : 0)
      || b.total - a.total
      || a.name.localeCompare(b.name);
    const sortAll = (list: TreeNode[]) => { list.sort(order); for (const n of list) sortAll(n.children); };
    sortAll(roots);

    return roots;
  });

  function summarise(n: TreeNode): string {
    const parts = Object.entries(n.roles)
      .sort((a, b) => b[1] - a[1])
      .map(([role, count]) => count + ' ' + role + (count === 1 ? '' : 's'));
    return parts.join(', ');
  }
</script>

{#snippet branch(node: TreeNode, depth: number)}
  {#if node.children.length}
    <details open={depth < openDepth} style="--depth: {depth}">
      <summary>
        <span class="name">{node.name}</span>
        {#if node.role_hint}<span class="role">{node.role_hint}</span>{/if}
        <span class="sum">{summarise(node)}</span>
      </summary>
      {#if node.tags.length}
        <div class="tags" style="--depth: {depth + 1}">
          {#each node.tags as t}
            {@const [key, value] = t.split(/=(.*)/s)}
            <span class="tag" title={key}>{key.split('/').pop()}{#if value}<b>{value}</b>{/if}</span>
          {/each}
        </div>
      {/if}
      {#each node.children as child (child.node_id)}
        {@render branch(child, depth + 1)}
      {/each}
    </details>
  {:else}
    <div class="leaf" style="--depth: {depth}">
      <span class="name">{node.name}</span>
      {#if node.role_hint}<span class="role">{node.role_hint}</span>{/if}
      {#if node.tags.length}
        <span class="tags inline">
          {#each node.tags.slice(0, 6) as t}
            {@const [key, value] = t.split(/=(.*)/s)}
            <span class="tag" title={key}>{key.split('/').pop()}{#if value}<b>{value}</b>{/if}</span>
          {/each}
          {#if node.tags.length > 6}<span class="more">+{node.tags.length - 6}</span>{/if}
        </span>
      {/if}
    </div>
  {/if}
{/snippet}

<div class="tree">
  {#each tree as root (root.node_id)}
    {@render branch(root, 0)}
  {/each}
</div>

<style>
  .tree { border: 1px solid var(--edge); border-radius: var(--radius); overflow: hidden; }
  details, .leaf {
    border-top: 1px solid var(--edge);
    padding-left: calc(10px + var(--depth) * 16px);
  }
  .tree > :first-child { border-top: none; }
  summary, .leaf {
    display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap;
    padding: 7px 12px 7px 0; cursor: pointer;
  }
  .leaf { cursor: default; }
  summary::marker { color: var(--ink-faint); }
  summary:hover { background: var(--panel-2); }
  .name { color: var(--ink); font-weight: 550; }
  .role { color: var(--ink-faint); font-size: 0.85rem; }
  .sum { color: var(--ink-dim); font-size: 0.85rem; margin-left: auto; }
  .tags { display: flex; flex-wrap: wrap; gap: 4px; padding: 0 12px 8px calc(10px + var(--depth) * 16px); }
  .tags.inline { padding: 0; margin-left: auto; }
  .tag b { font-weight: 600; color: var(--ink); margin-left: 4px; }
  .more { color: var(--ink-faint); font-size: 0.8rem; align-self: center; }
</style>
