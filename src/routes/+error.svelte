<script lang="ts">
  // The edge of the known hub. A 404 is the one page a wrong link always lands on, so it gets
  // the wordmark's pixels and a sentence, not a stack trace.
  import { page } from '$app/state';
  import PixelText from '$lib/components/PixelText.svelte';

  const lost = $derived(page.status === 404);
</script>

<svelte:head><title>{page.status} - {lost ? 'not on any chart' : 'something broke'}</title></svelte:head>

<section class="lost">
  <PixelText text={String(page.status)} scale={8} colour="var(--accent)" />
  <h1>{lost ? 'Not on any chart.' : 'Something broke.'}</h1>
  <p>
    {#if lost}
      There is nothing at this address. The map may have been taken down, the link copied wrong, or
      you have found the edge of the known hub.
    {:else}
      {page.error?.message ?? 'An error, at our end.'} Try again in a moment; if it keeps happening,
      the address on the <a href="/takedown">takedown page</a> reaches a person.
    {/if}
  </p>
  <p><a href="/">Back to the hub</a> · <a href="/browse">Browse the maps</a></p>
</section>

<style>
  .lost { padding: 48px 0 24px; max-width: 56ch; }
  .lost h1 { margin: 18px 0 8px; font-size: 1.6rem; letter-spacing: -0.02em; }
  .lost p { color: var(--ink-dim); margin: 0 0 12px; }
</style>
