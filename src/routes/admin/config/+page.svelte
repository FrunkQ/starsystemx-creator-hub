<script lang="ts">
  let { data, form } = $props();
</script>

<svelte:head><title>Gates</title><meta name="robots" content="noindex" /></svelte:head>

<h1>Gates</h1>
<p class="lede">
  Every limit the hub enforces is a row here. Changes take effect on the next request - no deploy.
  Values are JSON: <code>true</code>, <code>false</code>, or a number.
</p>

<div class="panel notice">
  <h3>zips_allowed is the kill switch</h3>
  <p>
    Setting it to <code>false</code> rejects any upload carrying assets and reduces the whole abuse
    surface to text. The hub keeps working: Star System Explorer guarantees a plain .json save
    still loads, and always will.
  </p>
</div>

{#if form?.message}
  <div class="panel notice bad"><p>{form.message}</p></div>
{/if}

<table>
  <thead><tr><th>Gate</th><th>Value</th><th>What it does</th><th></th></tr></thead>
  <tbody>
    {#each data.rows as row (row.key)}
      <tr>
        <td><code>{row.key}</code></td>
        <td>
          <form method="POST" class="inline">
            <input type="hidden" name="key" value={row.key} />
            <input name="value" value={JSON.stringify(row.value)} size="12" />
            <button type="submit">Set</button>
          </form>
        </td>
        <td class="note">{row.note ?? ''}</td>
        <td class="when">{row.updated_at?.slice(0, 10) ?? ''}</td>
      </tr>
    {/each}
  </tbody>
</table>

<style>
  h1 { margin: 0 0 6px; }
  .lede { color: var(--ink-dim); margin: 0 0 18px; max-width: 66ch; }
  .inline { display: flex; gap: 6px; }
  input {
    font: inherit; background: var(--panel-2); color: var(--ink);
    border: 1px solid var(--edge); border-radius: 6px; padding: 4px 8px;
  }
  .note { color: var(--ink-dim); font-size: 0.88rem; max-width: 46ch; }
  .when { color: var(--ink-faint); font-size: 0.85rem; white-space: nowrap; }
</style>
