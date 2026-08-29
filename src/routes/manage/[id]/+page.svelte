<script lang="ts">
  let { data, form } = $props();

  const s = $derived(data.system);
  let uploading = $state(false);
  let uploadMessage = $state<string | null>(null);

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
</p>

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

<!-- 3. Publish. -->
<form class="panel" method="POST" action="?/publish">
  <h2>{s.state === 'public' ? 'Published' : 'Not published yet'}</h2>
  <input type="hidden" name="state" value={s.state === 'public' ? 'draft' : 'public'} />
  <button class="primary" type="submit" disabled={s.state !== 'public' && !data.mayPublish}>
    {s.state === 'public' ? 'Take it down' : 'Publish'}
  </button>
</form>

<style>
  h1 { margin: 0 0 4px; }
  .by { margin: 0 0 20px; color: var(--ink-faint); }
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
</style>
