<script lang="ts">
  let { data, form } = $props();

  const s = $derived(data.system);
  let uploading = $state(false);
  let uploadMessage = $state<string | null>(null);

  // THE COVER DESIGNER (D-22). The choices live here; the preview is an <img> whose address
  // carries them, so every change redraws the card on the server - no client-side rendering,
  // and what you see is byte-for-byte what "Use this cover" stores.
  let cover = $state({ ...data.coverOptions });
  const onOff = (v: boolean) => (v ? 'on' : 'off');
  // Screenshots a card can be drawn over: approved, and PNG or JPEG.
  const drawable = $derived(data.screenshots.filter((sh) => sh.drawable));
  const previewUrl = $derived(
    '/api/cover/preview?' + new URLSearchParams({
      systemId: s.id, base: cover.base, palette: cover.palette, font: cover.font,
      title: onOff(cover.title), byline: onOff(cover.byline), counts: onOff(cover.counts),
      label: onOff(cover.label), qr: onOff(cover.qr),
      baseImage: cover.base === 'image' ? (cover.baseImage ?? drawable[0]?.sha256 ?? '') : ''
    }).toString()
  );

  async function addScreenshot(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    uploading = true;
    uploadMessage = null;
    const body = new FormData();
    body.set('systemId', s.id);
    body.set('image', file);
    try {
      const res = await fetch('/api/screenshots', { method: 'POST', body });
      const out = (await res.json()) as { ok: boolean; awaitingReview?: boolean; message?: string };
      uploadMessage = out.ok
        ? out.awaitingReview
          ? 'Added. It will appear on the page once someone has looked at it.'
          : 'Added.'
        : out.message ?? 'That screenshot was not accepted.';
      if (out.ok) location.reload();
    } catch {
      uploadMessage = 'That upload did not go through.';
    } finally {
      uploading = false;
      input.value = '';
    }
  }
</script>

<svelte:head><title>{s.title} - manage</title><meta name="robots" content="noindex" /></svelte:head>

