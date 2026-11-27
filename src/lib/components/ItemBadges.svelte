<script lang="ts">
  // An item's badges (SP14): plain words, the line behind each one on hover and for screen readers.
  // Kept plain on purpose for now (Alex, 27 Nov: "we can beautify the store later").
  import type { ItemBadge } from '$lib/itemBadges';
  let { badges }: { badges: ItemBadge[] } = $props();
</script>

<span class="badges">
  {#each badges as b (b.id)}<span class="b" class:warn={b.warn} title={b.line}>{b.words}<span class="sr"> - {b.line}</span></span>{/each}
</span>

<style>
  .badges { display: inline-flex; flex-wrap: wrap; gap: 4px; }
  .b { font-size: 0.75rem; line-height: 1.4; padding: 0 6px; border: 1px solid var(--edge); border-radius: var(--radius); color: var(--ink-dim); white-space: nowrap; }
  .b.warn { border-color: var(--warn, #c80); color: var(--warn, #c80); }
  .sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
</style>
