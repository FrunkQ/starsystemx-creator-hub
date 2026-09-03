<script lang="ts">
  // One flat icon for a node's role. See roleIcons.ts for the set and the reason it is inline SVG.
  import { iconFor } from './roleIcons';
  let { role, kind, size = 16 }: { role: string | null | undefined; kind?: string | null; size?: number } = $props();
  const icon = $derived(iconFor(role, kind));
</script>

<svg
  class="role-icon" width={size} height={size} viewBox="0 0 24 24" fill="none"
  stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"
  stroke-dasharray={icon.dash ?? null} aria-label={icon.label} role="img"
><title>{icon.label}</title><path d={icon.d} /></svg>

<style>
  .role-icon { flex: none; display: inline-block; vertical-align: -3px; }
</style>
