<script lang="ts">
  let { data, form } = $props();
</script>

<svelte:head><title>Reports</title><meta name="robots" content="noindex" /></svelte:head>

<h1>Reports</h1>
<p class="lede">
  {data.reports.length} open. A picture report is settled in the review queue and protects every
  map using the same bytes. A map report is settled here by taking the map down, a comment report
  by removing the comment - or either by dismissing it. Every action closes the report.
</p>

{#if form?.done}<div class="panel notice"><p>{form.done}</p></div>{/if}
{#if form?.message}<div class="panel notice bad"><p>{form.message}</p></div>{/if}

{#if !data.reports.length}
  <div class="panel"><p>Nothing open.</p></div>
{:else}
  <table>
    <thead><tr><th>When</th><th>About</th><th>Reason</th><th>Detail</th><th></th></tr></thead>
    <tbody>
      {#each data.reports as r (r.id)}
        <tr>
          <td class="when">{r.created_at?.slice(0, 10)}</td>
          <td>
            {#if r.target === 'asset'}
              <a href="/admin/review">image {r.sha256?.slice(0, 12)}</a>
            {:else if r.target === 'comment'}
              <span class="kind">comment</span>
              {#if r.map}under <a href="/s/{r.map.slug}#comments">{r.map.title}</a>{/if}
              {#if r.comment}
                <div class="text">{r.comment.body}</div>
                <div class="muted">by {r.comment.by ?? 'a former explorer'}{#if r.comment.removed} · already removed{/if}</div>
              {/if}
            {:else if r.map}
              <span class="kind">map</span> <a href="/s/{r.map.slug}">{r.map.title}</a>
            {:else}
              <span class="muted">a map that is gone</span>
            {/if}
          </td>
          <td><span class="tag">{r.reason}</span></td>
          <td class="detail">{r.detail ?? ''}</td>
          <td class="acts">
            {#if r.target === 'system' && r.map}
              <form method="POST" action="?/takedown" class="row">
                <input type="hidden" name="id" value={r.id} />
                <input name="note" placeholder="why, for the cartographer" maxlength="500" />
                <button class="danger" type="submit">Take down</button>
              </form>
            {:else if r.target === 'comment' && r.comment && !r.comment.removed}
              <form method="POST" action="?/removeComment">
                <input type="hidden" name="id" value={r.id} />
                <button class="danger" type="submit">Remove comment</button>
              </form>
            {/if}
            <form method="POST" action="?/dismiss">
              <input type="hidden" name="id" value={r.id} />
              <button type="submit">Dismiss</button>
            </form>
          </td>
        </tr>
      {/each}
    </tbody>
  </table>
{/if}

<style>
  h1 { margin: 0 0 6px; }
  .lede { color: var(--ink-dim); margin: 0 0 18px; max-width: 70ch; }
  .when { color: var(--ink-faint); white-space: nowrap; }
  .kind { color: var(--ink-faint); font-size: 0.85rem; text-transform: uppercase; letter-spacing: 0.06em; margin-right: 4px; }
  .detail { color: var(--ink-dim); max-width: 36ch; }
  .text { color: var(--ink); max-width: 44ch; white-space: pre-wrap; overflow-wrap: anywhere; margin-top: 4px; }
  .muted { color: var(--ink-faint); font-size: 0.85rem; }
  .acts { display: flex; flex-direction: column; gap: 6px; align-items: flex-start; }
  .acts form { margin: 0; }
  .row { display: flex; gap: 6px; align-items: center; }
  .row input {
    font: inherit; font-size: 0.85rem; width: 180px;
    background: var(--panel-2); color: var(--ink); border: 1px solid var(--edge); border-radius: 8px; padding: 5px 8px;
  }
</style>
