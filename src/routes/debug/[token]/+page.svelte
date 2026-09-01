<script lang="ts">
  // The page a user lands on when the owner sends them a debug link. They have almost certainly
  // just had something go wrong, so the tone is apologetic and the form is one field.
  import { formatBytes } from '$lib/bundle/facets';
  let { data } = $props();

  let file = $state<File | null>(null);
  let note = $state('');
  let busy = $state(false);
  let done = $state(false);
  let message = $state<string | null>(null);

  async function submit(e: Event) {
    e.preventDefault();
    if (!file || busy) return;
    busy = true;
    message = null;
    const body = new FormData();
    body.set('file', file);
    body.set('note', note);
    try {
      const res = await fetch(location.pathname.replace('/debug/', '/api/debug/'), { method: 'POST', body });
      const out = (await res.json()) as { ok: boolean; message?: string };
      if (out.ok) done = true;
      else message = out.message ?? 'That did not go through.';
    } catch {
      message = 'That did not go through. Check your connection and try again.';
    } finally {
      busy = false;
    }
  }
</script>

<svelte:head><title>Send a file for diagnosis</title><meta name="robots" content="noindex" /></svelte:head>

{#if done}
  <h1>Got it — thank you</h1>
  <div class="panel">
    <p>
      That file is with us and this link is now closed. It is not published anywhere, it does not
      appear in the library, and nobody but the site owner can open it.
    </p>
  </div>
{:else}
  <h1>Send a file for diagnosis</h1>
  <p class="lede">
    Somebody asked you for a save file so they could work out what went wrong.
    {#if data.note}<br /><span class="ref">Reference: {data.note}</span>{/if}
  </p>

  <div class="panel notice">
    <h3>What happens to this file</h3>
    <p>
      It goes straight to the site owner for bug fixing. <strong>It is not published, not added to
      the library, and not shown to anyone else.</strong> It is not checked or processed either —
      that is rather the point, since the file that broke something usually cannot be.
      Only send it if you are happy for the owner to read it, GM notes and all.
    </p>
  </div>

  {#if message}<div class="panel notice bad"><p>{message}</p></div>{/if}

  <form class="panel" onsubmit={submit}>
    <label>
      The file
      <input type="file" onchange={(e) => (file = (e.currentTarget as HTMLInputElement).files?.[0] ?? null)} />
    </label>
    <label>
      What went wrong? <span class="opt">optional, but it helps</span>
      <textarea bind:value={note} rows="4" maxlength="1000"
                placeholder="It froze when I opened the third system, on Firefox."></textarea>
    </label>
    <p class="hint">Up to {formatBytes(data.maxBytes)}. This link works once, and expires shortly.</p>
    <button class="primary" type="submit" disabled={!file || busy}>{busy ? 'Sending…' : 'Send it'}</button>
  </form>
{/if}

<style>
  h1 { margin: 0 0 6px; }
  .lede { color: var(--ink-dim); margin: 0 0 18px; max-width: 60ch; }
  .ref { color: var(--ink-faint); font-size: 0.9rem; }
  label { display: block; margin: 12px 0; color: var(--ink-dim); }
  .opt { color: var(--ink-faint); font-size: 0.85rem; }
  input[type='file'] { display: block; margin-top: 6px; color: var(--ink); }
  textarea {
    display: block; width: 100%; margin-top: 4px; font: inherit;
    background: var(--panel-2); color: var(--ink);
    border: 1px solid var(--edge); border-radius: 8px; padding: 8px;
  }
  .hint { color: var(--ink-faint); font-size: 0.9rem; margin: 0 0 12px; }
</style>