<h1>{s.title}</h1>
<p class="by">
  {s.state === 'public' ? 'Published' : 'Draft'}
  {#if s.created_with}· made with Star System Explorer {s.created_with}{/if}
  {#if s.legacy_stamped}· uploaded as a legacy save{/if}
  {#if s.revision != null}· revision {s.revision}{/if}
  {#if s.export_mode}· exported as the {s.export_mode === 'player' ? 'player' : 'GM'} view{/if}
</p>
<div class="actions">
  <a href="/upload?replaces={s.id}">Upload a new version</a>
  {#if s.state === 'public'}· <a href="/s/{s.slug}">See the page</a>{/if}
  · <form class="inline" method="POST" action="?/reindex"><button class="linkish" type="submit"
      title="Rebuild the tree, distances, counts and pills from the file the hub already holds - useful when the hub has learned to read something new">Re-index from the stored file</button></form>
</div>
{#if form?.reindexed}
  <div class="panel notice"><p>Re-indexed from the stored file. The page, the tree and a generated cover are rebuilt from it.</p></div>
{/if}

{#if form?.message}
  <div class="panel notice bad"><p>{form.message}</p></div>
{/if}

{#if !data.mayPublish}
  <div class="panel notice">
    <h3>{data.blocking.length} {data.blocking.length === 1 ? 'asset needs' : 'assets need'} a source before you can share this</h3>
    <p>
      Record who made each picture and model, and under what licence, in Star System Explorer -
      then upload the save again. It is how the artists whose work we all use get credited.
    </p>
  </div>
{/if}

<!-- 1. The pitch. -->
<form class="panel" method="POST" action="?/details">
  <h2>Tell people about it</h2>
  <label>Title <input name="title" value={s.title} maxlength="120" /></label>
  <label>
    One line
    <input name="blurb" value={s.blurb ?? ''} maxlength="300"
           placeholder="A dying binary with three habitable moons and a lot of secrets." />
  </label>
  <label>
    The write-up
    <textarea name="description" rows="8" maxlength="8000"
              placeholder="What is this map for? What is interesting about it? What would a GM do with it?"
    >{s.description ?? ''}</textarea>
  </label>
  <fieldset class="vocab">
    <legend>Tags</legend>
    <p class="muted">
      Pick what describes your map. These are how people find it - a fixed list rather than free
      text, so a search for one of them finds every map that matches.
    </p>
    {#each data.vocabulary as group}
      <div class="group">
        <h3>{group.label} <span>{group.hint}</span></h3>
        <div class="pills">
          {#each group.tags as tag}
            <label class="pick" class:on={(s.tags ?? []).includes(tag)}>
              <input type="checkbox" name="tags" value={tag} checked={(s.tags ?? []).includes(tag)} />
              <span>{tag}</span>
            </label>
          {/each}
        </div>
      </div>
    {/each}
  </fieldset>
  <button class="primary" type="submit">Save</button>
</form>

<!-- 2. Screenshots. -->
<div class="panel">
  <h2>Screenshots</h2>
  <p class="muted">
    Take a few shots in Star System Explorer and add them here - they are the difference between a
    map somebody downloads and one they scroll past. Every image is looked at by a person before it
    appears publicly.
  </p>

  <label class="file">
    Add a screenshot
    <input type="file" accept="image/png,image/jpeg,image/webp,image/gif"
           onchange={addScreenshot} disabled={uploading} />
  </label>
  {#if uploadMessage}<p class="muted">{uploadMessage}</p>{/if}

  {#if data.screenshots.length}
    <div class="shots">
      {#each data.screenshots as shot (shot.sha256)}
        <figure>
          <img src="/private/asset/{shot.sha256}" alt={shot.caption ?? 'Screenshot'} />
          {#if !shot.approved}<figcaption class="waiting">Awaiting review</figcaption>{/if}
          <form method="POST" action="?/cover">
            <input type="hidden" name="sha256" value={shot.sha256} />
            <button type="submit" disabled={s.cover_sha256 === shot.sha256}>
              {s.cover_sha256 === shot.sha256 ? 'Cover' : 'Use as cover'}
            </button>
          </form>
        </figure>
      {/each}
    </div>
  {/if}
</div>

<!-- 3. The cover: a screenshot above, or a card drawn from the map to the creator's design. -->
<div class="panel">
  <h2>Cover</h2>
  <p class="muted">
    The picture on your map's page and in every link preview. Use one of your screenshots above,
    or design a card drawn from the map itself - a constellation for a starmap, an orbital diagram
    for a system - with the words, a QR code and a palette of your choosing.
  </p>
  {#if data.designer.proOnly && !data.designer.allowed}
    <p class="muted"><strong>Designing a cover is a Pro feature at the moment.</strong> The default card is still drawn for you.</p>
  {/if}
  <div class="designer">
    <img class="preview" src={previewUrl} alt="Cover preview" width="1200" height="630" />
    <form method="POST" action="?/design" class="controls">
      <label>
        Picture
        <select name="base" bind:value={cover.base}>
          <option value="auto">Match the map ({s.kind === 'starmap' ? 'constellation' : 'orbits'})</option>
          <option value="starmap">Constellation</option>
          <option value="system">Orbits</option>
          <option value="plain">Just stars</option>
          <option value="image" disabled={!drawable.length}>One of my screenshots{drawable.length ? '' : ' (add an approved PNG or JPEG first)'}</option>
        </select>
      </label>
      {#if cover.base === 'image' && drawable.length}
        <!-- Which one. Only approved PNG or JPEG screenshots are offered: the card is stored as
             hub-drawn, and that holds only if everything under the words was already looked at. -->
        <div class="thumbs">
          {#each drawable as sh (sh.sha256)}
            <label class="thumb" class:on={(cover.baseImage ?? drawable[0]?.sha256) === sh.sha256}>
              <input type="radio" name="baseImage" value={sh.sha256}
                checked={(cover.baseImage ?? drawable[0]?.sha256) === sh.sha256}
                onchange={() => (cover.baseImage = sh.sha256)} />
              <img src="/private/asset/{sh.sha256}" alt={sh.caption ?? 'Screenshot'} />
            </label>
          {/each}
        </div>
      {/if}
      <label>
        Palette
        <select name="palette" bind:value={cover.palette}>
          <option value="night">Night</option>
          <option value="amber">Amber</option>
          <option value="mono">Mono</option>
          <option value="green">Green screen</option>
        </select>
      </label>
      <label>
        Lettering
        <select name="font" bind:value={cover.font}>
          <option value="pixel">Pixel</option>
          <option value="bold">Bold</option>
          <option value="outline">Outlined</option>
          <option value="wide">Wide</option>
        </select>
      </label>
      <div class="checks">
        <label class="check"><input type="checkbox" bind:checked={cover.title} /> Title</label>
        <label class="check"><input type="checkbox" bind:checked={cover.byline} /> By you</label>
        <label class="check"><input type="checkbox" bind:checked={cover.counts} /> What is in it</label>
        <label class="check"><input type="checkbox" bind:checked={cover.label} /> {data.label}</label>
        <label class="check"><input type="checkbox" bind:checked={cover.qr} /> QR code to this page</label>
      </div>
      <!-- Explicit on/off, so an unticked box is a statement and not an absence. -->
      <input type="hidden" name="title" value={onOff(cover.title)} />
      <input type="hidden" name="byline" value={onOff(cover.byline)} />
      <input type="hidden" name="counts" value={onOff(cover.counts)} />
      <input type="hidden" name="label" value={onOff(cover.label)} />
      <input type="hidden" name="qr" value={onOff(cover.qr)} />
      {#if cover.base === 'image' && !cover.baseImage && drawable[0]}<input type="hidden" name="baseImage" value={drawable[0].sha256} />{/if}
      <button class="primary" type="submit" disabled={!data.designer.allowed}>Use this cover</button>
      <p class="muted small">
        {#if data.coverIsScreenshot}Current cover: one of your screenshots.{:else if s.cover_sha256}Current cover: a card like this.{:else}No cover yet.{/if}
      </p>
    </form>
  </div>
</div>

<!-- 4. Publish. -->
<form class="panel" method="POST" action="?/publish">
  <h2>{s.state === 'public' ? 'Published' : 'Not published yet'}</h2>
  <input type="hidden" name="state" value={s.state === 'public' ? 'draft' : 'public'} />
  <button class="primary" type="submit" disabled={s.state !== 'public' && !data.mayPublish}>
    {s.state === 'public' ? 'Take it down' : 'Publish'}
  </button>
</form>

<style>
  h1 { margin: 0 0 4px; }
  .by { margin: 0 0 6px; color: var(--ink-faint); }
  .actions { margin: 0 0 20px; color: var(--ink-faint); }
  .inline { display: inline; }
  .linkish { background: none; border: none; padding: 0; font: inherit; color: var(--accent); cursor: pointer; }
  .thumbs { display: grid; gap: 6px; grid-template-columns: repeat(auto-fill, minmax(70px, 1fr)); margin: 0 0 8px; }
  .thumb { margin: 0; cursor: pointer; border: 2px solid transparent; border-radius: 6px; overflow: hidden; }
  .thumb.on { border-color: var(--accent); }
  .thumb input { display: none; }
  .thumb img { width: 100%; aspect-ratio: 16 / 9; object-fit: cover; display: block; }
  h2 { margin: 0 0 10px; font-size: 1.1rem; }
  .muted { color: var(--ink-dim); margin: 0 0 12px; max-width: 62ch; }
  label { display: block; margin: 12px 0; color: var(--ink-dim); }
  input[name], textarea {
    display: block; width: 100%; margin-top: 4px; font: inherit;
    background: var(--panel-2); color: var(--ink);
    border: 1px solid var(--edge); border-radius: 8px; padding: 8px;
  }
  .file input { display: block; margin-top: 6px; color: var(--ink); }
  .vocab { border: 1px solid var(--edge); border-radius: var(--radius); padding: 12px 14px; margin: 18px 0; }
  .vocab legend { color: var(--ink-faint); padding: 0 6px; font-size: 0.9rem; }
  .group { margin: 12px 0; }
  .group h3 { margin: 0 0 6px; font-size: 0.9rem; }
  .group h3 span { color: var(--ink-faint); font-weight: 400; margin-left: 8px; font-size: 0.85rem; }
  .pills { display: flex; flex-wrap: wrap; gap: 6px; }
  .pick { display: inline-flex; align-items: center; gap: 6px; margin: 0;
          padding: 3px 10px; border-radius: 999px; cursor: pointer;
          background: var(--panel-2); border: 1px solid var(--edge); font-size: 0.85rem; }
  .pick.on { border-color: var(--accent); }
  .pick input { margin: 0; }
  .shots { display: grid; gap: 12px; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); margin-top: 14px; }
  figure { margin: 0; }
  figure img { width: 100%; border-radius: 8px; border: 1px solid var(--edge); display: block; }
  .waiting { color: var(--warn); font-size: 0.82rem; margin: 4px 0; }
  figure form { margin-top: 6px; }
  .designer { display: grid; grid-template-columns: minmax(0, 1fr) 250px; gap: 16px; align-items: start; }
  @media (max-width: 720px) { .designer { grid-template-columns: 1fr; } }
  .preview { width: 100%; height: auto; border-radius: var(--radius); border: 1px solid var(--edge); display: block; background: var(--bg); }
  .controls label { margin: 8px 0; }
  .controls select {
    display: block; width: 100%; margin-top: 4px; font: inherit;
    background: var(--panel-2); color: var(--ink); border: 1px solid var(--edge); border-radius: 8px; padding: 6px 8px;
  }
  .checks { display: grid; gap: 4px; margin: 12px 0; }
  .check { display: flex; align-items: center; gap: 8px; margin: 0; color: var(--ink); }
  .check input { margin: 0; }
  .small { font-size: 0.85rem; margin-top: 8px; }
</style>
