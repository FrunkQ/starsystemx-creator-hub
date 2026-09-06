<script lang="ts">
  import { shortId } from '$lib/auditLog';
  let { data } = $props();

  /** Keep the filters that are set when following a link, so paging does not lose them. */
  function href(extra: Record<string, string | null>): string {
    const p = new URLSearchParams();
    if (data.filters.who) p.set('who', data.filters.who);
    if (data.filters.group) p.set('group', data.filters.group);
    if (data.filters.modsOnly) p.set('mods', '1');
    for (const [k, v] of Object.entries(extra)) {
      if (v === null) p.delete(k);
      else p.set(k, v);
    }
    const q = p.toString();
    return '/admin/log' + (q ? '?' + q : '');
  }

  const when = (iso: string) => iso.slice(0, 16).replace('T', ' ');
</script>

<svelte:head><title>Log</title><meta name="robots" content="noindex" /></svelte:head>

<h1>Log</h1>
<p class="lede">
  Every action a person with a role has taken, newest first. It has been recorded since the first
  migration - when a creator asks why their map vanished, the answer has to exist - and this is
  where it is read. Only an admin can see this page.
</p>

<!-- Plain GET form: filters belong in the address, so a view can be linked and paged. -->
<form class="panel filters" method="GET">
  <label>
    Who
    <select name="who">
      <option value="">everyone</option>
      {#each data.filters.staff as s (s.id)}
        <option value={s.id} selected={data.filters.who === s.id}>{s.handle} ({s.role})</option>
      {/each}
    </select>
  </label>
  <label>
    What
    <select name="group">
      <option value="">everything</option>
      {#each data.filters.groups as g (g)}
        <option value={g} selected={data.filters.group === g}>{g}</option>
      {/each}
    </select>
  </label>
  <label class="check">
    <input type="checkbox" name="mods" value="1" checked={data.filters.modsOnly} />
    Only what a moderator can do
  </label>
  <button type="submit">Show</button>
  {#if data.filters.who || data.filters.group || data.filters.modsOnly}
    <a href="/admin/log">Clear</a>
  {/if}
</form>

{#if !data.entries.length}
  <div class="panel"><p class="muted">Nothing recorded that matches.</p></div>
{:else}
  <table>
    <thead>
      <tr><th>When</th><th>Who</th><th>Did what</th><th>Why</th></tr>
    </thead>
    <tbody>
      {#each data.entries as e (e.id)}
        <tr>
          <td class="when" title={e.at}>{when(e.at)}</td>
          <td class="who">
            {#if e.actor}
              <a href="/admin/explorers/{e.actor.handle}">{e.actor.handle}</a>
              {#if e.actor.role !== 'user'}<span class="role" class:mod={e.actor.role === 'moderator'}>{e.actor.role}</span>{/if}
            {:else}
              <!-- The FK is ON DELETE SET NULL: what was done outlives whoever did it. -->
              <span class="muted">a deleted account</span>
            {/if}
          </td>
          <td>
            <span class="verb">{e.verb}</span>
            {#if e.targetMap}
              <a href="/s/{e.targetMap.slug}">{e.targetMap.title}</a>
            {:else if e.targetPerson}
              <a href="/admin/explorers/{e.targetPerson}">{e.targetPerson}</a>
            {:else if e.target.kind === 'tag' || e.target.kind === 'config'}
              <code>{e.target.id}</code>
            {:else if e.target.kind !== 'unknown'}
              <span class="mono" title={e.target.id}>{e.target.kind} {shortId(e.target.id)}</span>
            {:else}
              <span class="mono" title={e.target.id}>{shortId(e.target.id)}</span>
            {/if}
            {#if e.detail}<span class="detail" title={e.detail}>{e.detail.slice(0, 60)}</span>{/if}
          </td>
          <td class="reason">{e.reason ?? ''}</td>
        </tr>
      {/each}
    </tbody>
  </table>

  {#if data.older}
    <p class="more"><a href={href({ before: data.older })}>Older</a></p>
  {/if}
{/if}

<style>
  h1 { margin: 0 0 6px; }
  .lede { color: var(--ink-dim); margin: 0 0 18px; max-width: 78ch; }
  .filters { display: flex; gap: 16px; align-items: flex-end; flex-wrap: wrap; }
  .filters label { color: var(--ink-dim); font-size: 0.9rem; display: flex; flex-direction: column; gap: 4px; }
  .filters .check { flex-direction: row; align-items: center; gap: 6px; }
  select {
    font: inherit; background: var(--panel-2); color: var(--ink);
    border: 1px solid var(--edge); border-radius: 6px; padding: 5px 8px;
  }
  .muted { color: var(--ink-dim); margin: 0; }
  .when { color: var(--ink-faint); white-space: nowrap; font-size: 0.88rem; }
  .who { white-space: nowrap; }
  .verb { color: var(--ink); }
  .reason { color: var(--ink-dim); max-width: 40ch; }
  .mono { font-family: ui-monospace, "Cascadia Code", Consolas, monospace; font-size: 0.85em; color: var(--ink-faint); }
  .detail { color: var(--ink-faint); font-size: 0.82rem; margin-left: 8px; }
  /* The same two colours the staff nav uses, for the same two roles. */
  .role {
    font-size: 0.64rem; text-transform: uppercase; letter-spacing: 0.07em; font-weight: 700;
    padding: 1px 5px; border-radius: 999px; margin-left: 6px;
    background: var(--warn); color: var(--accent-ink);
  }
  .role.mod { background: var(--accent); }
  .more { margin: 16px 0 0; }
</style>
