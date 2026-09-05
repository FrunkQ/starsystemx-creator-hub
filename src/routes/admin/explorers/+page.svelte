<script lang="ts">
  let { data } = $props();
</script>

<svelte:head><title>Explorers</title><meta name="robots" content="noindex" /></svelte:head>

<h1>Explorers</h1>
<p class="lede">
  Everyone with an account, newest first. Open one to suspend or ban them, take a map down, remove
  everything they have said, or delete the account. The terms say we can; this is where we do.
</p>

{#if data.flash}
  <div class="panel notice" class:bad={!data.flash.signIn}>
    <h3>{data.flash.handle} is gone.</h3>
    <p>
      {data.flash.maps} {data.flash.maps === 1 ? 'map' : 'maps'} deleted, {data.flash.freed}
      {data.flash.freed === 1 ? 'picture' : 'pictures'} nobody else used freed from storage.
      {#if !data.flash.signIn}
        <strong>The sign-in could not be removed.</strong> Delete user <code>{data.flash.id}</code>
        in Supabase Auth by hand, or they can sign in again as a fresh account.
      {/if}
    </p>
  </div>
{/if}

<form class="search" method="GET">
  <input name="q" value={data.q} placeholder="handle" maxlength="40" />
  <button type="submit">Find</button>
  {#if data.q}<a href="/admin/explorers">Show everyone</a>{/if}
</form>

{#if !data.people.length}
  <div class="panel"><p>Nobody matches.</p></div>
{:else}
  <table>
    <thead><tr><th>Handle</th><th>Name</th><th>State</th><th>Joined</th><th>Maps</th><th>Comments</th></tr></thead>
    <tbody>
      {#each data.people as p (p.id)}
        <tr class:off={p.state !== 'active'}>
          <td><a href="/admin/explorers/{p.handle}">{p.handle}</a>{#if p.role === 'admin'} <span class="tag">admin</span>{/if}</td>
          <td>{p.display_name ?? ''}</td>
          <td>{p.state}</td>
          <td class="when">{p.created_at.slice(0, 10)}</td>
          <td>{p.maps.pub} public <span class="muted">of {p.maps.all}</span></td>
          <td>{p.comments}</td>
        </tr>
      {/each}
    </tbody>
  </table>
{/if}

<style>
  h1 { margin: 0 0 6px; }
  .lede { color: var(--ink-dim); margin: 0 0 18px; max-width: 70ch; }
  .search { display: flex; gap: 8px; align-items: center; margin: 0 0 16px; }
  .search input {
    font: inherit; background: var(--panel-2); color: var(--ink);
    border: 1px solid var(--edge); border-radius: 8px; padding: 7px 10px; width: min(100%, 240px);
  }
  .when { color: var(--ink-faint); white-space: nowrap; }
  .muted { color: var(--ink-faint); }
  tr.off td { color: var(--bad); }
  tr.off td a { color: var(--bad); }
</style>
