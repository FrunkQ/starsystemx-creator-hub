<script lang="ts">
  let { data, form } = $props();
</script>

<svelte:head><title>Gates</title><meta name="robots" content="noindex" /></svelte:head>

<h1>Gates</h1>
<p class="lede">
  Every limit the hub enforces is a row here. Changes take effect on the next request - no deploy.
  Values are JSON: <code>true</code>, <code>false</code>, a number, or a string in quotes.
</p>

<div class="panel notice">
  <h3>zips_allowed is the kill switch</h3>
  <p>
    Setting it to <code>false</code> rejects any upload carrying assets and reduces the whole abuse
    surface to text. The hub keeps working: Star System Explorer guarantees a plain .json save
    still loads, and always will.
  </p>
</div>

<!-- The real thing, once each, so it can be seen working before anyone else sees it not. -->
<div class="panel">
  <h3>Try things</h3>
  <p class="muted">Each button does the real thing once.</p>
  <div class="tries">
    <form method="POST" action="?/testShare">
      <button type="submit">Post a test to the Discord sharing channel</button>
    </form>
    <form method="POST" action="?/testMail">
      <button type="submit">Send me a test email</button>
    </form>
    <form method="POST" action="?/refreshShipped">
      <button type="submit">Ask the engine what it ships</button>
    </form>
  </div>
  {#if form?.tested}<p class="ok">{form.tested}</p>{/if}
  <p class="muted foot">
    The test email's link comes back to <code>{data.resetRedirect}</code>. That exact URL has to be
    in Supabase's <strong>Authentication &rarr; URL Configuration &rarr; Redirect URLs</strong>, and
    the Site URL there should be this hub's address - otherwise the link lands on whatever the Site
    URL says. Sign-in itself is email and password through the API and needs neither.
  </p>
</div>

<!-- What the hub believes SSE ships, and how old that belief is (D-36). -->
<div class="panel">
  <h3>Shipped content</h3>
  <p class="muted">
    The hub reads what the app ships from <code>{data.shipped.url || 'nowhere - the row is empty'}</code>
    rather than keeping a copy, so a calendar the engine adds is not reported as somebody's custom one.
  </p>
  {#if data.shipped.appVersion}
    <p>
      Star System Explorer <strong>{data.shipped.appVersion}</strong>, fetched
      {data.shipped.fetched_at?.slice(0, 16).replace('T', ' ')} UTC.
      {#if data.shipped.error}<span class="bad-text">Last check failed: {data.shipped.error}</span>{/if}
    </p>
  {:else}
    <p class="bad-text">
      Never fetched{data.shipped.error ? ': ' + data.shipped.error : ''}. Until it is, the custom-calendar
      and custom-tag-category facets are skipped rather than guessed.
    </p>
  {/if}
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
          <form method="POST" action="?/set" class="inline">
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
  .panel h3 { margin: 0 0 6px; font-size: 0.98rem; }
  .muted { color: var(--ink-dim); margin: 0 0 10px; }
  .tries { display: flex; gap: 8px; flex-wrap: wrap; }
  .tries form { margin: 0; }
  .ok { color: var(--accent); margin: 10px 0 0; }
  .bad-text { color: var(--warn); }
  .foot { margin: 12px 0 0; font-size: 0.9rem; max-width: 78ch; }
  .inline { display: flex; gap: 6px; }
  input {
    font: inherit; background: var(--panel-2); color: var(--ink);
    border: 1px solid var(--edge); border-radius: 6px; padding: 4px 8px;
  }
  .note { color: var(--ink-dim); font-size: 0.88rem; max-width: 46ch; }
  .when { color: var(--ink-faint); font-size: 0.85rem; white-space: nowrap; }
</style>
