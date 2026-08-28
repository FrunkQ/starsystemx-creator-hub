<script lang="ts">
  // Upload, with the preview of what will publish (decision 1).
  //
  // The upload is CLOSED today and says so plainly: the hub has no reference save to test its
  // reader against, and it will not read a format it has never seen into a public library. That is
  // the format gate in src/lib/bundle/format.ts speaking, not a placeholder.
  let file = $state<File | null>(null);
  let publishGmTree = $state(false);
  let busy = $state(false);
  let result = $state<any>(null);

  async function submit(e: Event) {
    e.preventDefault();
    if (!file) return;
    busy = true;
    result = null;
    const body = new FormData();
    body.set('bundle', file);
    if (publishGmTree) body.set('publishGmTree', 'on');
    try {
      const res = await fetch('/api/upload', { method: 'POST', body });
      result = await res.json();
    } catch {
      result = { ok: false, message: 'The upload could not be sent. Check your connection and try again.' };
    } finally {
      busy = false;
    }
  }
</script>

<svelte:head><title>Share a map - StarSystemX Creator Hub</title></svelte:head>

<h1>Share a map</h1>
<p class="lede">
  Upload a save from Star System Explorer and it gets a page anyone can download from in one click.
</p>

<div class="panel notice">
  <h3>Uploads are not open yet</h3>
  <p>
    The hub is waiting on a reference save from Star System Explorer to test its reader against.
    Until it has one it will not read a save format it has never seen into a public library.
    The form below works; it will refuse politely and tell you exactly that.
  </p>
</div>

<form class="panel" onsubmit={submit}>
  <label>
    Your save file
    <input
      type="file"
      accept=".zip,.json,application/zip,application/json"
      onchange={(e) => (file = (e.currentTarget as HTMLInputElement).files?.[0] ?? null)}
    />
  </label>

  <fieldset>
    <legend>What gets published</legend>
    <label class="radio">
      <input type="radio" name="tree" checked={!publishGmTree} onchange={() => (publishGmTree = false)} />
      <span>
        <strong>The player version</strong> - GM notes, hidden bodies and secret tags are left out.
        This is what almost everyone wants.
      </span>
    </label>
    <label class="radio">
      <input type="radio" name="tree" checked={publishGmTree} onchange={() => (publishGmTree = true)} />
      <span>
        <strong>Everything, including GM notes</strong> - publish the full tree exactly as you built
        it. Only choose this if the map is meant to be read by other GMs.
      </span>
    </label>
  </fieldset>

  <button class="primary" type="submit" disabled={!file || busy}>
    {busy ? 'Reading...' : 'Upload'}
  </button>
</form>

{#if result}
  <div class="panel notice" class:bad={!result.ok}>
    <h3>{result.ok ? 'Uploaded' : 'Not uploaded'}</h3>
    <p>{result.message ?? 'Your map is saved as a draft.'}</p>
    {#if result.ok && !result.mayPublish}
      <p>
        Before this can be made public, every uploaded picture and model needs its source recorded.
        {result.missingProvenance?.length} still have nothing at all.
      </p>
    {/if}
    {#if result.ok && result.withheldCount > 0}
      <p>{result.withheldCount} images are waiting to be looked at, and are not shared yet.</p>
    {/if}
  </div>
{/if}

<style>
  h1 { margin: 0 0 6px; }
  .lede { color: var(--ink-dim); margin: 0 0 20px; max-width: 60ch; }
  label { display: block; margin: 12px 0; color: var(--ink-dim); }
  input[type='file'] { display: block; margin-top: 6px; color: var(--ink); }
  fieldset { border: 1px solid var(--edge); border-radius: var(--radius); margin: 18px 0; padding: 12px 14px; }
  legend { color: var(--ink-faint); padding: 0 6px; font-size: 0.9rem; }
  .radio { display: flex; gap: 10px; align-items: start; margin: 10px 0; }
  .radio span { color: var(--ink-dim); }
  .radio strong { color: var(--ink); }
</style>
