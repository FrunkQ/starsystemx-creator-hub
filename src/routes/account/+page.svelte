<script lang="ts">
  import Badge from '$lib/components/Badge.svelte';
  import { BADGE_IDS, CATALOGUE } from '$lib/badges';
  let { data, form } = $props();

  // The whole set is shown: earned in colour, the rest as dim shapes with how to get them.
  const earned = $derived(new Set(data.badges));

  // What has come back: stars and comments, accumulated across every map, like for like.
  const stars = $derived(data.systems.reduce((a, s) => a + (s.hearts_count ?? 0), 0));
  const comments = $derived(data.systems.reduce((a, s) => a + (s.comments_count ?? 0), 0));
</script>

<svelte:head><title>Your account</title><meta name="robots" content="noindex" /></svelte:head>

<h1>Your account</h1>
<p class="by">
  {data.me?.display_name ?? data.me?.handle}
  {#if data.me?.account_tier === 'pro'}<span class="tag">Pro</span>{/if}
</p>

{#if data.me && data.me.state !== 'active'}
  <!-- The terms: "we will usually say why, because that is decent." -->
  <div class="panel notice bad">
    <h3>Your account is {data.me.state}</h3>
    <p>
      {data.me.state_note ?? 'No reason was recorded.'} You can still read and download. You cannot
      upload, star, comment or report. If you think that is wrong, write to the address on the
      <a href="/takedown">takedown page</a>.
    </p>
  </div>
{/if}

<!-- The name on the byline, the card and the credit. A choice, not the handle by default. -->
<form class="panel name" method="POST" action="?/profile">
  <h2>Your name on maps</h2>
  <label>
    Display name
    <input name="display_name" value={data.me?.display_name ?? ''} maxlength="40" placeholder={data.me?.handle} />
  </label>
  <p class="muted">Shown as the cartographer on your maps and drawn onto their covers. Leave it empty to use your handle.</p>
  <button class="primary" type="submit">Save</button>
  {#if form?.saved}<span class="muted"> Saved, and your covers redrawn.</span>{/if}
  {#if form?.message}<span class="bad"> {form.message}</span>{/if}
</form>

<div class="panel">
  <h2>Your maps</h2>
  {#if !data.systems.length}
    <p class="muted">Nothing yet. <a href="/upload">Share a map</a>.</p>
  {:else}
    <p class="muted">
      {stars} {stars === 1 ? 'star' : 'stars'} and {comments} {comments === 1 ? 'comment' : 'comments'} across your maps.
    </p>
    <table>
      <thead><tr><th>Map</th><th>State</th><th>Stars</th><th>Comments</th><th>Downloads</th><th></th></tr></thead>
      <tbody>
        {#each data.systems as sys (sys.id)}
          <tr>
            <td>{sys.title}</td>
            <td>{sys.state}</td>
            <td>{sys.hearts_count}</td>
            <td>{#if sys.comments_count}<a href="/s/{sys.slug}#comments">{sys.comments_count}</a>{:else}0{/if}</td>
            <td>{sys.download_count}</td>
            <td><a href="/manage/{sys.id}">Manage</a></td>
          </tr>
        {/each}
      </tbody>
    </table>
  {/if}
</div>

<div class="panel">
  <h2>Badges</h2>
  <p class="muted">
    {earned.size} of {BADGE_IDS.length}. Earned by doing things, never handed out - and lost again
    if the thing goes away.
  </p>
  <ul class="gallery">
    {#each BADGE_IDS as id (id)}
      <li class:got={earned.has(id)}>
        <Badge badge={id} size={40} earned={earned.has(id)} />
        <div><b>{CATALOGUE[id].name}</b><span>{CATALOGUE[id].how}</span></div>
      </li>
    {/each}
  </ul>
</div>

<div class="panel">
  <h2>Connected apps</h2>
  {#if !data.tokens.length}
    <p class="muted">
      None. Star System Explorer can connect itself so you can publish without leaving the app.
    </p>
  {:else}
    <table>
      <thead><tr><th>App</th><th>Connected</th><th>Last used</th><th></th></tr></thead>
      <tbody>
        {#each data.tokens as t (t.id)}
          <tr>
            <td>{t.name}</td>
            <td>{t.created_at.slice(0, 10)}</td>
            <td>{t.last_used_at ? t.last_used_at.slice(0, 10) : 'never'}</td>
            <td>
              <form method="POST" action="?/revokeToken">
                <input type="hidden" name="id" value={t.id} />
                <button class="danger" type="submit">Disconnect</button>
              </form>
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  {/if}
</div>

<div class="panel">
  <h2>Linked accounts</h2>
  {#if !data.integrations.discord && !data.integrations.patreon}
    <p class="muted">
      Nothing to link yet. Discord and Patreon connections are built but switched off until the
      community server and page are set up.
    </p>
  {/if}

  {#if data.integrations.discord}
    {@const discord = data.identities.find((i) => i.provider === 'discord')}
    <p>
      <strong>Discord</strong> -
      {#if discord}
        linked as {discord.handle}. Community badges you earn here are given to you in the server.
      {:else}
        <a href="/api/link/discord/start">Link your Discord account</a> to get community badges in
        the server.
      {/if}
    </p>
  {/if}

  {#if data.integrations.patreon}
    {@const patreon = data.identities.find((i) => i.provider === 'patreon')}
    <p>
      <strong>Patreon</strong> -
      {#if patreon}linked as {patreon.handle}.{:else}not linked.{/if}
    </p>
  {/if}
</div>

{#if data.grants.length}
  <div class="panel">
    <h2>Why you have {data.me?.account_tier === 'pro' ? 'Pro' : 'your current tier'}</h2>
    <!-- Shown plainly because "why do I have this and when does it end" is the question people
         actually ask, and an answer they can read themselves is one fewer message to the owner. -->
    <ul>
      {#each data.grants as g}
        <li>
          {g.tier} via {g.source}
          {#if g.expires_at}- until {g.expires_at.slice(0, 10)}{:else}- no end date{/if}
        </li>
      {/each}
    </ul>
  </div>
{/if}

<!-- The other half of "your stuff stays yours": the way to take it all back. -->
<form class="panel danger-zone" method="POST" action="?/delete">
  <h2>Delete your account</h2>
  <p class="muted">
    Your maps go, your sign-in goes, and any picture nobody else uses is freed from storage. It
    cannot be undone. Your comments are your call:
  </p>
  <label><input type="radio" name="comments" value="keep" checked /> Keep them, shown as a former explorer's</label>
  <label><input type="radio" name="comments" value="remove" /> Delete them too</label>
  <label class="confirm">Type <code>{data.me?.handle}</code> to confirm <input name="confirm" autocomplete="off" /></label>
  <button class="danger" type="submit">Delete my account</button>
  {#if form?.deleteMessage}<span class="bad"> {form.deleteMessage}</span>{/if}
</form>

<style>
  h1 { margin: 0 0 4px; }
  .by { margin: 0 0 20px; color: var(--ink-faint); }
  h2 { margin: 0 0 10px; font-size: 1.1rem; }
  .muted { color: var(--ink-dim); }
  .bad { color: var(--bad); }
  .name label { display: block; margin: 8px 0; color: var(--ink-dim); }
  .name input {
    display: block; width: min(100%, 320px); margin-top: 4px; font: inherit;
    background: var(--panel-2); color: var(--ink); border: 1px solid var(--edge); border-radius: 8px; padding: 8px;
  }
  .name p { margin: 6px 0 10px; max-width: 62ch; }
  ul { margin: 0; padding-left: 18px; }
  .gallery { list-style: none; padding: 0; margin: 12px 0 0; display: grid; gap: 10px 18px; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); }
  .gallery li { display: flex; gap: 12px; align-items: center; color: var(--ink-faint); }
  .gallery li.got { color: var(--ink); }
  .gallery li div { display: flex; flex-direction: column; line-height: 1.3; }
  .gallery li b { font-weight: 600; }
  .gallery li span { font-size: 0.85rem; color: var(--ink-faint); }
  .danger-zone { border-color: var(--bad); }
  .danger-zone label { display: block; margin: 6px 0; color: var(--ink-dim); }
  .danger-zone .confirm input {
    display: block; width: min(100%, 320px); margin-top: 4px; font: inherit;
    background: var(--panel-2); color: var(--ink); border: 1px solid var(--edge); border-radius: 8px; padding: 8px;
  }
  .danger-zone code { background: var(--panel-2); border: 1px solid var(--edge); border-radius: 4px; padding: 1px 5px; }
</style>
