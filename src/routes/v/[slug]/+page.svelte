<script lang="ts">
  import { providesLine } from '$lib/v4/read';
  import { fanWorkNotice } from '$lib/fanWork';
  let { data } = $props();
  const it = $derived(data.item);
  let copied = $state(false);
  let reportOpen = $state(false);
  let reportReason = $state('content');
  let reportDetail = $state('');
  let reportDone = $state<string | null>(null);
  let note = $state('');
  let staffMsg = $state<string | null>(null);

  async function copyLink() {
    try { await navigator.clipboard.writeText(data.metaUrl); copied = true; setTimeout(() => (copied = false), 2000); } catch { /* the link is shown below anyway */ }
  }
  async function report(e: Event) {
    e.preventDefault();
    const body = new FormData();
    body.set('slug', it.slug); body.set('reason', reportReason); body.set('detail', reportDetail);
    const res = await fetch('/api/v4/report', { method: 'POST', body });
    reportDone = res.ok ? 'Thank you. A moderator will look at it.' : ((await res.json().catch(() => null) as { message?: string } | null)?.message ?? 'That report could not be sent.');
  }
  async function act(action: string) {
    const res = await fetch('/api/admin/v4', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: it.id, action, note }) });
    staffMsg = res.ok ? 'Done. Reload to see it.' : ((await res.text()) || 'That did not work.');
  }
</script>

<svelte:head><title>{it.title} - {data.site.name}</title></svelte:head>

