<script lang="ts">
  let { data, form } = $props();
  // A page of its own because a copyright claim arrives from someone who has never seen this site
  // before, is probably annoyed, and should not have to read the terms to find out where to write.
  import TakedownAddress from '$lib/components/TakedownAddress.svelte';
</script>

<svelte:head>
  <title>Report a copyright problem - {data.site.name}</title>
  <meta name="description" content="How to report content that should not be here." />
</svelte:head>

<article class="prose">
  <h1>Report a copyright problem</h1>
  <p class="lede">
    If something here is yours and should not be, write to us and a real person will read it.
    <strong>You do not need an account.</strong>
  </p>

  <!-- THE FORM AND THE ADDRESS, not the form INSTEAD of it (D-49). D-16 refused a form because the
       hub could not send mail and "a form that silently fails is worse than an address - a
       copyright claim that never arrives is the one message here that must not go missing". The
       hub can send now; the address stays anyway, because a broken form must never be the only
       way out of this page. -->
  {#if data.canSend}
    {#if form?.sent}
      <div class="panel notice">
        <h3>Sent - a person will read it</h3>
        <p>
          It went to the address below, and a reply comes back to the one you gave. If you would
          rather have a copy of what you sent, write to us directly as well; we do not mind hearing
          the same thing twice.
        </p>
      </div>
    {:else}
      <form class="panel" method="POST" action="?/send">
        <h2 class="tight">Tell us here</h2>
        <p class="muted">
          Everything here goes to the same inbox as the address below. Nothing is published, and
          nothing is kept beyond the message itself.
        </p>
        {#if form?.message}<p class="bad">{form.message}</p>{/if}
        <label>Your name <input name="name" maxlength="120" value={form?.name ?? ''} autocomplete="name" /></label>
        <label>
          Your email <span class="req">so we can reply</span>
          <input name="email" type="email" maxlength="254" required value={form?.email ?? ''} autocomplete="email" />
        </label>
        <label>
          The page it is on
          <input name="url" maxlength="500" placeholder="https://..." value={form?.url ?? ''} />
        </label>
        <label>
          What is yours, and where
          <textarea name="detail" rows="6" maxlength="4000" required
                    placeholder="Which image, model or text - and anything that helps us find it.">{form?.detail ?? ''}</textarea>
        </label>
        <button class="primary" type="submit">Send</button>
      </form>
    {/if}
  {/if}

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
  .tight { margin: 0 0 6px; }
  .muted { color: var(--ink-dim); margin: 0 0 12px; }
  .bad { color: var(--bad); margin: 0 0 12px; }
  form label { display: block; margin: 12px 0; color: var(--ink-dim); }
  .req { color: var(--ink-faint); font-size: 0.85em; }
  form input, form textarea {
    display: block; width: 100%; margin-top: 4px; font: inherit;
    background: var(--panel-2); color: var(--ink);
    border: 1px solid var(--edge); border-radius: 8px; padding: 8px;
  }
  .prose h1 { margin: 0 0 6px; }
  .lede { color: var(--ink-dim); margin: 0 0 20px; }
  .prose h2 { margin: 28px 0 8px; font-size: 1.05rem; }
  .prose p, .prose li { color: var(--ink-dim); }
  .prose p { margin: 0 0 10px; }
  .prose strong { color: var(--ink); }
  ul { margin: 0 0 10px; padding-left: 20px; }
</style>
