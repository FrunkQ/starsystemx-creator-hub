<script lang="ts">
  let { data, form } = $props();
</script>

<svelte:head><title>Comments</title><meta name="robots" content="noindex" /></svelte:head>

<h1>Comments</h1>
<p class="lede">
  {#if data.removed}
    Removed comments, newest first. Restore puts one back under its map, counted again.
  {:else}
    The latest comments across the hub, newest first. Remove takes one down in one click; it is
    kept, marked, counted out, and can be restored.
  {/if}
  <a href={data.removed ? '/admin/comments' : '/admin/comments?removed'}>
    {data.removed ? 'Show live comments' : 'Show removed comments'}
  </a>
</p>

{#if data.problem}
  <div class="panel notice bad">
    <p>{data.problem}</p>
    <p>If this is a fresh database, run <code>db/migrations/0021_comments.sql</code>.</p>
  </div>
{/if}
{#if form?.message}<p class="bad">{form.message}</p>{/if}

{#if !data.comments.length}
  <div class="panel"><p>Nothing here.</p></div>
{:else}
  <table>
    <thead><tr><th>When</th><th>Map</th><th>By</th><th>Comment</th>{#if data.removed}<th>Removed as</th>{/if}<th></th></tr></thead>
    <tbody>
      {#each data.comments as c (c.id)}
        <tr>
          <td class="when">{c.created_at.slice(0, 10)}</td>
          <td>{#if c.map}<a href="/s/{c.map.slug}#comments">{c.map.title}</a>{:else}-{/if}</td>
          <td>{#if c.handle}<a href="/admin/explorers/{c.handle}">{c.by}</a>{:else}{c.by}{/if}</td>
          <td class="text">{c.body}</td>
          {#if data.removed}<td class="when">{c.removed_reason ?? ''}</td>{/if}
          <td>
            <!-- The query string is kept so a restore lands back on the removed list. -->
            <form method="POST" action={data.removed ? '?removed&/restore' : '?/remove'}>
              <input type="hidden" name="id" value={c.id} />
              {#if data.removed}
                <button type="submit">Restore</button>
              {:else}
                <button class="danger" type="submit">Remove</button>
              {/if}
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
  .lede a { margin-left: 6px; }
  .bad { color: var(--bad); }
  .when { color: var(--ink-faint); white-space: nowrap; }
  .text { color: var(--ink-dim); max-width: 52ch; white-space: pre-wrap; overflow-wrap: anywhere; }
  td form { margin: 0; }
</style>
