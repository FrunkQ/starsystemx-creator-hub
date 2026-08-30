<script lang="ts">
  // THE TAKEDOWN ADDRESS, DELIBERATELY NOT SCRAPABLE.
  //
  // The owner's instruction: keep it hidden on the page - never a bare `mailto:` and never plain
  // text in the HTML source. So it is stored as character codes and assembled only when somebody
  // asks for it. Nothing in the served HTML contains the address, in any form a regex would find.
  //
  // BE HONEST ABOUT WHAT THIS DOES. It defeats the crawlers that harvest addresses out of page
  // source with a pattern match, which is the actual volume threat. It does not defeat anyone who
  // runs the page's JavaScript and looks - and nothing rendered client-side ever could. This is a
  // spam-volume measure, not a secret.
  //
  // WHY NOT A CONTACT FORM: it would need a mail-sending backend the hub does not have, and a form
  // that silently fails is far worse than an address, because a copyright claim that never arrives
  // is the one message here that must not go missing.
  const PARTS = [102, 114, 117, 110, 107, 64, 102, 114, 117, 110, 107, 46, 110, 101, 116];
  const SUBJECT = 'SSE TAKEDOWN REQUEST: ';

  let revealed = $state<string | null>(null);
  let copied = $state(false);

  function reveal() {
    revealed = String.fromCharCode(...PARTS);
  }

  async function copy() {
    if (!revealed) return;
    try {
      await navigator.clipboard.writeText(revealed);
      copied = true;
      setTimeout(() => (copied = false), 1600);
    } catch {
      copied = false; // a denied clipboard is not worth an error message; the address is on screen
    }
  }
</script>

<div class="takedown">
  {#if revealed}
    <p class="addr"><code>{revealed}</code></p>
    <p class="actions">
      <button onclick={copy}>{copied ? 'Copied' : 'Copy address'}</button>
      <!-- Built only after the reveal, so no mailto: exists in the served HTML either. -->
      <a href={'mailto:' + revealed + '?subject=' + encodeURIComponent(SUBJECT)}>Open in your mail app</a>
    </p>
    <p class="hint">
      Start the subject line with <code>{SUBJECT.trim()}</code> — that prefix is what gets it seen
      fast.
    </p>
  {:else}
    <p class="actions">
      <button class="primary" onclick={reveal}>Show the takedown address</button>
    </p>
    <p class="hint">
      Hidden from address harvesters, not from you. If scripts are blocked, the same inbox is
      reachable through the contact details on <a href="https://starsystemx.com" rel="noopener">starsystemx.com</a>.
    </p>
  {/if}
</div>

<style>
  .takedown {
    border: 1px solid var(--edge); border-left: 3px solid var(--accent);
    border-radius: var(--radius); padding: 14px 16px; margin: 14px 0;
    background: var(--panel);
  }
  .addr { margin: 0 0 10px; font-size: 1.05rem; }
  .actions { margin: 0; display: flex; gap: 12px; align-items: center; flex-wrap: wrap; }
  .hint { margin: 10px 0 0; color: var(--ink-faint); font-size: 0.9rem; }
  code {
    background: var(--panel-2); border: 1px solid var(--edge);
    border-radius: 4px; padding: 1px 6px; color: var(--ink);
  }
</style>
