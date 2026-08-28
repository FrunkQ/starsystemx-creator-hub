<script lang="ts">
  let { data } = $props();
</script>

<svelte:head><title>Reports</title><meta name="robots" content="noindex" /></svelte:head>

<h1>Reports</h1>
<p class="lede">
  {data.reports.length} open. An asset report feeds the hash queue directly, so acting on it
  protects every other map using the same bytes.
</p>

{#if !data.reports.length}
  <div class="panel"><p>Nothing open.</p></div>
{:else}
  <table>
    <thead><tr><th>When</th><th>Target</th><th>Reason</th><th>Detail</th></tr></thead>
    <tbody>
      {#each data.reports as r (r.id)}
        <tr>
          <td class="when">{r.created_at?.slice(0, 10)}</td>
          <td>
            {#if r.target === 'asset'}
              <a href="/admin/review">image {r.sha256?.slice(0, 12)}</a>
            {:else}
              <a href="/s/{r.systems?.slug}">{r.systems?.title ?? r.systems?.slug}</a>
            {/if}
          </td>
          <td><span class="tag">{r.reason}</span></td>
          <td class="detail">{r.detail ?? ''}</td>
        </tr>
      {/each}
    </tbody>
  </table>
{/if}

<style>
  h1 { margin: 0 0 6px; }
  .lede { color: var(--ink-dim); margin: 0 0 18px; max-width: 66ch; }
  .when { color: var(--ink-faint); white-space: nowrap; }
  .detail { color: var(--ink-dim); max-width: 46ch; }
</style>
