<script lang="ts">
  // The takedown queue (D-69). Work at the top, history underneath, nothing ever deleted.
  import type { PageData, ActionData } from './$types';

  let { data, form }: { data: PageData; form: ActionData } = $props();

  const when = (iso: string | null) => (iso ? iso.slice(0, 10) : '');
  /** The words a person would use, not the enum. */
  const OUTCOME: Record<string, string> = {
    actioned: 'Taken down',
    rejected: 'Rejected',
    withdrawn: 'Withdrawn'
  };
</script>

<svelte:head><title>Takedowns - admin</title><meta name="robots" content="noindex" /></svelte:head>

<h1>Takedowns</h1>
<p class="lede">
  Copyright claims sent through <a href="/takedown">the takedown page</a>. They stay here after they
  are dealt with - the record of what was asked and what we did is the point of keeping them.
</p>

{#if form?.message}<div class="panel notice"><p>{form.message}</p></div>{/if}

<h2>Open{#if data.open.length} · {data.open.length}{/if}</h2>

{#if !data.open.length}
  <p class="muted">Nothing waiting.</p>
{/if}

{#each data.open as t (t.id)}
  <div class="panel claim">
    <div class="head">
      <span class="who">{t.claimant_name || 'No name given'}</span>
      <!-- The address is here because a claim cannot be answered without it. -->
      <a class="mail" href={'mailto:' + t.claimant_email}>{t.claimant_email}</a>
      <span class="when">{when(t.created_at)}</span>
      {#if !t.mailed}
        <!-- The record exists even when the notice did not send, and saying so is the difference
             between "nobody has looked" and "nobody was told". -->
        <span class="tag warn" title="The claim was logged but no notice was emailed">not emailed</span>
      {/if}
    </div>

    <p class="about">
      {#if t.url}
        <span class="muted">About:</span>
        <a href={t.url} rel="noopener">{t.system_title ?? t.url}</a>
        {#if t.system_id}
          <!-- The hub RESOLVED that url to a map when the claim came in, so this is one of ours
               and the link goes somewhere. An unresolved url may be anything at all. -->
          <span class="tag">a map on the hub</span>
        {:else}
          <span class="muted small">- the hub could not match that to a map</span>
        {/if}
      {:else}
        <span class="muted">No page given - read the note below.</span>
      {/if}
    </p>

    <p class="detail">{t.detail}</p>

    <form method="POST" action="?/resolve" class="close">
      <input type="hidden" name="id" value={t.id} />
      <label>
        What happened
        <select name="state">
          <option value="actioned">Taken down - the material is gone</option>
          <option value="rejected">Rejected - not a valid claim</option>
          <option value="withdrawn">Withdrawn - they said so</option>
        </select>
      </label>
      <label>
        Notes
        <input name="outcome" placeholder="What you did, and why. A line is enough." maxlength="2000" />
      </label>
      <button class="primary" type="submit">Close it</button>
    </form>
  </div>
{/each}

<h2>Dealt with</h2>

{#if !data.closed.length}
  <p class="muted">Nothing yet.</p>
{:else}
  <table>
    <thead><tr><th>Came in</th><th>From</th><th>About</th><th>Outcome</th><th>Closed</th><th></th></tr></thead>
    <tbody>
      {#each data.closed as t (t.id)}
        <tr>
          <td class="when">{when(t.created_at)}</td>
          <td>{t.claimant_name || t.claimant_email}</td>
          <!-- The TITLE, kept as text, so this still reads after the map has gone - which is
               usually what "actioned" means. -->
          <td>{t.system_title ?? t.url ?? '-'}</td>
          <td><span class="tag" class:done={t.state === 'actioned'}>{OUTCOME[t.state] ?? t.state}</span></td>
          <td class="when">{when(t.resolved_at)}</td>
          <td>
            <form method="POST" action="?/reopen">
              <input type="hidden" name="id" value={t.id} />
              <button type="submit">Reopen</button>
            </form>
          </td>
        </tr>
        {#if t.outcome}
          <tr class="note"><td colspan="6">{t.outcome}</td></tr>
        {/if}
      {/each}
    </tbody>
  </table>
{/if}

<style>
  h1 { margin: 0 0 6px; }
  h2 { margin: 26px 0 10px; font-size: 1.05rem; }
  .lede { color: var(--ink-dim); max-width: 70ch; margin: 0 0 8px; }
  .claim .head { display: flex; flex-wrap: wrap; gap: 6px 14px; align-items: baseline; }
  .who { font-weight: 600; }
  .mail { font-size: 0.9rem; }
  .when { color: var(--ink-faint); font-size: 0.9rem; font-variant-numeric: tabular-nums; }
  .about { margin: 8px 0 0; font-size: 0.95rem; }
  .small { font-size: 0.85rem; }
  .detail { margin: 10px 0 0; white-space: pre-wrap; color: var(--ink-dim); max-width: 78ch; }
  .close { display: flex; flex-wrap: wrap; gap: 10px; align-items: end; margin-top: 14px;
           border-top: 1px solid var(--edge); padding-top: 12px; }
  .close label { display: block; color: var(--ink-faint); font-size: 0.85rem; }
  .close select, .close input {
    display: block; margin-top: 3px; font: inherit;
    background: var(--panel-2); color: var(--ink);
    border: 1px solid var(--edge); border-radius: 8px; padding: 8px 10px;
  }
  .close input { min-width: 30ch; }
  .tag.warn { border-color: var(--warn); color: var(--warn); }
  .tag.done { border-color: var(--accent); color: var(--accent); }
  tr.note td { color: var(--ink-faint); font-size: 0.9rem; padding-top: 0; border-top: 0; }
  table form { margin: 0; }
</style>
