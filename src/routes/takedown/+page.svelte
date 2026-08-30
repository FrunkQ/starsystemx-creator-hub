<script lang="ts">
  // A page of its own because a copyright claim arrives from someone who has never seen this site
  // before, is probably annoyed, and should not have to read the terms to find out where to write.
  import TakedownAddress from '$lib/components/TakedownAddress.svelte';
</script>

<svelte:head>
  <title>Report a copyright problem - StarSystemX Creator Hub</title>
  <meta name="description" content="How to report content on the StarSystemX Creator Hub that should not be here." />
</svelte:head>

<article class="prose">
  <h1>Report a copyright problem</h1>
  <p class="lede">
    If something here is yours and should not be, write to us and a real person will read it.
    <strong>You do not need an account.</strong>
  </p>

  <TakedownAddress />

  <h2>What to include</h2>
  <ul>
    <li>A link to the page the material is on.</li>
    <li>Enough detail to identify what is yours — which image, which model, which text.</li>
    <li>Some way for us to reply to you.</li>
  </ul>

  <p>
    We act promptly. Where the problem is one asset rather than a whole map, the usual outcome is
    that the asset is removed and the map stays up without it — and the removal applies to that
    file everywhere on the hub, not just the one page you found it on.
  </p>

  <h2>Not a copyright problem?</h2>
  <p>
    For anything else — content that should not be here, spam, or someone behaving badly — use the
    <strong>Report</strong> button on the map's own page. That needs an account, which is deliberate:
    an anonymous report button is a griefing tool. See the <a href="/terms">terms</a> for what we
    remove and why.
  </p>
</article>

<style>
  .prose { max-width: 68ch; }
  .prose h1 { margin: 0 0 6px; }
  .lede { color: var(--ink-dim); margin: 0 0 20px; }
  .prose h2 { margin: 28px 0 8px; font-size: 1.05rem; }
  .prose p, .prose li { color: var(--ink-dim); }
  .prose p { margin: 0 0 10px; }
  .prose strong { color: var(--ink); }
  ul { margin: 0 0 10px; padding-left: 20px; }
</style>
