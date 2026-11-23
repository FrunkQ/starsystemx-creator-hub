<script lang="ts">
  // Publish a Star System Explorer 4 campaign or pack (D-98). One JSON file; the site reads it,
  // says what it is, and lists it on its shelf.
  import { ATTESTATION_TEXT, ATTESTATION_NOTE } from '$lib/attestation';
  import { SETTINGS, SETTING_MAX, fanWorkNotice } from '$lib/fanWork';

  let { data } = $props();
  let file = $state<File | null>(null);
  let dragging = $state(false);
  let attested = $state(false);
  let fanSetting = $state('');
  let title = $state('');
  let summary = $state('');
  let busy = $state(false);
  let result = $state<any>(null);

  async function submit(e: Event) {
    e.preventDefault();
    if (!file) return;
    busy = true;
    result = null;
    const body = new FormData();
    body.set('file', file);
    if (attested) body.set('attest', 'on');
    if (fanSetting.trim()) body.set('fanSetting', fanSetting.trim());
    if (title.trim()) body.set('title', title.trim());
    if (summary.trim()) body.set('summary', summary.trim());
    try {
      const res = await fetch('/api/v4/upload', { method: 'POST', body });
      result = await res.json();
    } catch {
      result = { ok: false, message: 'The upload could not be sent. Check your connection and try again.' };
    } finally {
      busy = false;
    }
  }
</script>

<svelte:head><title>Share an SSE4 campaign or pack - {data.site.name}</title></svelte:head>

<h1>Share an SSE4 campaign or pack <span class="gen">v4</span></h1>
<p class="lede">
  A campaign save or a pack from Star System Explorer 4. Packs go on their shelf (universe, game
  system, physics, tag set, looks); campaigns go beside them. Your GM record and undo history are
  taken out of a campaign before it is stored. A V3 map? <a href="/upload">Use the ordinary upload</a>.
</p>

<form class="panel" onsubmit={submit}>
  <label class="drop" class:has={!!file} class:over={dragging}
    ondragover={(e) => { e.preventDefault(); dragging = true; }}
    ondragleave={() => (dragging = false)}
    ondrop={(e) => { e.preventDefault(); dragging = false; const f = e.dataTransfer?.files?.[0]; if (f) file = f; }}>
    <input type="file" accept=".json,application/json"
      onchange={(e) => (file = (e.currentTarget as HTMLInputElement).files?.[0] ?? null)} />
    {#if file}
      <strong>{file.name}</strong>
      <span class="hint">{(file.size / 1024).toFixed(0)} KB - click to choose a different one</span>
    {:else}
      <strong>Choose a campaign save or a pack</strong>
      <span class="hint">or drag it here - a .json from Star System Explorer 4</span>
    {/if}
  </label>

  <label>Title <span class="opt">(optional: the file's own name is used otherwise)</span>
    <input bind:value={title} maxlength="120" />
  </label>
  <label>A line about it <span class="opt">(optional)</span>
    <input bind:value={summary} maxlength="400" />
  </label>

  <fieldset class="attest">
    <legend>Credit where it is due</legend>
    <label class="check">
      <input type="checkbox" bind:checked={attested} />
      <span>{ATTESTATION_TEXT}</span>
    </label>
    <p class="note">{ATTESTATION_NOTE}</p>
    <label class="setting">
      Is this for an existing universe?
      <input list="settings" maxlength={SETTING_MAX} bind:value={fanSetting}
             placeholder="Star Trek, Dune, The Expanse... or leave empty" autocomplete="off" />
      <datalist id="settings">{#each SETTINGS as name (name)}<option value={name}></option>{/each}</datalist>
    </label>
    {#if fanSetting.trim()}
      <p class="note">{fanWorkNotice(fanSetting)}</p>
      <p class="note">A pack for a named setting goes on the fan-made shelf and is always free. Keep it
        to rules, numbers and plain names: no logos, art or text copied from the setting.</p>
    {:else}
      <p class="note">Leave it empty if this is your own universe.</p>
    {/if}
  </fieldset>

  <button class="primary" type="submit" disabled={!file || !attested || busy}>{busy ? 'Reading...' : 'Publish'}</button>
</form>

{#if result}
  <div class="panel notice" class:bad={!result.ok}>
    <h3>{result.ok ? 'Published' : 'Not published'}</h3>
    {#if result.ok}
      <p>It is on the shelves now. <a href="/v/{result.slug}">See its page</a>.</p>
    {:else}
      <p>{result.message}</p>
    {/if}
  </div>
{/if}

<style>
  h1 { margin: 0 0 6px; }
  .gen { font-family: var(--font-mono); font-size: 0.8rem; vertical-align: middle; border: 1px solid var(--edge); padding: 1px 6px; color: var(--ink-dim); }
  .lede { color: var(--ink-dim); margin: 0 0 20px; max-width: 62ch; }
  label { display: block; margin: 12px 0; color: var(--ink-dim); }
  label input:not([type]) , label input[list] { display: block; width: 100%; margin-top: 0.25rem; }
  .opt { color: var(--ink-faint); font-size: 0.85rem; }
  .drop { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px;
    min-height: 110px; margin: 4px 0 18px; padding: 20px; text-align: center; cursor: pointer;
    border: 2px dashed var(--edge); border-radius: var(--radius); background: var(--panel-2); color: var(--ink); }
  .drop:hover, .drop.over { border-color: var(--accent); background: var(--panel); }
  .drop.has { border-style: solid; border-color: var(--accent); }
  .drop .hint { color: var(--ink-faint); font-size: 0.9rem; }
  .drop input[type='file'] { display: none; }
  fieldset { border: 1px solid var(--edge); border-radius: var(--radius); margin: 18px 0; padding: 12px 14px; }
  legend { color: var(--ink-faint); padding: 0 6px; font-size: 0.9rem; }
  .attest { border-color: var(--accent); }
  .setting { font-weight: 600; }
  .check { display: flex; gap: 10px; align-items: start; margin: 4px 0 10px; }
  .check span { color: var(--ink); }
  .note { margin: 0 0 6px; color: var(--ink-faint); font-size: 0.9rem; }
</style>
