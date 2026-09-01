<script lang="ts">
  import { formatBytes } from '$lib/bundle/facets';
  let { data, form } = $props();

  const ageDays = (iso: string) => Math.floor((Date.now() - Date.parse(iso)) / 86400000);
</script>

<svelte:head><title>Debug uploads</title><meta name="robots" content="noindex" /></svelte:head>

<h1>Debug uploads</h1>
<p class="lede">
  One-shot links for collecting a broken save from someone. These bypass every check the hub
  normally applies — no account, no attestation, no review — because the file worth diagnosing is
  usually the one that cannot pass them.
</p>

{#if form?.created}
  <div class="panel notice">
    <h3>Send them this link</h3>
    <p class="link"><code>{form.token}</code></p>
    <p class="muted">
      The full link is this site's address followed by <code>/debug/</code> and that token.
    </p>
    <p>
      It works <strong>once</strong>, and expires {new Date(form.expiresAt).toLocaleString()}.
      <strong>Copy it now</strong> — only its fingerprint is stored, so it cannot be shown again.
    </p>
  </div>
{/if}

<form class="panel" method="POST" action="?/create">
  <h2>New link</h2>
  <label>
    What is it for? <span class="opt">so a stale link is recognisable a week later</span>
    <input name="note" maxlength="200" placeholder="Sam's crash loading the Hystrine map" />
  </label>
  <button class="primary" type="submit">Create a one-shot link</button>
</form>

<div class="panel">
  <h2>Received</h2>
  <p class="muted">
    These are unredacted campaigns sent in confidence — GM notes, hidden systems and all. Kept for
    {data.retentionDays} days; delete them once the bug is found.
  </p>
  {#if !data.uploads.length}
    <p class="muted">Nothing yet.</p>
  {:else}
    <table>
      <thead><tr><th>File</th><th>Size</th><th>Age</th><th>What they said</th><th></th></tr></thead>
      <tbody>
        {#each data.uploads as u (u.id)}
          <tr class:stale={ageDays(u.uploaded_at) > data.retentionDays}>
            <td><a href="/admin/debug/{u.id}">{u.filename}</a></td>
            <td>{formatBytes(u.byte_size)}</td>
            <td>{ageDays(u.uploaded_at)}d</td>
            <td class="note">{u.user_note ?? ''}</td>
            <td>
              <form method="POST" action="?/remove">
                <input type="hidden" name="id" value={u.id} />
                <button class="danger" type="submit">Delete</button>
              </form>
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  {/if}
</div>

<div class="panel">
  <h2>Links</h2>
  {#if !data.invites.length}
    <p class="muted">None yet.</p>
  {:else}
    <table>
      <thead><tr><th>For</th><th>Created</th><th>State</th></tr></thead>
      <tbody>
        {#each data.invites as i (i.id)}
          <tr>
            <td>{i.note ?? '—'}</td>
            <td class="when">{i.created_at.slice(0, 10)}</td>
            <td>
              {#if i.used_at}used
              {:else if Date.parse(i.expires_at) < Date.now()}expired
              {:else}<strong>waiting</strong>{/if}
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  {/if}
</div>

<style>
  h1 { margin: 0 0 6px; }
  h2 { margin: 0 0 10px; font-size: 1.05rem; }
  .lede, .muted { color: var(--ink-dim); max-width: 68ch; }
  .lede { margin: 0 0 18px; }
  .muted { margin: 0 0 12px; }
  label { display: block; margin: 12px 0; color: var(--ink-dim); }
  .opt { color: var(--ink-faint); font-size: 0.85rem; }
  input[name] {
    display: block; width: 100%; max-width: 480px; margin-top: 4px; font: inherit;
    background: var(--panel-2); color: var(--ink);
    border: 1px solid var(--edge); border-radius: 8px; padding: 8px;
  }
  .link code {
    word-break: break-all; background: var(--panel-2); border: 1px solid var(--edge);
    border-radius: 6px; padding: 4px 8px; display: inline-block; color: var(--ink);
  }
  .note { color: var(--ink-dim); max-width: 40ch; }
  .when { color: var(--ink-faint); white-space: nowrap; }
  tr.stale td { color: var(--warn); }
  td form { margin: 0; }
</style>
