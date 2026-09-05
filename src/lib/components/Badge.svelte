<script lang="ts">
  // One badge, as its twelve-by-twelve sprite (src/lib/badges.ts). Earned in colour; not yet
  // earned as a dim shape, so the account page can show what is still out there.
  import { CATALOGUE, type Badge } from '$lib/badges';
  import { runs } from '$lib/pixel';
  let {
    badge, size = 28, earned = true
  }: { badge: Badge; size?: number; earned?: boolean } = $props();

  const spec = $derived(CATALOGUE[badge]);
  const rects = $derived(runs(spec.art));
  const colour = (c: string) =>
    c === '#' ? spec.ink : c === '+' ? spec.light : c === '-' ? spec.dark : spec.alt;
</script>

<svg class="badge" class:dim={!earned} width={size} height={size} viewBox="0 0 12 12"
  shape-rendering="crispEdges" role="img" aria-label={spec.name}>
  <title>{spec.name}. {spec.how}</title>
  {#each rects as r, i (i)}<rect x={r.x} y={r.y} width={r.w} height="1" fill={colour(r.c)} />{/each}
</svg>

<style>
  .badge { display: inline-block; vertical-align: middle; }
  .badge.dim { filter: grayscale(1); opacity: 0.28; }
</style>
