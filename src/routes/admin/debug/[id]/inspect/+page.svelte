<script lang="ts">
  import { formatBytes } from '$lib/bundle/facets';
  let { data } = $props();
  const r = $derived(data.report);
  const show = (v: unknown) => (v === null || v === undefined ? '-' : typeof v === 'string' ? v : JSON.stringify(v));
</script>

<svelte:head><title>Inspect {data.upload.filename}</title><meta name="robots" content="noindex" /></svelte:head>

<p class="crumb"><a href="/admin/debug">Debug uploads</a></p>
<h1>{data.upload.filename}</h1>
<p class="by">
  {formatBytes(data.upload.bytes)} · received {data.upload.uploadedAt.slice(0, 16).replace('T', ' ')}
  · <a href="/admin/debug/{data.upload.id}" data-sveltekit-reload>Download</a>
</p>
{#if data.upload.note}<div class="panel"><p class="muted">They said: {data.upload.note}</p></div>{/if}

{#if r.warnings.length}
  <div class="panel notice" class:bad={r.warnings.some((w) => /cut short|truncated|does not parse|not a/i.test(w))}>
    <h3>Findings</h3>
    <ul>{#each r.warnings as w}<li>{w}</li>{/each}</ul>
  </div>
{:else}
  <div class="panel notice"><h3>Nothing wrong with the file itself</h3><p>It opens, parses and names nothing it lacks. The bug is in what it says, not how it is written.</p></div>
{/if}

<div class="two">
  <section class="panel">
    <h2>The container</h2>
    <dl>
      <dt>Kind</dt><dd>{r.container}{#if r.zip}{r.zip.ok ? ', readable' : ', unreadable'}{/if}</dd>
      {#if r.zip}
        <dt>Zip index</dt><dd>{r.zip.truncated ? 'missing - truncated' : 'present'}</dd>
        <dt>Document</dt><dd>{r.zip.docPath ?? 'none found'}</dd>
        <dt>Attributions file</dt><dd>{r.zip.hasAttributions ? 'present' : 'absent'}</dd>
        {#if r.zip.message}<dt>Reader said</dt><dd>{r.zip.message}</dd>{/if}
      {/if}
    </dl>
    {#if r.zip?.entries.length}
      <details>
        <summary>{r.zip.entries.length} {r.zip.entries.length === 1 ? 'entry' : 'entries'}</summary>
        <table>
          <tbody>{#each r.zip.entries as e (e.name)}<tr><td class="mono">{e.name}</td><td class="num">{formatBytes(e.size)}</td></tr>{/each}</tbody>
        </table>
      </details>
    {/if}
  </section>

  <!-- A CRASH LOG rather than a save (D-40). When the app falls over, the console is what a person
       has to hand, so the inspector reads one: the build, the browser, and the FIRST error with the
       frames under it - the cause, where the ones after it are usually its echoes. -->
  {#if r.log}
    <section class="panel">
      <h2>The log</h2>
      <dl>
        <dt>Lines</dt><dd>{r.log.lines.toLocaleString('en-GB')}</dd>
        <dt>Build</dt><dd>{r.log.appVersion ?? 'not stated'}</dd>
        <dt>Browser</dt><dd class="mono">{r.log.userAgent ?? 'not stated'}</dd>
        <dt>Errors</dt>
        <dd>
          {#if r.log.errors}<span class="bad">{r.log.errors}</span>{:else}none{/if}
          {#if r.log.warnings}, {r.log.warnings} warnings{/if}
        </dd>
      </dl>
      {#if r.log.firstError}
        <h3>First failure</h3>
        <pre class="log">{r.log.firstError}{#each r.log.stack as f (f)}
{f}{/each}</pre>
      {/if}
      {#if r.log.distinct.length > 1}
        <h3>Every distinct error</h3>
        <ul class="distinct">
          {#each r.log.distinct as e (e)}<li class="mono">{e}</li>{/each}
        </ul>
      {/if}
    </section>
  {/if}

  <section class="panel">
    <h2>The document</h2>
    {#if !r.doc}
      <p class="muted">No document to read.</p>
    {:else}
      <dl>
        <dt>Parses</dt>
        <dd>
          {#if r.doc.parse.ok}yes{:else}
            <span class="bad">no</span> - {r.doc.parse.message}
            {#if r.doc.parse.position !== null} at character {r.doc.parse.position.toLocaleString('en-GB')} of {r.doc.textLength.toLocaleString('en-GB')}{/if}
            {#if r.doc.parse.truncated} <span class="bad">(cut short)</span>{/if}
          {/if}
        </dd>
        {#if !r.doc.parse.ok}<dt>Near</dt><dd><code class="near">{r.doc.parse.near}</code></dd>{/if}
        <dt>Text</dt><dd>{r.doc.textLength.toLocaleString('en-GB')} characters</dd>
        <dt>Kind</dt><dd>{r.doc.kind}{#if r.doc.name} - "{r.doc.name}"{/if}</dd>
        <dt>bundleFormat</dt><dd>{show(r.doc.bundleFormat)}</dd>
        <dt>appVersion</dt><dd>{show(r.doc.appVersion)}</dd>
        <dt>revision</dt><dd>{show(r.doc.revision)}</dd>
        <dt>exportMode</dt><dd>{show(r.doc.exportMode)}</dd>
        {#if r.doc.parse.ok}
          <dt>Systems</dt><dd>{r.doc.systems}</dd>
          <dt>Objects</dt><dd>{r.doc.nodes} · {r.doc.complete} complete (id, kind and name)</dd>
          {#if r.doc.incomplete.length}<dt>Incomplete</dt><dd class="mono">{r.doc.incomplete.join(', ')}</dd>{/if}
          {#if r.doc.orphans.length}<dt>Orphans</dt><dd class="mono">{r.doc.orphans.join(', ')}</dd>{/if}
          {#if r.doc.duplicateIds.length}<dt>Duplicate ids</dt><dd class="mono">{r.doc.duplicateIds.join(', ')}</dd>{/if}
          <dt>GM material</dt><dd>{r.doc.gmNotes} with GM notes · {r.doc.hiddenNodes} hidden</dd>
          <dt>Top-level keys</dt><dd class="mono">{r.doc.keys.join(', ')}</dd>
        {/if}
      </dl>
    {/if}
  </section>
</div>

<section class="panel">
  <h2>What it says it needs</h2>
  {#if !r.requires.length}
    <p class="muted">No asset files referenced.</p>
  {:else}
    <table>
      <thead><tr><th>File</th><th>In the zip</th></tr></thead>
      <tbody>
        {#each r.requires as p (p)}
          <tr><td class="mono">{p}</td><td>{#if r.missing.includes(p)}<span class="bad">missing</span>{:else if r.container === 'zip'}yes{:else}-{/if}</td></tr>
        {/each}
      </tbody>
    </table>
  {/if}
  {#if r.unreferenced.length}
    <p class="muted">In the zip but named by nothing: <span class="mono">{r.unreferenced.join(', ')}</span></p>
  {/if}
</section>

<style>
  .crumb { margin: 0 0 4px; }
  h1 { margin: 0 0 4px; overflow-wrap: anywhere; }
  h2 { margin: 0 0 10px; font-size: 1.05rem; }
  .by { color: var(--ink-faint); margin: 0 0 12px; }
  .muted { color: var(--ink-dim); }
  .bad { color: var(--bad); }
  .two { display: grid; gap: 16px; grid-template-columns: repeat(auto-fit, minmax(340px, 1fr)); }
  .two .panel { margin: 0 0 16px; }
  dl { display: grid; grid-template-columns: max-content 1fr; gap: 4px 14px; margin: 0; }
  dt { color: var(--ink-faint); }
  dd { margin: 0; overflow-wrap: anywhere; }
  .mono { font-family: ui-monospace, "Cascadia Code", Consolas, monospace; font-size: 0.85em; }
  .near { display: block; white-space: pre-wrap; background: var(--bg); border: 1px solid var(--edge); border-radius: 6px; padding: 6px 8px; }
  .num { text-align: right; white-space: nowrap; color: var(--ink-faint); }
  details { margin-top: 10px; }
  summary { cursor: pointer; color: var(--ink-dim); }
  ul { margin: 0; padding-left: 18px; }
  .log { white-space: pre-wrap; }
  h3 { font-size: 0.95rem; margin: 14px 0 6px; color: var(--ink-dim); }
  .distinct { margin: 0; padding-left: 18px; color: var(--ink-dim); font-size: 0.88rem; }
</style>
