<script lang="ts">
  // The "i" with a ring of five: how much of a map has been written about (bundle/density.ts).
  // Filled segments are the level; a map with nothing described shows the ring empty and dim.
  let { level, size = 18, title = '' }: { level: number; size?: number; title?: string } = $props();

  const SEGMENTS = 5;
  // Five arcs around the "i", a gap between each, from the top and clockwise.
  const arc = (i: number): string => {
    const r = 10.5, gap = 0.26, span = (Math.PI * 2) / SEGMENTS;
    const a0 = -Math.PI / 2 + i * span + gap / 2;
    const a1 = a0 + span - gap;
    const at = (a: number) => (12 + r * Math.cos(a)).toFixed(2) + ' ' + (12 + r * Math.sin(a)).toFixed(2);
    return 'M ' + at(a0) + ' A ' + r + ' ' + r + ' 0 0 1 ' + at(a1);
  };
  const label = $derived(title || 'Information ' + level + ' of 5');
</script>

<svg class="info" class:none={level === 0} width={size} height={size} viewBox="0 0 24 24" role="img" aria-label={label}>
  <title>{label}</title>
  <circle cx="12" cy="12" r="6.5" />
  <line x1="12" y1="11" x2="12" y2="15.2" />
  <circle class="dot" cx="12" cy="8.6" r="0.9" />
  {#each Array.from({ length: SEGMENTS }, (_, i) => i) as i (i)}
    <path class="seg" class:on={i < level} d={arc(i)} />
  {/each}
</svg>

<style>
  .info { display: inline-block; vertical-align: middle; fill: none; stroke: currentColor; stroke-width: 1.6; stroke-linecap: round; }
  .info .dot { fill: currentColor; stroke: none; }
  .info .seg { stroke: var(--edge); stroke-width: 2; }
  .info .seg.on { stroke: var(--accent); }
  .info.none { opacity: 0.55; }
</style>
