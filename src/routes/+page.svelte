<script lang="ts">
  import SystemCard from '$lib/components/SystemCard.svelte';
  let { data } = $props();
</script>

<svelte:head>
  <title>{data.site.name} - star systems and campaigns to download</title>
  <meta name="description" content="Star systems and campaign starmaps made by other people, free to download and open in Star System Explorer." />
</svelte:head>

{#if data.bye}
  <div class="panel notice">
    <h3>Your account is gone.</h3>
    <p>Thank you for exploring. The door is open if you come back.</p>
  </div>
{/if}

<section class="hero">
  <h1>Star systems, made by other people.</h1>
  <p>
    Download a system or a whole campaign starmap and open it in Star System Explorer.
    One click, no account needed.
  </p>
</section>

{#if data.failed}
  <div class="panel notice bad">
    <h3>Could not read the library</h3>
    <p>Something went wrong at our end - this is not an empty shelf. Please try again shortly.</p>
  </div>
{:else if !data.systems.length}
  <div class="panel notice">
    <h3>Nothing published yet</h3>
    <p>
      Nobody has shared a map yet. <a href="/upload">Be the first</a> — or open Star System
      Explorer and build one.
    </p>
  </div>
{:else}
  <div class="grid">
    {#each data.systems as system (system.slug)}
      <SystemCard {system} />
    {/each}
  </div>
{/if}

<style>
  .hero { margin: 8px 0 28px; }
  .hero h1 { margin: 0 0 8px; font-size: 2rem; letter-spacing: -0.02em; }
  .hero p { margin: 0; color: var(--ink-dim); max-width: 56ch; font-size: 1.05rem; }
</style>
