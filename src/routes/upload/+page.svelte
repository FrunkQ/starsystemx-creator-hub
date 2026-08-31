<script lang="ts">
  // Upload, with the preview of what will publish (decision 1).
  //
  // The upload is CLOSED today and says so plainly: the hub has no reference save to test its
  // reader against, and it will not read a format it has never seen into a public library. That is
  // the format gate in src/lib/bundle/format.ts speaking, not a placeholder.
  import { ATTESTATION_TEXT, ATTESTATION_NOTE } from '$lib/attestation';

  let { data } = $props();

  let file = $state<File | null>(null);
  let attested = $state(false);
  // Set only after the hub has DETECTED GM content and the creator has said they meant it.
  let confirmGmTree = $state(false);
  let stripGm = $state(false);
  let busy = $state(false);
  let result = $state<any>(null);

  async function submit(e: Event) {
    e.preventDefault();
    if (!file) return;
    busy = true;
    result = null;
    const body = new FormData();
    body.set('bundle', file);
    if (confirmGmTree) body.set('confirmGmTree', 'on');
    if (stripGm) body.set('stripGm', 'on');
    if (attested) body.set('attest', 'on');
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

<svelte:head><title>Share a map - {data.site.name}</title></svelte:head>

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

  <fieldset class="attest">
    <legend>Credit where it is due</legend>
    <label class="check">
      <input type="checkbox" bind:checked={attested} />
      <span>{ATTESTATION_TEXT}</span>
    </label>
    <p class="note">{ATTESTATION_NOTE}</p>
  </fieldset>

  <button class="primary" type="submit" disabled={!file || !attested || busy}>
    {busy ? 'Reading...' : 'Upload'}
  </button>
</form>

{#if result?.code === 'gm-content'}
  <!-- The one case where the creator IS asked - because the hub found evidence, and can say
       exactly what. Rare by design, so it is worth reading when it appears. -->
  <div class="panel notice bad">
    <h3>This save still has your GM material in it</h3>
    <ul>
      {#each result.detail ?? [] as line}<li>{line}</li>{/each}
    </ul>
    <p>Three ways forward, and the first is usually the one you want:</p>

    <div class="choices">
      <button class="primary" onclick={() => { stripGm = true; confirmGmTree = false; submit(new Event('x')); }} disabled={busy}>
        Take it out and publish the rest
      </button>
      <p class="why">
        The hub removes the notes, hidden objects and secret tags, then checks its own work - if
        anything is left it refuses rather than publishing. Your own copy is untouched.
      </p>
    </div>

    <div class="choices">
      <button onclick={() => { confirmGmTree = true; stripGm = false; submit(new Event('x')); }} disabled={busy}>
        Publish everything, GM notes included
      </button>
      <p class="why">
        For a map meant to be read by other GMs. Everything above becomes public.
      </p>
    </div>

    <div class="choices">
      <p class="why">
        Or export the player version from Star System Explorer and upload that instead - it is the
        same result, done at your end.
      </p>
    </div>
  </div>
{:else if result}
  <div class="panel notice" class:bad={!result.ok}>
    <h3>{result.ok ? 'Uploaded' : 'Not uploaded'}</h3>
    <p>{result.message ?? 'Your map is saved as a draft.'}</p>
    {#if result.ok && result.stripped?.length}
      <p>Removed for you: {result.stripped.join('; ')}. Your own copy is untouched.</p>
    {/if}
    {#if result.ok && result.resave?.worthResaving}
      <!-- A SUGGESTION, not a fault. The map published fine; this is what it would gain. -->
      <p>
        <strong>Worth a quick re-save.</strong> This looks like an older file -
        {result.resave.reasons.join(', and ')}. Open it in Star System Explorer and save it again,
        then upload once more: your page will show which build made it and pick up more of the
        detail the hub can display.
      </p>
    {/if}
    {#if result.ok && result.gmContent?.length}
      <p>Published as a full GM map, including: {result.gmContent.join('; ')}.</p>
    {/if}
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
  .attest { border-color: var(--accent); }
  .check { display: flex; gap: 10px; align-items: start; margin: 4px 0 10px; }
  .check span { color: var(--ink); }
  .note { margin: 0; color: var(--ink-faint); font-size: 0.9rem; }
  .choices { margin: 14px 0; }
  .why { margin: 6px 0 0; color: var(--ink-dim); font-size: 0.9rem; max-width: 62ch; }
</style>
