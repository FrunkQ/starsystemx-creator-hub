<script lang="ts">
  import InfoDensity from '$lib/components/InfoDensity.svelte';
  import { densityFrom, densityLevel, densitySummary, FULL_DESCRIPTION } from '$lib/bundle/density';
  import { coverCrop } from '$lib/cover/image';
  import { LICENCES } from '$lib/licences';
  import { COVER_W, COVER_H, renderCover } from '$lib/cover/generate';
  let { data, form } = $props();

  const s = $derived(data.system);
  // HOW MUCH IS WRITTEN ABOUT IT (D-30), and what would lift it: the nudge to make the effort.
  const density = $derived(densityFrom(s.info_density, s.info_detail));
  const infoLevel = $derived(densityLevel(s.info_density, data.best));
  // Which group's "+" is open, if any (D-40). One at a time: the field belongs to a group.
  let adding = $state<string | null>(null);
  let uploading = $state(false);
  let uploadMessage = $state<string | null>(null);

  // THE COVER DESIGNER (D-22). The choices live here; the preview is an <img> whose address
  // carries them, so every change redraws the card on the server - no client-side rendering,
  // and what you see is byte-for-byte what "Use this cover" stores.
  let cover = $state({ ...data.coverOptions });
  const onOff = (v: boolean) => (v ? 'on' : 'off');
  // Screenshots a card can be drawn over: approved, and PNG or JPEG.
  // ============================================================================================
  // THE PICTURE IS PREPARED HERE, IN THE BROWSER (D-54).
  //
  // Decoding a screenshot in pure JavaScript on a Worker was measured at 168ms against a free
  // plan's 10ms of CPU, and going over is not an error page - Cloudflare kills the request. A
  // browser does the same work in single figures using the graphics hardware it already has, so it
  // does the work and posts the RESULT: 1200x630 of raw RGB, which the hub stores and later hands
  // to the rasteriser with no decoding at all.
  //
  // The owner chose this over a paid plan: "i dont wanna be on the hook for any runaway cost."
  // ============================================================================================
  let preparing = $state(false);
  let prepareError = $state<string | null>(null);
  /** Bumped when new pixels land, so the preview <img> asks for them rather than using its cache. */
  let prepared = $state(0);
  /** Which crops this page has already sent, so sliding back and forth does not re-upload. */
  const sent = new Set<string>();
  /** The chosen picture's real size, for deciding which way it can slide. */
  let source = $state<{ width: number; height: number } | null>(null);

  /** Which axis has any slack. A cover fit only ever has one, and offering both would be a lie. */
  const slides = $derived.by(() => {
    if (cover.base !== 'image' || !source) return null;
    const wanted = COVER_W / COVER_H;
    const got = source.width / source.height;
    if (Math.abs(got - wanted) < 0.01) return null;
    return got > wanted ? 'x' : ('y' as const);
  });

  async function prepare(sha256: string, focusX: number, focusY: number) {
    const key = [sha256, focusX.toFixed(2), focusY.toFixed(2)].join(':');
    if (sent.has(key) || preparing) return;
    preparing = true;
    prepareError = null;
    try {
      const res = await fetch('/private/asset/' + sha256);
      if (!res.ok) throw new Error('that picture could not be read');
      const bitmap = await createImageBitmap(await res.blob());
      source = { width: bitmap.width, height: bitmap.height };

      const canvas = new OffscreenCanvas(COVER_W, COVER_H);
      const ctx = canvas.getContext('2d', { alpha: false });
      if (!ctx) throw new Error('this browser cannot prepare a picture');
      const { sx, sy, sw, sh } = coverCrop(bitmap.width, bitmap.height, COVER_W, COVER_H, focusX, focusY);
      ctx.drawImage(bitmap, sx, sy, sw, sh, 0, 0, COVER_W, COVER_H);
      bitmap.close();

      // RGBA from the canvas, RGB to the hub: the alpha channel is a quarter of the upload and the
      // card has nothing to be transparent over.
      const rgba = ctx.getImageData(0, 0, COVER_W, COVER_H).data;
      const rgb = new Uint8Array(COVER_W * COVER_H * 3);
      for (let i = 0, o = 0; o < rgb.length; i += 4, o += 3) {
        rgb[o] = rgba[i]; rgb[o + 1] = rgba[i + 1]; rgb[o + 2] = rgba[i + 2];
      }

      const put = await fetch('/api/cover/fit?' + new URLSearchParams({
        systemId: s.id, sha256, focusX: String(focusX), focusY: String(focusY)
      }), { method: 'POST', headers: { 'content-type': 'application/octet-stream' }, body: rgb });
      if (!put.ok) throw new Error(await put.text().catch(() => 'the hub would not take it'));

      sent.add(key);
      baseImage = { width: COVER_W, height: COVER_H, rgb };
      prepared++;
    } catch (e) {
      prepareError = (e as Error).message ?? 'that picture could not be prepared';
    } finally {
      preparing = false;
    }
  }

  /** Pick a picture: prepare it at the current crop, then let the preview ask for it. */
  function choosePicture(sha256: string) {
    cover.base = 'image';
    cover.baseImage = sha256;
    source = null;
    baseImage = null;
    prepare(sha256, cover.focusX, cover.focusY);
  }

  /** Slide it: same picture, a different crop, so the pixels are made again. */
  function slide(value: number) {
    if (slides === 'x') cover.focusX = value;
    else cover.focusY = value;
    if (cover.baseImage) prepare(cover.baseImage, cover.focusX, cover.focusY);
  }

  // ============================================================================================
  // THE PREVIEW IS DRAWN HERE, IN THE BROWSER (D-57).
  //
  // It used to be an <img> pointing at `/api/cover/preview`, so every tick box and every font
  // redrew the card on the Worker. Measured: a card over a PHOTOGRAPH costs about 65ms to PNG-encode
  // against a free plan's 10ms of CPU, and a plain drawn card 14ms - which is why picking a font on
  // a picture-backed cover returned a 1102 and picking one on a drawn card did not.
  //
  // IT IS NOT A SECOND RASTERISER. `src/lib/cover/` is plain TypeScript with no server in it, and
  // fflate runs in a browser, so this is the SAME `renderCover` the hub runs - byte-for-byte, by
  // construction, because the card is deterministic. Two implementations would drift; one module in
  // two places cannot.
  // ============================================================================================
  let previewUrl = $state('');
  /** The picture the browser prepared, kept so the preview can draw over it without a round trip. */
  let baseImage = $state<{ width: number; height: number; rgb: Uint8Array } | null>(null);

  $effect(() => {
    // Read everything the card depends on, so this re-runs when any of it changes.
    const options = { ...cover };
    const picture = baseImage;
    let url: string | null = null;
    try {
      const png = renderCover({
        ...data.coverSubject,
        nodes: data.coverNodes,
        baseImage: options.base === 'image' ? picture : null
      } as never, options as never);
      url = URL.createObjectURL(new Blob([png as unknown as BlobPart], { type: 'image/png' }));
      previewUrl = url;
    } catch {
      // A card that cannot be drawn is not worth an error message on this page: the Save button
      // still works, and the hub draws its own copy from the same options.
    }
    return () => { if (url) URL.revokeObjectURL(url); };
  });



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
  {s.state === 'public' ? 'Published' : s.state === 'removed' ? 'Taken down' : 'Draft'}
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
{#if s.state === 'removed'}
  <!-- The terms: "we will usually say why, because that is decent." -->
  <div class="panel notice bad">
    <h3>This map was taken down by the hub</h3>
    <p>
      {s.state_note ?? 'No reason was recorded.'} It stays here for you, nobody else can see it, and
      it cannot be published again. If you think that is wrong, write to the address on the
      <a href="/takedown">takedown page</a>.
    </p>
  </div>
{/if}
{#if density}
  <!-- The nudge (D-30). Plain about what counts and what a five takes; never a scold. -->
  <div class="panel nudge">
    <h2><InfoDensity level={infoLevel} size={22} /> Information {infoLevel} of 5</h2>
    <p class="muted">
      {densitySummary(infoLevel, density)}
      {#if infoLevel >= 5}
        As well written up as any map here.
      {:else if density.total === 0}
        Nothing here carries weight for it: small objects and barycentres do not count.
      {:else if density.described < density.total}
        Describing the other {density.total - density.described}
        {density.total - density.described === 1 ? 'object' : 'objects'} in Star System Explorer and
        uploading a new version lifts it. A solid paragraph each, about {FULL_DESCRIPTION} characters,
        is what a five takes. Small objects do not count; moons count half.
      {:else}
        Every object has something. Longer - a solid paragraph each, about {FULL_DESCRIPTION}
        characters - is what a five takes.
      {/if}
    </p>
  </div>
{/if}

{#if form?.message}
  <div class="panel notice bad"><p>{form.message}</p></div>
{/if}

<!-- THE NOTICE SAYS THERE IS A PROBLEM; THE PANEL BELOW IS WHERE IT IS FIXED (D-55, D-59). -->
{#if !data.mayPublish}
  <div class="panel notice">
    <h3>{data.blocking.length} {data.blocking.length === 1 ? 'picture needs' : 'pictures need'} a source before you can share this</h3>
    <p>
      It is how the artists whose work we all use get credited.
      <a href="#credits">Fill it in below</a> - who made it, the licence, or where it came from.
      <strong>Any one of them is enough</strong>, and a CC-BY licence needs a name because that is
      the whole of what CC-BY asks.
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
          <!-- THE "+" (D-40). Not a free text box: a request. It opens a field OUTSIDE this form,
               below, because a tag has to be reviewed before anyone can use it - including you. -->
          <button type="button" class="add" onclick={() => (adding = adding === group.label ? null : group.label)}
                  title="Ask for a tag this list does not have">+</button>
        </div>
        {#each data.waitingTags.filter((w) => w.group === group.label) as w (w.tag)}
          <p class="waiting">"{w.tag}" is with a reviewer.</p>
        {/each}
      </div>
    {/each}
  </fieldset>
  <button class="primary" type="submit">Save</button>
</form>

<!-- Its own form, because it is a different request from saving the map, and a nested form is not
     a thing HTML has. Shown only once the "+" above has been pressed. -->
{#if adding}
  <form class="panel ask" method="POST" action="?/proposeTag">
    <h3>Ask for a tag in "{adding}"</h3>
    <p class="muted">
      A word the list is missing. Every tag is looked at by a person first - if it means the same as
      one that already exists, yours is swapped for that one, so the filter keeps finding every map.
      Kept tags become available to everyone.
    </p>
    <input type="hidden" name="group" value={adding} />
    <input name="tag" maxlength="32" placeholder="e.g. stars-without-number" autocomplete="off" required />
    <button class="primary" type="submit">Ask</button>
    <button type="button" onclick={() => (adding = null)}>Cancel</button>
  </form>
{/if}
{#if form?.proposed}<div class="panel notice"><p>{form.proposed}</p></div>{/if}

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
        </figure>
      {/each}
    </div>
  {/if}
</div>

<!-- EVERY CREDIT ON THIS MAP (owner, 2026-09-06: "user should be able to see all the attributions
     on their file and update them in the same way"). The blocked ones first, because those are the
     ones stopping a publish - but a thin credit is worth fixing too, and there was nowhere to do it. -->
{#if data.credits.length}
  <div class="panel" id="credits">
    <h2>Credits</h2>
    <p class="muted">
      Everything this map carries that somebody made. Any one of who, licence or where satisfies the
      hub; all three are what an artist would want. A CC-BY licence needs a name.
    </p>
    {#if form?.credited}<p class="ok">{form.credited}</p>{/if}
    <datalist id="licences">
      {#each LICENCES as l (l)}<option value={l}></option>{/each}
    </datalist>
    {#each [...data.credits].sort((a, b) => Number(b.blocked) - Number(a.blocked)) as c (c.sha256)}
      <form class="credit" class:blocked={c.blocked} method="POST" action="?/credits">
        <input type="hidden" name="sha256" value={c.sha256} />
        {#if c.isImage && c.approved}
          <img src="/private/asset/{c.sha256}" alt="" />
        {:else}
          <div class="noshot">{c.isImage ? 'Waiting to be reviewed' : '3D model'}</div>
        {/if}
        <div class="fields">
          {#if c.cc_by_breach}
            <p class="bad">CC-BY with nobody named. Add the name.</p>
          {:else if c.blocked}
            <p class="bad">Nothing recorded. This one is stopping the publish.</p>
          {/if}
          <label>Who made it <input name="credit" value={c.credit ?? ''} maxlength="200" placeholder="A name, or a studio" /></label>
          <label>
            Licence
            <input name="license" value={c.license ?? ''} maxlength="120" list="licences"
                   placeholder="Pick one, or type your own" autocomplete="off" />
          </label>
          <label>Where it came from <input name="source_url" value={c.source_url ?? ''} maxlength="500" placeholder="https://..." /></label>
          <label>What it is <input name="title" value={c.title ?? ''} maxlength="200" placeholder="Optional" /></label>
          <button class="primary" type="submit">Save this credit</button>
        </div>
      </form>
    {/each}
    <p class="muted foot">
      Recording it in Star System Explorer and uploading again works too, and is better - the credit
      then travels with the file wherever it goes.
    </p>
  </div>
{/if}

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
      <!-- ONE PLACE TO CHOOSE THE PICTURE (owner, 2026-09-06; D-44): the drawn card, or any
           screenshot you have ever added. One that cannot be used is shown and greyed with the
           reason, rather than left out of a list you would then have to guess about. -->
      <fieldset class="pictures">
        <legend>Picture</legend>
        <div class="thumbs">
          <button type="button" class="thumb card" class:on={cover.base !== 'image'}
                  onclick={() => (cover.base = 'auto')}>
            <span>The card</span>
          </button>
          {#each data.screenshots as sh (sh.sha256)}
            <button type="button" class="thumb" class:on={cover.base === 'image' && cover.baseImage === sh.sha256}
                    disabled={!sh.drawable} title={sh.why ?? 'Use this picture'}
                    onclick={() => choosePicture(sh.sha256)}>
              <img src="/private/asset/{sh.sha256}" alt={sh.caption ?? 'Screenshot'} />
              {#if sh.why}<span class="why">{sh.why}</span>{/if}
            </button>
          {/each}
        </div>
        {#if !data.screenshots.length}
          <p class="muted">Add a screenshot above and it appears here.</p>
        {/if}

        <!-- WHERE THE CROP SITS is the creator's (owner, 2026-09-06: "let the user decide where the
             crop happens - they can slide it"). A cover fit only ever has slack on ONE axis, so the
             page offers whichever is the live one rather than a slider that does nothing. -->
        {#if cover.base === 'image'}
          {#if preparing}
            <p class="muted">Preparing the picture...</p>
          {:else if prepareError}
            <p class="bad">{prepareError}</p>
          {:else if slides}
            <label class="slide">
              {slides === 'x' ? 'Slide across' : 'Slide up and down'}
              <input type="range" min="0" max="1" step="0.02"
                     value={slides === 'x' ? cover.focusX : cover.focusY}
                     oninput={(e) => slide(Number((e.currentTarget as HTMLInputElement).value))} />
            </label>
          {:else if source}
            <p class="muted">This picture is already the shape of the card - nothing to slide.</p>
          {/if}
        {/if}
      </fieldset>
      {#if cover.base !== 'image'}
        <label>
          What to draw
          <select name="base" bind:value={cover.base}>
            <option value="auto">Match the map ({s.kind === 'starmap' ? 'constellation' : 'orbits'})</option>
            <option value="starmap">Constellation</option>
            <option value="system">Orbits</option>
            <option value="plain">Just stars</option>
          </select>
        </label>
      {:else}
        <input type="hidden" name="base" value="image" />
        <input type="hidden" name="baseImage" value={cover.baseImage ?? ''} />
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
          <option value="round">Round</option>
          <option value="narrow">Narrow</option>
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
      <input type="hidden" name="focusX" value={cover.focusX} />
      <input type="hidden" name="focusY" value={cover.focusY} />
      <button class="primary" type="submit" disabled={!data.designer.allowed}>Use this cover</button>
      <p class="muted small">
        {#if data.coverIsScreenshot}Current cover: one of your screenshots.{:else if s.cover_sha256}Current cover: a card like this.{:else}No cover yet.{/if}
      </p>
    </form>
  </div>
</div>

<!-- 4. Publish. -->
<form class="panel" method="POST" action="?/publish">
  <h2>{s.state === 'public' ? 'Published' : s.state === 'removed' ? 'Taken down' : 'Not published yet'}</h2>
  <input type="hidden" name="state" value={s.state === 'public' ? 'draft' : 'public'} />
  <button class="primary" type="submit" disabled={s.state === 'removed' || (s.state !== 'public' && !data.mayPublish)}>
    {s.state === 'public' ? 'Take it down' : 'Publish'}
  </button>
  <!-- SAY WHY WHERE THE BUTTON IS (owner, 2026-09-06: "if you click a button and it wont do the
       thing you expect it should tell you there"). The reason was at the top of a long page, which
       is nowhere at all if you have scrolled past it. -->
  {#if s.state !== 'public' && s.state !== 'removed' && !data.mayPublish}
    <p class="why">
      Not yet: {data.blocking.length}
      {data.blocking.length === 1 ? 'picture needs' : 'pictures need'} a source.
      <a href="#credits">Fill that in at the top of this page</a> and this button comes alive.
    </p>
  {:else if s.state === 'removed'}
    <p class="why">This map was taken down by the hub. {s.state_note ?? ''}</p>
  {/if}
</form>

<!-- 5. Yours to upload, yours to take away (D-45). Unpublishing hides a map; this removes it. -->
<form class="panel danger-zone" method="POST" action="?/deleteMap">
  <h2>Delete this map</h2>
  <p class="muted">
    It goes from the hub for good: the page, the file people download, the screenshots nothing else
    uses, and the stars and comments it collected. This cannot be undone.
    <strong>If you only want it off the site, take it down above instead</strong> - that keeps
    everything and you can publish it again whenever you like.
  </p>
  <label class="note">Type <code>{s.title}</code> to confirm <input name="confirm" autocomplete="off" /></label>
  <button class="danger" type="submit">Delete "{s.title}"</button>
</form>

<style>
  h1 { margin: 0 0 4px; }
  .danger-zone { border-color: var(--bad); margin-top: 32px; }
  .danger-zone .note { display: block; margin: 12px 0; color: var(--ink-dim); }
  .danger-zone input { margin-left: 8px; }
  .by { margin: 0 0 6px; color: var(--ink-faint); }
  .nudge h2 { display: flex; align-items: center; gap: 8px; margin: 0 0 6px; font-size: 1.05rem; }
  .nudge p { margin: 0; max-width: 72ch; }
  .actions { margin: 0 0 20px; color: var(--ink-faint); }
  .inline { display: inline; }
  .linkish { background: none; border: none; padding: 0; font: inherit; color: var(--accent); cursor: pointer; }
  .thumbs { display: grid; gap: 6px; grid-template-columns: repeat(auto-fill, minmax(70px, 1fr)); margin: 0 0 8px; }
  .thumb img { width: 100%; aspect-ratio: 16 / 9; object-fit: cover; display: block; }
  .pictures { border: 1px solid var(--edge); border-radius: var(--radius); padding: 10px 12px; margin: 0 0 12px; }
  .pictures legend { color: var(--ink-faint); padding: 0 6px; font-size: 0.9rem; }
  /* A picture that cannot be used is SHOWN and greyed, with the reason, rather than left out. */
  .thumb {
    position: relative; margin: 0; padding: 0; overflow: hidden; cursor: pointer;
    border: 2px solid var(--edge); border-radius: 6px; background: var(--panel-2);
  }
  .thumb.on { border-color: var(--accent); }
  .thumb:disabled { cursor: not-allowed; opacity: 0.4; }
  .thumb.card { display: grid; place-items: center; aspect-ratio: 16 / 9; color: var(--ink-dim); font-size: 0.85rem; }
  .thumb .why {
    position: absolute; left: 0; right: 0; bottom: 0; padding: 2px 4px;
    background: rgba(0, 0, 0, 0.72); color: var(--ink-dim); font-size: 0.72rem;
  }
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
  /* The "+": the same size and shape as a pill, so it reads as one more thing you can pick. */
  .add {
    padding: 2px 10px; border-radius: 999px; line-height: 1.5;
    border: 1px dashed var(--edge); background: none; color: var(--ink-faint);
  }
  .add:hover { border-color: var(--accent); color: var(--accent); background: none; }
  .waiting { margin: 6px 0 0; color: var(--ink-faint); font-size: 0.85rem; }
  .ask { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
  .ask h3, .ask p { width: 100%; margin: 0; }
  .ask input[name='tag'] { min-width: 260px; }
  .pick input { margin: 0; }
  .shots { display: grid; gap: 12px; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); margin-top: 14px; }
  figure { margin: 0; }
  figure img { width: 100%; border-radius: 8px; border: 1px solid var(--edge); display: block; }
  .waiting { color: var(--warn); font-size: 0.82rem; margin: 4px 0; }
  .bad { color: var(--bad); font-size: 0.85rem; margin: 8px 0 0; }
  .slide { display: block; margin: 10px 0 0; color: var(--ink-dim); font-size: 0.9rem; }
  .why { margin: 10px 0 0; color: var(--warn); font-size: 0.9rem; }
  .ok { color: var(--accent); }
  /* One picture, its fields beside it: you cannot credit a thing you cannot see. */
  .credit { display: grid; grid-template-columns: 140px minmax(0, 1fr); gap: 14px; margin: 14px 0 0; align-items: start;
            border-top: 1px solid var(--edge); padding-top: 14px; }
  .credit.blocked { border-left: 2px solid var(--bad); padding-left: 12px; }
  .noshot {
    aspect-ratio: 16 / 9; display: grid; place-items: center; text-align: center;
    background: var(--panel-2); border: 1px solid var(--edge); border-radius: 8px;
    color: var(--ink-faint); font-size: 0.78rem; padding: 4px;
  }
  .foot { margin-top: 14px; }
  .credit img { width: 100%; border-radius: 8px; border: 1px solid var(--edge); display: block; }
  .credit label { display: block; margin: 0 0 8px; color: var(--ink-dim); font-size: 0.9rem; }
  .credit input {
    display: block; width: 100%; margin-top: 3px; font: inherit;
    background: var(--panel-2); color: var(--ink); border: 1px solid var(--edge);
    border-radius: 6px; padding: 6px 8px;
  }
  @media (max-width: 640px) { .credit { grid-template-columns: 1fr; } }
  .slide input { display: block; width: 100%; margin-top: 4px; }
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
