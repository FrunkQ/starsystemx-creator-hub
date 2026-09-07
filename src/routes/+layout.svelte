<script lang="ts">
  // THE HUB IS A FUNNEL, NOT A DESTINATION (design 2). The chrome is deliberately thin: a visitor
  // arriving from a Discord link may never have heard of Star System Explorer, and the page's job
  // is to fix that in one screen and then get out of the way.
  import '../app.css';
  import { version } from '$app/environment';
  import PixelText from '$lib/components/PixelText.svelte';
  // The one file that holds an address (D-37). This is the APP's own home, so production:
  // a general "go and look at the tool" link, not a feature link that has to wait for a release.
  import { FAN_WORK_FOOTER } from '$lib/fanWork';
  import { SSE_PROD_ORIGIN } from '$lib/addresses';
  import StaffNav from '$lib/components/StaffNav.svelte';
  import { outstanding, badgeLabel, EMPTY_COUNTS } from '$lib/adminNav';
  import { page } from '$app/state';
  let { children, data } = $props();

  // WHO IS STAFF (D-39): a moderator or an admin. The strip is drawn where the staff work is and
  // nowhere else; the tier decides which areas of it they are offered.
  const tier = $derived(data?.viewer?.role === 'admin' ? 'admin' : data?.viewer?.role === 'moderator' ? 'moderator' : null);
  const staff = $derived(!!tier && page.url.pathname.startsWith('/admin'));
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
      <a class="me" href="/account">
        {data.viewer.handle}
        {#if tier}<span class="role" class:mod={tier === 'moderator'}>{tier}</span>{/if}
        <!-- What is waiting for THIS person: comments on their maps since they last looked. The
             account page clears it by showing them, which is why it can be a number and not a dot. -->
        {#if (data.newComments ?? 0) > 0}
          <span class="badge" title="{data.newComments} new comments on your maps">
            {badgeLabel(data.newComments ?? 0)}
          </span>
        {/if}
      </a>
      <!-- ONE staff link, not eight. The areas are grouped in the strip below, which appears on the
           admin pages themselves; a public map page has no business carrying the review queue. The
           badge is the work waiting, so it is visible from anywhere without the links being. -->
      {#if tier}
        {@const waiting = outstanding(data.counts ?? EMPTY_COUNTS)}
        <a class="staff-link" class:mod={tier === 'moderator'} href="/admin/review" aria-current={staff ? 'page' : undefined}>
          {tier === 'admin' ? 'Admin' : 'Moderate'}
          {#if waiting > 0}
            <span class="badge" title="{waiting} things waiting: tags and pictures to review, and reports still open">
              {badgeLabel(waiting)}
            </span>
          {/if}
        </a>
      {/if}
      <form method="POST" action="/logout"><button class="linkish" type="submit">Sign out</button></form>
    {:else}
      <!-- A DOOR, VISIBLE FROM EVERY PAGE (D-66). The hub had no sign-up at all until 2026-09-07,
           so there was nothing to link to; a front door nobody can find is the same problem with
           extra steps. `Sign in` stays first for the people who already have an account. -->
      <a href="/login">Sign in</a>
      <a class="join" href="/join">Join</a>
    {/if}
    <!-- NO "Open Star System Explorer" HERE (owner, 2026-09-06: "we have it at the bottom and on
         every map"). The banner's job is to get out of the way; a general link to the app competes
         with the specific one on every map and card, which opens THAT map rather than the app. -->
  </nav>

  {#if staff}
    <div class="staff-strip">
      <StaffNav counts={data?.counts ?? EMPTY_COUNTS} path={page.url.pathname} tier={tier ?? 'moderator'} />
    </div>
  {/if}
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
    <a class="cta" href={SSE_PROD_ORIGIN} target="_blank" rel="noopener">Open Star System Explorer</a>
  </div>
  <!-- ON EVERY PAGE (owner, 2026-09-06; D-61): "we need to ensure everyone knows this is fan made
       content and no liability of ownership is made by the user or SSE." The per-map notice names
       the setting; this one is the floor, and it is here so that no page anywhere is without it. -->
  <p class="fan">{FAN_WORK_FOOTER}</p>
  <div class="small">
    <!-- Written and owner-signed-off 2026-08-28. `acceptable-use` is a 308 to the relevant section
         of the terms: there is deliberately no separate AUP document. -->
    <a href="/terms">Terms</a>
    <a href="/terms#fan-work">Fan work</a>
    <a href="/acceptable-use">Acceptable use</a>
    <a href="/takedown">Report a copyright problem</a>
    <!-- Which build this is, from package.json (svelte.config.js). Ops, not decoration. -->
    <span title="hub version">v{version}</span>
  </div>
</footer>
