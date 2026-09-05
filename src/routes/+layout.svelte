<script lang="ts">
  // THE HUB IS A FUNNEL, NOT A DESTINATION (design 2). The chrome is deliberately thin: a visitor
  // arriving from a Discord link may never have heard of Star System Explorer, and the page's job
  // is to fix that in one screen and then get out of the way.
  import '../app.css';
  import { version } from '$app/environment';
  import PixelText from '$lib/components/PixelText.svelte';
  let { children, data } = $props();
</script>

<!-- Cloudflare Web Analytics. `defer` and nothing else: no third-party script gets to block a page
     whose entire job is to load fast. No token means no script tag at all.
     The {#if} lives INSIDE <svelte:head> - the tag itself cannot sit inside a block. -->
<svelte:head>
  <!-- New maps as a feed, for readers and bots (D-33). -->
  <link rel="alternate" type="application/atom+xml" title="New maps" href="/feed.xml" />
  {#if data?.cfBeaconToken}
    <script
      defer
      src="https://static.cloudflareinsights.com/beacon.min.js"
      data-cf-beacon={JSON.stringify({ token: data.cfBeaconToken })}
    ></script>
  {/if}
</svelte:head>

<a class="skip" href="#main">Skip to content</a>

<header>
  <nav>
    <!-- The wordmark in the cover cards' own bitmap font: the one retro touch the chrome carries. -->
    <a class="wordmark" href="/" aria-label={data?.site?.name ?? 'StarSystemX Explorers'}>
      <PixelText text={data?.site?.name ?? 'StarSystemX Explorers'} scale={2} />
    </a>
    <div class="spacer"></div>
    <a href="/browse">Browse</a>
    <a href="/upload">Share a map</a>
    {#if data?.viewer}
      <a href="/account">{data.viewer.handle}</a>
      {#if data.viewer.role === 'admin'}
        <a href="/admin/review">Review</a>
        <a href="/admin/comments">Comments</a>
        <a href="/admin/explorers">Explorers</a>
        <a href="/admin/reports">Reports</a>
        <a href="/admin/backup">Backups</a>
        <a href="/admin/stats">Usage</a>
        <a href="/admin/debug">Debug</a>
      {/if}
      <form method="POST" action="/logout"><button class="linkish" type="submit">Sign out</button></form>
    {:else}
      <a href="/login">Sign in</a>
    {/if}
    <a class="cta" href="https://starsystemx.com" target="_blank" rel="noopener">Open Star System Explorer</a>
  </nav>
</header>

<main id="main">
  {@render children()}
</main>

<footer>
  <div class="what">
    <h2>What is Star System Explorer?</h2>
    <p>
      A free tool for building star systems and campaign starmaps that behave like real astronomy -
      orbits, climates, atmospheres and all - and then handing them to your players.
      Everything on this hub opens directly in it.
    </p>
    <a class="cta" href="https://starsystemx.com" target="_blank" rel="noopener">Open Star System Explorer</a>
  </div>
  <div class="small">
    <!-- Written and owner-signed-off 2026-08-28. `acceptable-use` is a 308 to the relevant section
         of the terms: there is deliberately no separate AUP document. -->
    <a href="/terms">Terms</a>
    <a href="/acceptable-use">Acceptable use</a>
    <a href="/takedown">Report a copyright problem</a>
    <!-- Which build this is, from package.json (svelte.config.js). Ops, not decoration. -->
    <span title="hub version">v{version}</span>
  </div>
</footer>