<p class="crumb"><a href="/shelves">Shelves</a> › {data.shelfTitle}</p>
<h1>{it.title} <span class="gen">v4</span></h1>
{#if it.summary}<p class="lede">{it.summary}</p>{/if}

{#if it.state !== 'public'}
  <div class="panel notice bad"><p><strong>{it.state === 'held' ? 'Held' : 'Removed'}:</strong> not shown or served to anyone else. {it.hold_note ?? ''}</p></div>
{/if}

{#if it.fan_setting}
  <div class="panel fan"><strong>Unofficial fan work: {it.fan_setting}.</strong> {fanWorkNotice(it.fan_setting)}</div>
{/if}

<div class="actions">
  <a class="download" href={data.fileUrl} data-sveltekit-reload>Download</a>
  <button onclick={copyLink}>{copied ? 'Copied' : 'Copy the link for SSE4'}</button>
</div>

<dl class="panel facts">
  <dt>Made by</dt><dd>{data.maker?.display_name ?? data.maker?.handle ?? 'unknown'}</dd>
  {#if it.kind === 'pack'}
    <dt>Pack</dt><dd class="mono">{it.pack_id} {it.pack_version}</dd>
    <dt>Kind</dt><dd>{it.pack_kinds.join(', ')}{#if it.fictional} · <strong>fictional physics</strong>: its results are marked fictional wherever they are used{/if}</dd>
    <dt>Provides</dt><dd>{providesLine(it.provides) || 'nothing listed'}</dd>
    <dt>Needs</dt><dd>{#if it.requires.length}{#each it.requires as r, i (r.id)}<span class="mono">{r.id} {r.range}</span>{i < it.requires.length - 1 ? ', ' : ''}{/each}{:else}no other packs{/if}</dd>
    <dt>Kernel</dt><dd class="mono">{it.kernel_range}</dd>
    <dt>Licence</dt><dd>{it.licence}</dd>
  {:else}
    <dt>Universe</dt><dd class="mono">{it.universe_root}</dd>
    <dt>Events</dt><dd>{it.event_count}</dd>
    <dt>State hash</dt><dd class="mono">{it.state_hash}</dd>
    <dt>Made with</dt><dd>{#if it.stack.length}{#each it.stack as p, i (p.id)}<span class="mono">{p.id} {p.version}</span>{i < it.stack.length - 1 ? ', ' : ''}{/each}{:else}the built-in packs only{/if}</dd>
  {/if}
  <dt>File</dt><dd class="mono">{(it.byte_size / 1024).toFixed(0)} KB · SHA-256 {it.sha256}</dd>
  <dt>Published</dt><dd>{it.created_at.slice(0, 10)} · {it.download_count} downloads</dd>
</dl>

{#if data.versions.length > 1}
  <h2>Versions</h2>
  <ul class="versions">
    {#each data.versions as v (v.slug)}<li><a href="/v/{v.slug}" aria-current={v.slug === it.slug ? 'page' : undefined}>{v.pack_version}</a> <span class="dim">{v.created_at.slice(0, 10)}</span></li>{/each}
  </ul>
{/if}

<p class="dim small">The file is served exactly as it was published. Its SHA-256 is above, so you can check
  what you downloaded. SSE4 checks the pack again before it adds it to a campaign, and says why if it refuses one.</p>

{#if data.signedIn && !data.mine}
  {#if reportDone}<p class="dim">{reportDone}</p>
  {:else if reportOpen}
    <form class="panel" onsubmit={report}>
      <label>What is wrong?
        <select bind:value={reportReason}>
          <option value="content">Content that should not be here</option>
          <option value="copyright">It copies someone's work (logos, art, text)</option>
          <option value="spam">Spam</option>
          <option value="other">Something else</option>
        </select>
      </label>
      <label>Details <textarea bind:value={reportDetail} maxlength="2000" rows="3"></textarea></label>
      <button type="submit">Send report</button>
    </form>
  {:else}
    <button class="link" onclick={() => (reportOpen = true)}>Report this</button>
  {/if}
{/if}

{#if data.staff}
  <div class="panel staff">
    <h3>Moderation {#if data.openReports}<span class="dim">({data.openReports} open reports)</span>{/if}</h3>
    <label>Reason (goes in the log) <input bind:value={note} maxlength="500" /></label>
    <div class="actions">
      {#if it.state === 'public'}<button onclick={() => act('hold')} disabled={!note.trim()}>Hold</button>{:else}<button onclick={() => act('restore')}>Restore</button>{/if}
      {#if data.openReports}<button onclick={() => act('dismiss')}>Close reports, no action</button>{/if}
      <button onclick={() => act('remove')} disabled={!note.trim()}>Remove (owner only)</button>
    </div>
    {#if staffMsg}<p class="dim">{staffMsg}</p>{/if}
  </div>
{/if}

<style>
  h1 { margin: 0 0 6px; }
  .crumb { margin: 0 0 4px; color: var(--ink-faint); font-size: 0.9rem; }
  .gen { font-family: var(--font-mono); font-size: 0.8rem; vertical-align: middle; border: 1px solid var(--edge); padding: 1px 6px; color: var(--ink-dim); }
  .lede { color: var(--ink-dim); margin: 0 0 16px; max-width: 64ch; }
  .actions { display: flex; flex-wrap: wrap; gap: 10px; margin: 14px 0; align-items: center; }
  .facts { display: grid; grid-template-columns: max-content 1fr; gap: 6px 16px; }
  .facts dt { color: var(--ink-faint); }
  .facts dd { margin: 0; overflow-wrap: anywhere; }
  .mono { font-family: var(--font-mono); font-size: 0.9rem; }
  .fan { color: var(--ink-dim); font-size: 0.92rem; }
  .dim { color: var(--ink-faint); }
  .small { font-size: 0.88rem; max-width: 68ch; }
  .versions { padding-left: 18px; }
  [aria-current='page'] { font-weight: 600; }
  label { display: block; margin: 8px 0; color: var(--ink-dim); }
  label input, label select, label textarea { display: block; width: 100%; margin-top: 4px; }
  button.link { background: none; border: none; box-shadow: none; padding: 0; color: var(--link); text-decoration: underline; cursor: pointer; }
  @media (max-width: 560px) { .facts { grid-template-columns: 1fr; } .facts dd { margin-bottom: 6px; } }
</style>
