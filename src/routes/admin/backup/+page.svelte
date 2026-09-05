<script lang="ts">
  import { formatBytes } from '$lib/bundle/facets';
  let { data, form } = $props();
</script>

<svelte:head><title>Backups</title><meta name="robots" content="noindex" /></svelte:head>

<h1>Backups</h1>
<p class="lede">
  A gzipped copy of every table, written to the bundles bucket. The last {data.keep} are kept.
  The pictures and bundles are not in it - they are content-addressed objects in the same buckets
  and the backup names which ones matter. Secrets are never written.
</p>

<form method="POST" action="?/run">
  <button class="primary" type="submit">Back up now</button>
  {#if form?.report}
    <span class="muted"> Written {form.report.key.slice(8)} ({formatBytes(form.report.bytes)}).
      {#if form.report.problems.length}<span class="bad">Problems: {form.report.problems.join('; ')}</span>{/if}
    </span>
  {/if}
  {#if form?.message}<span class="bad"> {form.message}</span>{/if}
</form>

<div class="panel notice">
  <h3>On a schedule</h3>
  <p>
    A Worker has no clock of its own. Point any scheduler (cron-job.org, a GitHub Action, a
    Cloudflare Cron Trigger on a tiny worker) at
    <code>POST /api/admin/backup</code> with the header <code>x-cron-key: &lt;CRON_SECRET&gt;</code>,
    weekly. {#if data.hasCronKey}The secret is set.{:else}<strong>CRON_SECRET is not set yet</strong> - set it with <code>wrangler secret put CRON_SECRET</code>.{/if}
    The same key drains the outbox at <code>POST /api/admin/outbox</code>.
  </p>
</div>

{#if !data.backups.length}
  <div class="panel"><p>None yet.</p></div>
{:else}
  <table>
    <thead><tr><th>Taken</th><th>Size</th><th></th></tr></thead>
    <tbody>
      {#each data.backups as b (b.key)}
        <tr>
          <td>{b.uploaded.slice(0, 16).replace('T', ' ')}</td>
          <td>{formatBytes(b.size)}</td>
          <td><a href="/api/admin/backup/{b.key.slice(8)}" data-sveltekit-reload>Download</a></td>
        </tr>
      {/each}
    </tbody>
  </table>
{/if}

<style>
  h1 { margin: 0 0 6px; }
  .lede { color: var(--ink-dim); margin: 0 0 18px; max-width: 70ch; }
  form { margin: 0 0 16px; }
  .muted { color: var(--ink-dim); }
  .bad { color: var(--bad); }
  code { background: var(--panel-2); border: 1px solid var(--edge); border-radius: 4px; padding: 1px 5px; font-size: 0.85em; }
</style>
