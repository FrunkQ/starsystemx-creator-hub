<script lang="ts">
  import { enhance } from '$app/forms';
  let { data, form } = $props();
</script>

<svelte:head><title>Issues</title><meta name="robots" content="noindex" /></svelte:head>

<h1>Issues</h1>
<p class="lede">
  Public maps the hub found something wrong with when it read the file - not what anybody reported,
  what the file itself says. Each creator is shown how to fix theirs, and the map wears a
  <span class="tag warn">needs-a-fix</span> pill until they upload a fixed version. If downloaders need
  warning in the meantime, put the map on hold from its page.
</p>

{#if form?.done}<div class="panel notice"><p>{form.done}</p></div>{/if}
{#if form?.message}<div class="panel notice bad"><p>{form.message}</p></div>{/if}

{#if !data.ready}
  <div class="panel notice bad">
    <p>
      The hub cannot keep findings until migration <code>0040_map_problems.sql</code> has been run.
      Maps are still checked on upload; nothing is stored yet.
    </p>
  </div>
{:else if !data.maps.length}
  <div class="panel">
    <p>No public map has a known problem.</p>
    {#if data.drafts}
      <p class="muted">{data.drafts} {data.drafts === 1 ? 'draft has' : 'drafts have'} problems; their creators see the advice before they publish.</p>
    {/if}
  </div>
{:else}
  {#each data.maps as m (m.id)}
    <div class="panel issue" class:noted={m.noted}>
      <div class="head">
        <h3><a href="/s/{m.slug}">{m.title}</a></h3>
        <span class="muted">
          {#if m.creator}by <a href="/admin/explorers/{m.creator.handle}">{m.creator.name}</a> ·{/if}
          read {m.updatedAt.slice(0, 10)}
          {#if m.onHold}· <strong>on hold</strong>{/if}
          {#if m.noted}· noted{/if}
        </span>
      </div>
      <ul>
        {#each m.problems as p (p.code)}
          <li>
            <span class="sev" class:refuses={p.severity === 'refuses'}>{p.severity === 'refuses' ? 'Will not open' : 'Opens with faults'}</span>
            <strong>{p.title}.</strong> {p.detail}
            <details><summary>What the creator is told to do</summary><p>{p.fix}</p></details>
          </li>
        {/each}
      </ul>
      <div class="acts">
        <a href="/s/{m.slug}#moderator">Open the map</a>
        {#if !m.noted}
          <form method="POST" action="?/note" use:enhance>
            <input type="hidden" name="id" value={m.id} />
            <button type="submit" title="Take it out of the count. The pill and the advice stay until the file is fixed.">Noted</button>
          </form>
        {/if}
      </div>
    </div>
  {/each}
  {#if data.drafts}
    <p class="muted">
      And {data.drafts} {data.drafts === 1 ? 'draft has' : 'drafts have'} problems; their creators see
      the advice before they publish.
    </p>
  {/if}
{/if}

<style>
  h1 { margin: 0 0 6px; }
  .lede { color: var(--ink-dim); margin: 0 0 18px; max-width: 72ch; }
  .muted { color: var(--ink-faint); font-size: 0.88rem; }
  .issue { border-left: 3px solid var(--warn); }
  .issue.noted { border-left-color: var(--edge); opacity: 0.85; }
  .head { display: flex; flex-wrap: wrap; gap: 4px 12px; align-items: baseline; }
  .head h3 { margin: 0; }
  ul { margin: 10px 0; padding-left: 18px; }
  li { margin: 0 0 8px; max-width: 80ch; }
  .sev {
    font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.06em; font-weight: 700;
    border: 1px solid var(--warn); color: var(--warn); border-radius: 999px; padding: 0 6px; margin-right: 6px;
  }
  .sev.refuses { border-color: var(--bad); color: var(--bad); }
  details summary { cursor: pointer; color: var(--ink-faint); font-size: 0.88rem; }
  details p { margin: 4px 0 0; color: var(--ink-dim); }
  .acts { display: flex; gap: 12px; align-items: center; }
  .acts form { margin: 0; }
  .tag.warn { border-color: var(--warn); color: var(--warn); }
</style>
