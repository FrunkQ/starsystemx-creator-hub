<script lang="ts">
  import Badge from '$lib/components/Badge.svelte';
  let { data, form } = $props();
  const p = $derived(data.person);
</script>

<svelte:head><title>{p.handle} - explorer</title><meta name="robots" content="noindex" /></svelte:head>

<p class="crumb"><a href="/admin/explorers">Explorers</a></p>
<h1>
  {p.handle}
  {#if p.display_name}<span class="muted">· {p.display_name}</span>{/if}
  {#if p.role !== 'user'}<span class="role" class:mod={p.role === 'moderator'}>{p.role}</span>{/if}
  {#if p.role === 'moderator'}<span class="tag mod">moderator</span>{/if}
  {#if p.account_tier === 'pro'}<span class="tag">Pro</span>{/if}
</h1>
<p class="by">
  Joined {p.created_at.slice(0, 10)} ·
  <span class:bad={p.state !== 'active'}>{p.state}</span>{#if p.state_note}: {p.state_note}{/if}
  {#if data.badges.length}
    · {#each data.badges as b (b)}<Badge badge={b} size={20} />{/each}
  {/if}
</p>

{#if form?.done}<div class="panel notice"><p>{form.done}</p></div>{/if}
{#if form?.message}<div class="panel notice bad"><p>{form.message}</p></div>{/if}

<div class="two">
  <form class="panel" method="POST" action="?/state">
    <h2>Account</h2>
    <p class="muted">
      A suspended or banned account can still sign in and read. It cannot upload, star, comment or
      report. Their maps stay up unless taken down below - a ban is about the person, a takedown
      about the thing.
    </p>
    <label><input type="radio" name="state" value="active" checked={p.state === 'active'} /> Active</label>
    <label><input type="radio" name="state" value="suspended" checked={p.state === 'suspended'} /> Suspended</label>
    <label><input type="radio" name="state" value="banned" checked={p.state === 'banned'} /> Banned</label>
    <label class="note">Why, in words they will read <input name="note" maxlength="500" value={p.state_note ?? ''} /></label>
    <button class="primary" type="submit" disabled={data.self}>Save</button>
    {#if data.self}<span class="muted"> Not on yourself.</span>{/if}
  </form>

  <form class="panel" method="POST" action="?/removeComments">
    <h2>Everything they have said</h2>
    <p class="muted">
      Takes down every live comment by this explorer at once. Kept and marked, like any removal,
      and each can be restored from the comments page.
    </p>
    <label class="note">Why <input name="note" maxlength="500" /></label>
    <button class="danger" type="submit">Remove all their comments</button>
  </form>
</div>

<h2>Maps</h2>
{#if !data.maps.length}
  <p class="muted">None.</p>
{:else}
  <table>
    <thead><tr><th>Map</th><th>Kind</th><th>State</th><th>Stars</th><th>Comments</th><th>Downloads</th><th></th></tr></thead>
    <tbody>
      {#each data.maps as m (m.id)}
        <tr class:off={m.state === 'removed'}>
          <td>{#if m.state === 'public'}<a href="/s/{m.slug}">{m.title}</a>{:else}{m.title}{/if}</td>
          <td>{m.kind}</td>
          <td>{m.state}{#if m.state_note} <span class="muted">· {m.state_note}</span>{/if}</td>
          <td>{m.stars}</td><td>{m.comments}</td><td>{m.downloads}</td>
          <td>
            {#if m.state === 'removed'}
              <form method="POST" action="?/restore">
                <input type="hidden" name="id" value={m.id} />
                <button type="submit">Restore</button>
              </form>
            {:else}
              <form class="row" method="POST" action="?/takedown">
                <input type="hidden" name="id" value={m.id} />
                <input name="note" placeholder="why" maxlength="500" />
                <button class="danger" type="submit">Take down</button>
              </form>
            {/if}
          </td>
        </tr>
      {/each}
    </tbody>
  </table>
{/if}

{#if data.reports.length}
  <h2>Reports about their maps</h2>
  <table>
    <thead><tr><th>When</th><th>Map</th><th>Reason</th><th>State</th></tr></thead>
    <tbody>
      {#each data.reports as r (r.id)}
        <tr><td class="when">{r.created_at.slice(0, 10)}</td><td>{r.map ?? '-'}</td><td><span class="tag">{r.reason}</span></td><td>{r.state}</td></tr>
      {/each}
    </tbody>
  </table>
{/if}

<h2>Comments</h2>
{#if !data.comments.length}
  <p class="muted">None.</p>
{:else}
  <table>
    <thead><tr><th>When</th><th>Under</th><th>Comment</th><th></th></tr></thead>
    <tbody>
      {#each data.comments as c (c.id)}
        <tr class:off={!!c.removed_at}>
          <td class="when">{c.created_at.slice(0, 10)}</td>
          <td>{#if c.map}<a href="/s/{c.map.slug}#comments">{c.map.title}</a>{:else}-{/if}</td>
          <td class="text">{c.body}{#if c.removed_at} <span class="muted">· removed ({c.removed_reason})</span>{/if}</td>
          <td>
            {#if !c.removed_at}
              <form method="POST" action="?/removeComment">
                <input type="hidden" name="id" value={c.id} />
                <button class="danger" type="submit">Remove</button>
              </form>
            {/if}
          </td>
        </tr>
      {/each}
    </tbody>
  </table>
{/if}

{#if data.owner}
  <!-- WHO IS STAFF is the owner's alone (D-39): a moderator can reach this page and do everything
       on it that can be undone, but not decide who else gets to. -->
  <form class="panel" method="POST" action="?/role">
    <h2>Role</h2>
    <p class="muted">
      A moderator gets the moderation work - tags, pictures, comments, reports and this page - and
      none of the running of the place: no config, no usage, no backups, no debug uploads. They
      cannot delete an account or hand out this role.
    </p>
    {#if p.role === 'admin'}
      <p class="muted">This account is an admin. That is changed in the database, deliberately.</p>
    {:else}
      <label><input type="radio" name="role" value="user" checked={p.role !== 'moderator'} /> Explorer</label>
      <label><input type="radio" name="role" value="moderator" checked={p.role === 'moderator'} /> Moderator</label>
      <button class="primary" type="submit" disabled={data.self}>Save</button>
      {#if data.self}<span class="muted"> Not on yourself.</span>{/if}
    {/if}
  </form>

  <!-- A PENDING ACCOUNT (D-80). Only shown when there is one, because a panel about confirmation
       on every explorer's page is a panel nobody reads. -->
  {#if p.state === 'pending'}
    <div class="panel notice">
      <h2>Waiting on their email</h2>
      <p class="muted">
        They joined but have not clicked the confirmation link, so they can look around and download
        but not share, star or comment. They can send themselves another from their own account page.
      </p>
      <div class="tries">
        <form method="POST" action="?/pending">
          <input type="hidden" name="what" value="resend" />
          <button type="submit">Send the confirmation again</button>
        </form>
        <form method="POST" action="?/pending">
          <input type="hidden" name="what" value="confirm" />
          <button class="primary" type="submit">Confirm it for them</button>
        </form>
      </div>
      <p class="muted small">
        Confirming for them is a decision, not a shortcut - it says you are satisfied they own that
        address on some other evidence. It is recorded against your name.
      </p>
    </div>
  {/if}

  <!-- TRUST (D-78). A MODERATOR'S to give, unlike the role above, because it can be undone
       completely: untrusting takes effect on the next upload, and every picture that went out on
       trust is still in the queue and still one click from being withdrawn. -->
  <form class="panel" method="POST" action="?/trust">
    <h2>Trust</h2>
    <p class="muted">
      A trusted explorer's pictures are approved <strong>on arrival</strong> instead of waiting for
      review - so adding a screenshot and using it happen in one go. They still appear in the review
      queue marked as pre-approved, and withdrawing one takes it off every map at once, exactly as
      it always did. They also get the roomier daily upload allowance.
    </p>
    <label class="check">
      <input type="checkbox" name="trusted" checked={(p as { trusted?: boolean }).trusted === true} />
      Trust this explorer
    </label>
    <label>Note (optional) <input name="note" maxlength="500" placeholder="Why" /></label>
    <button class="primary" type="submit" disabled={data.self}>Save</button>
    {#if data.self}<span class="muted"> Not on yourself.</span>{/if}
  </form>

  <form class="panel danger-zone" method="POST" action="?/delete">
    <h2>Delete this account</h2>
    <p class="muted">
      Their maps and everything under them go, their sign-in goes, and any picture nobody else uses is
      freed from storage. A banned picture stays banned. This cannot be undone.
    </p>
    <label><input type="radio" name="comments" value="keep" checked /> Keep their comments, shown as a former explorer's</label>
    <label><input type="radio" name="comments" value="remove" /> Delete their comments too</label>
    <label class="note">Why <input name="note" maxlength="500" /></label>
    <label class="note">Type <code>{p.handle}</code> to confirm <input name="confirm" autocomplete="off" /></label>
    <button class="danger" type="submit" disabled={data.self}>Delete {p.handle}</button>
  </form>
{/if}

<style>
  .crumb { margin: 0 0 4px; }
  h1 { margin: 0 0 4px; display: flex; gap: 10px; align-items: baseline; flex-wrap: wrap; }
  h2 { margin: 28px 0 8px; font-size: 1.1rem; }
  .panel h2 { margin: 0 0 8px; }
  .by { margin: 0 0 16px; color: var(--ink-faint); display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
  .muted { color: var(--ink-dim); }
  .bad { color: var(--bad); }
  .two { display: grid; gap: 16px; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); }
  .two .panel { margin: 0; }
  label { display: block; margin: 6px 0; color: var(--ink-dim); }
  label.note input, .row input {
    display: block; width: min(100%, 420px); margin-top: 4px; font: inherit;
    background: var(--panel-2); color: var(--ink); border: 1px solid var(--edge); border-radius: 8px; padding: 6px 8px;
  }
  .row { display: flex; gap: 6px; align-items: center; margin: 0; }
  .row input { display: inline-block; width: 160px; margin: 0; }
  td form { margin: 0; }
  .when { color: var(--ink-faint); white-space: nowrap; }
  .text { color: var(--ink-dim); max-width: 48ch; white-space: pre-wrap; overflow-wrap: anywhere; }
  tr.off td { color: var(--ink-faint); }
  .danger-zone { border-color: var(--bad); margin-top: 32px; }
  .tag.mod { background: var(--accent); color: var(--accent-ink); }
  code { background: var(--panel-2); border: 1px solid var(--edge); border-radius: 4px; padding: 1px 5px; }
  /* THE SAME TWO COLOURS AS THE BANNER (app.css `header .role`): admin amber, moderator blue.
     A role badge that reads differently here from the one over somebody's own name is a small way
     to make people doubt both of them. */
  .role {
    font-size: 0.68rem; text-transform: uppercase; letter-spacing: 0.07em; font-weight: 700;
    padding: 1px 6px; border-radius: 999px; margin-left: 6px;
    background: var(--warn); color: var(--accent-ink); border: 0;
  }
  .role.mod { background: var(--accent); }
  .tries { display: flex; flex-wrap: wrap; gap: 10px; margin: 10px 0 0; }
  .small { font-size: 0.85rem; }
</style>
