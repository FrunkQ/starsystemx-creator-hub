<script lang="ts">
  // THE HUB IS A FUNNEL, NOT A DESTINATION (design 2). The chrome is deliberately thin: a visitor
  // arriving from a Discord link may never have heard of Star System Explorer, and the page's job
  // is to fix that in one screen and then get out of the way.
  import '../app.css';
  let { children } = $props();
</script>

<a class="skip" href="#main">Skip to content</a>

<header>
  <nav>
    <a class="wordmark" href="/">StarSystemX <span>Creator Hub</span></a>
    <div class="spacer"></div>
    <a href="/browse">Browse</a>
    <a href="/upload">Share a map</a>
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
    <!-- OWED BY THE OWNER (design 6.8): terms, an acceptable-use line, and a takedown address
         that reaches a person. These links are placeholders and MUST be real before the first
         public upload. See docs/decisions.md Q-04. -->
    <a href="/terms">Terms</a>
    <a href="/acceptable-use">Acceptable use</a>
    <a href="/takedown">Report a copyright problem</a>
  </div>
</footer>
