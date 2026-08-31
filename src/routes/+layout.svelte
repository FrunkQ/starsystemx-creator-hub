<script lang="ts">
  // THE HUB IS A FUNNEL, NOT A DESTINATION (design 2). The chrome is deliberately thin: a visitor
  // arriving from a Discord link may never have heard of Star System Explorer, and the page's job
  // is to fix that in one screen and then get out of the way.
  import '../app.css';
  let { children, data } = $props();
</script>

<!-- Cloudflare Web Analytics. `defer` and nothing else: no third-party script gets to block a page
     whose entire job is to load fast. No token means no script tag at all.
     The {#if} lives INSIDE <svelte:head> - the tag itself cannot sit inside a block. -->
<svelte:head>
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
    <a class="wordmark" href="/">{data?.site?.name ?? 'StarSystemX Explorers'}</a>
    <div class="spacer"></div>
    <a href="/browse">Browse</a>
    <a href="/upload">Share a map</a>
    {#if data?.viewer}
      <a href="/account">{data.viewer.handle}</a>
      {#if data.viewer.role === 'admin'}<a href="/admin/review">Review</a>{/if}
      <form method="POST" action="/logout"><button class="linkish" type="submit">Sign out</button></form>
    {:else}
      <a href="/login">Sign in</a>
    {/if}
    <a class="cta" href="https://starsystemx.com" rel="noopener">Get Star System Explorer</a>
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
    <a class="cta" href="https://starsystemx.com" rel="noopener">Open Star System Explorer</a>
  </div>
  <div class="small">
    <!-- Written and owner-signed-off 2026-08-28. `acceptable-use` is a 308 to the relevant section
         of the terms: there is deliberately no separate AUP document. -->
    <a href="/terms">Terms</a>
    <a href="/acceptable-use">Acceptable use</a>
    <a href="/takedown">Report a copyright problem</a>
  </div>
</footer>
