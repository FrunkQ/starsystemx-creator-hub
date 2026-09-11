<script lang="ts">
  import { enhance } from '$app/forms';
  import type { SubmitFunction } from '@sveltejs/kit';
  let { data } = $props();

  /** The row being saved, so its box cannot be flicked twice before the first answer lands. */
  let saving = $state<string | null>(null);
  /** A refusal, shown on the row it belongs to rather than at the top of a long table. */
  let refused = $state<{ id: string; message: string } | null>(null);

  // A TICK SAVES AT ONCE (D-82) - no Save button per row. And if the save fails the box goes BACK:
  // the database did not change, and a box left showing a change that did not happen is the exact
  // fault this change fixed on the explorer's own page.
  const saveTrust = (id: string): SubmitFunction => ({ formElement }) => {
    saving = id;
    refused = null;
    return async ({ result, update }) => {
      if (result.type !== 'success') {
        const box = formElement.elements.namedItem('trusted') as HTMLInputElement | null;
        if (box) box.checked = !box.checked;
        const said = result.type === 'failure' ? result.data?.message : null;
        refused = { id, message: typeof said === 'string' ? said : 'Could not save.' };
      }
      await update({ reset: false });
      saving = null;
    };
  };
</script>

<svelte:head><title>Explorers</title><meta name="robots" content="noindex" /></svelte:head>

<h1>Explorers</h1>
<p class="lede">
  Everyone with an account, newest first. Open one to suspend or ban them, take a map down, remove
  everything they have said, or delete the account. The terms say we can; this is where we do.
</p>
<p class="lede">
  <strong>Trusted</strong> saves as soon as you tick it: their pictures go out on arrival, still
  appear in the review queue marked as pre-approved, and they get the roomier daily allowance.
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
    <thead><tr>
      <th>Handle</th><th>Name</th>
      {#if data.showEmails}<th>Email</th>{/if}
      <th>State</th>
      <th title="Pictures approved on arrival, still shown in the review queue">Trusted</th>
      <th>Joined</th><th>Maps</th><th>Comments</th>
    </tr></thead>
    <tbody>
      {#each data.people as p (p.id)}
        <!-- RED IS FOR AN ACCOUNT SOMEBODY ACTED ON, and `pending` arrived after this line was
             written (D-67): a brand-new member who has not clicked their link yet was being painted
             the same colour as a banned one. Pending is quiet, not alarming. -->
        <tr class:off={p.state === 'suspended' || p.state === 'banned'} class:waiting={p.state === 'pending'}>
          <td>
            <a href="/admin/explorers/{p.handle}">{p.handle}</a>
            <!-- BOTH STAFF ROLES, not just admin. This said `admin` only, so a moderator was
                 indistinguishable from an ordinary explorer on the one page you would look at to
                 find out who has the role (owner, 2026-09-07). -->
            {#if p.role !== 'user'}
              <span class="role" class:mod={p.role === 'moderator'}>{p.role}</span>
            {/if}
          </td>
          <td>{p.display_name ?? ''}</td>
          {#if data.showEmails}
            <!-- The address, and whether it has been answered. Marked rather than merely shown:
                 an unconfirmed address is the difference between a real person and a typo. -->
            <td class="email">
              {#if p.email}
                {p.email}
                {#if !p.confirmed}<span class="tag warn">unconfirmed</span>{/if}
              {:else}
                <span class="muted">not found</span>
              {/if}
            </td>
          {/if}
          <td>
            {p.state}
            {#if p.state === 'pending'}<span class="muted small">email not confirmed</span>{/if}
          </td>
          <td class="trust">
            <form method="POST" action="?/trust" use:enhance={saveTrust(p.id)}>
              <input type="hidden" name="id" value={p.id} />
              <!-- Your own row shows your own answer but cannot change it (D-78: not on yourself). -->
              <input type="checkbox" name="trusted" checked={p.trusted}
                     disabled={p.id === data.me || saving === p.id}
                     aria-label="Trust {p.handle}"
                     title={p.id === data.me ? 'Not on yourself' : ''}
                     onchange={(e) => e.currentTarget.form?.requestSubmit()} />
            </form>
            {#if refused?.id === p.id}<span class="tag warn">{refused.message}</span>{/if}
          </td>
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
  .lede:has(+ .lede) { margin-bottom: 8px; }
  .search { display: flex; gap: 8px; align-items: center; margin: 0 0 16px; }
  .search input {
    font: inherit; background: var(--panel-2); color: var(--ink);
    border: 1px solid var(--edge); border-radius: 8px; padding: 7px 10px; width: min(100%, 240px);
  }
  .when { color: var(--ink-faint); white-space: nowrap; }
  .muted { color: var(--ink-faint); }
  tr.off td { color: var(--bad); }
  tr.waiting td { color: var(--ink-faint); }
  tr.off td a { color: var(--bad); }
  /* An address is long and the column it sits in is not the point of the page. */
  .email { font-size: 0.85rem; word-break: break-all; max-width: 22ch; }
  .tag.warn { border-color: var(--warn); color: var(--warn); margin-left: 4px; }
  /* THE SAME TWO COLOURS AS THE BANNER (app.css `header .role`): admin amber, moderator blue.
     A role badge that reads differently here from the one over somebody's own name is a small way
     to make people doubt both of them. */
  .role {
    font-size: 0.68rem; text-transform: uppercase; letter-spacing: 0.07em; font-weight: 700;
    padding: 1px 6px; border-radius: 999px; margin-left: 6px;
    background: var(--warn); color: var(--accent-ink); border: 0;
  }
  .role.mod { background: var(--accent); }
  .small { font-size: 0.82rem; display: block; }
  .trust { text-align: center; }
  .trust form { display: inline; margin: 0; }
  .trust input[type='checkbox'] { width: 1.05rem; height: 1.05rem; cursor: pointer; accent-color: var(--accent); }
  .trust input[type='checkbox']:disabled { cursor: default; }
  .trust .tag { display: block; margin: 4px 0 0; white-space: nowrap; }
</style>
