<script lang="ts">
  // Upload, with the preview of what will publish (decision 1).
  //
  // OPEN since 2026-09-01. The format gate accepts bundleFormat 1, because the engine's canonical
  // fixtures have been run through the parser (tests/fixture.test.ts) - not because a release note
  // said the stamp existed.
  import { ATTESTATION_TEXT, ATTESTATION_NOTE } from '$lib/attestation';
  import { SETTINGS, SETTING_MAX, fanWorkNotice } from '$lib/fanWork';

  let { data } = $props();

  let file = $state<File | null>(null);
  // Whether a file is being dragged over the drop zone, so it can light up and say "yes, here".
  let dragging = $state(false);
  let attested = $state(false);
  let fanSetting = $state('');
  // Set only after the hub has DETECTED GM content and the creator has said they meant it.
  let confirmGmTree = $state(false);
  let stripGm = $state(false);
  // Set only after the hub has said "this file is OLDER than the published copy" and the creator
  // has said they mean it (R-12, the stale-upload guard).
  let confirmStale = $state(false);
  let busy = $state(false);
  let result = $state<any>(null);

  async function submit(e: Event) {
    e.preventDefault();
    if (!file) return;
    busy = true;
    result = null;
    const body = new FormData();
    body.set('bundle', file);
    // A NEW VERSION of an existing map: same slug, same page, new rows (data.replacing).
    if (data.replacing) body.set('replaces', data.replacing.id);
    if (confirmGmTree) body.set('confirmGmTree', 'on');
    if (stripGm) body.set('stripGm', 'on');
    if (confirmStale) body.set('confirmStale', 'on');
    if (attested) body.set('attest', 'on');
    if (fanSetting.trim()) body.set('fanSetting', fanSetting.trim());
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

<svelte:head><title>{data.replacing ? 'Upload a new version' : 'Share a map'} - {data.site.name}</title></svelte:head>

{#if data.replacing}
  <h1>Upload a new version</h1>
  <p class="lede">
    Replacing <strong>{data.replacing.title}</strong>{#if data.replacing.revision != null} (currently
    revision {data.replacing.revision}){/if}. Its address stays the same, so every link already shared
    keeps working; the page, the tree and the download become this file. A screenshot you chose as
    the cover, or a card you designed, is kept.
  </p>
{:else}
  <h1>Share a map</h1>
  <p class="lede">
    Upload a save from Star System Explorer and it gets a page anyone can download from in one click.
  </p>
{/if}

<form class="panel" onsubmit={submit}>
  <!-- THE ONE THING THIS PAGE IS FOR (owner, 2026-09-06: "make this more obvious"). It was the
       browser's default "Choose File / No file chosen", which is small, grey, and easy to miss on
       a page whose entire purpose is to receive that file. Now it is a drop zone the size of the
       job: click it, or drag the save onto it, and it says which file it is holding. -->
  <label
    class="drop"
    class:has={!!file}
    class:over={dragging}
    ondragover={(e) => { e.preventDefault(); dragging = true; }}
    ondragleave={() => (dragging = false)}
    ondrop={(e) => {
      e.preventDefault();
      dragging = false;
      const dropped = e.dataTransfer?.files?.[0];
      if (dropped) file = dropped;
    }}
  >
    <input
      type="file"
      accept=".zip,.json,application/zip,application/json"
      onchange={(e) => (file = (e.currentTarget as HTMLInputElement).files?.[0] ?? null)}
    />
    {#if file}
      <strong>{file.name}</strong>
      <span class="hint">{(file.size / 1024 / 1024).toFixed(1)} MB - click to choose a different one</span>
    {:else}
      <strong>Choose your save file</strong>
      <span class="hint">or drag it here - a .sse.zip or a .json from Star System Explorer</span>
    {/if}
  </label>

  <fieldset class="attest">
    <legend>Credit where it is due</legend>
    <label class="check">
      <input type="checkbox" bind:checked={attested} />
      <span>{ATTESTATION_TEXT}</span>
    </label>
    <p class="note">{ATTESTATION_NOTE}</p>

    <!-- WHICH UNIVERSE, if it is somebody else's (owner, 2026-09-06; D-61). Optional, and phrased
         so that leaving it empty is a normal answer rather than a skipped question - most maps are
         nobody's but their maker's. A name here makes the notice on the map page NAME what is
         being disclaimed, which is worth far more than the blanket sentence on its own. -->
    <label class="setting">
      Is this set in an existing universe?
      <input name="fanSetting" list="settings" maxlength={SETTING_MAX} bind:value={fanSetting}
             placeholder="Star Trek, Dune, The Expanse... or leave empty" autocomplete="off" />
      <datalist id="settings">
        {#each SETTINGS as name (name)}<option value={name}></option>{/each}
      </datalist>
    </label>
    {#if fanSetting.trim()}
      <p class="note">{fanWorkNotice(fanSetting)}</p>
    {:else}
      <p class="note">Leave it empty if this is your own universe. Fan work is welcome here - naming
        the setting just lets the map page say so properly.</p>
    {/if}
  </fieldset>

  <button class="primary" type="submit" disabled={!file || !attested || busy}>
    {busy ? 'Reading...' : data.replacing ? 'Upload this version' : 'Upload'}
  </button>
</form>

{#if result?.code === 'stale-revision'}
  <!-- The stale-upload guard (R-12). The file is older than what is published; almost always an
       old export found in a Downloads folder. Name both numbers and let the creator decide. -->
  <div class="panel notice bad">
    <h3>This file is older than the published copy</h3>
    <p>{result.message}</p>
    <div class="choices">
      <button onclick={() => { confirmStale = true; submit(new Event('x')); }} disabled={busy}>
        Replace the newer copy with this one anyway
      </button>
      <p class="why">Or find the newer save and upload that instead - nothing has changed yet.</p>
    </div>
  </div>
{/if}

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
{:else if result && result.code !== 'stale-revision'}
  <div class="panel notice" class:bad={!result.ok}>
    <h3>{result.ok ? (data.replacing ? 'New version uploaded' : 'Uploaded') : 'Not uploaded'}</h3>
    <p>{result.message ?? (data.replacing ? 'The page, the tree and the download are now this file.' : 'Your map is saved as a draft.')}</p>
    {#if result.ok && result.slug}
      <p><a href="/manage/{result.systemId}">Manage it</a> · <a href="/s/{result.slug}">See the page</a></p>
    {/if}
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
  <!-- WHAT THE HUB FOUND WRONG WITH THE FILE (D-88) - said the moment it is found, with the fix,
       while the creator still has Star System Explorer open. -->
  {#if result.ok && result.problems?.length}
    <div class="panel notice bad problems">
      <h3>The hub found {result.problems.length === 1 ? 'a problem' : result.problems.length + ' problems'} in this file</h3>
      {#each result.problems as p (p.code)}
        <div class="problem">
          <p><strong>{p.title}.</strong> {p.detail}</p>
          <p class="fix"><span class="lbl">How to fix it:</span> {p.fix}</p>
        </div>
      {/each}
      <p>
        <strong>We advise fixing {result.problems.length === 1 ? 'it' : 'them'} before you publish.</strong>
        Your upload is saved as a draft; <a href="/upload?replaces={result.systemId}">upload the fixed file as a new version</a>
        and this clears by itself.
      </p>
    </div>
  {/if}
{/if}

<style>
  h1 { margin: 0 0 6px; }
  .problem { margin: 0 0 10px; }
  .problem p { margin: 0 0 4px; }
  .problem .fix { color: var(--ink-dim); }
  .problem .lbl { color: var(--ink-faint); font-size: 0.85rem; text-transform: uppercase; letter-spacing: 0.05em; }
  .lede { color: var(--ink-dim); margin: 0 0 20px; max-width: 60ch; }
  label { display: block; margin: 12px 0; color: var(--ink-dim); }
  /* The drop zone: the file input is still the control - it is just given a body worth aiming at. */
  .drop {
    display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px;
    min-height: 130px; margin: 4px 0 18px; padding: 20px; text-align: center; cursor: pointer;
    border: 2px dashed var(--edge); border-radius: var(--radius); background: var(--panel-2);
    color: var(--ink);
  }
  .drop:hover, .drop.over { border-color: var(--accent); background: var(--panel); }
  .drop.has { border-style: solid; border-color: var(--accent); }
  .drop strong { font-size: 1.05rem; }
  .drop .hint { color: var(--ink-faint); font-size: 0.9rem; }
  /* The input itself is hidden: the label IS the button, and a label click opens the picker. */
  .drop input[type='file'] { display: none; }
  fieldset { border: 1px solid var(--edge); border-radius: var(--radius); margin: 18px 0; padding: 12px 14px; }
  legend { color: var(--ink-faint); padding: 0 6px; font-size: 0.9rem; }
  .attest { border-color: var(--accent); }
  .setting { display: block; margin-top: 0.75rem; font-weight: 600; }
  .setting input { display: block; width: 100%; margin-top: 0.25rem; font-weight: 400; }
  .check { display: flex; gap: 10px; align-items: start; margin: 4px 0 10px; }
  .check span { color: var(--ink); }
  .note { margin: 0; color: var(--ink-faint); font-size: 0.9rem; }
  .choices { margin: 14px 0; }
  .why { margin: 6px 0 0; color: var(--ink-dim); font-size: 0.9rem; max-width: 62ch; }
</style>
