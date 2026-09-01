<script lang="ts">
  let { data } = $props();

  const BADGE_LABEL: Record<string, string> = {
    cartographer: 'Cartographer - charted something and shared it',
    featured: 'Featured - a map people loved'
  };
</script>

<svelte:head><title>Your account</title><meta name="robots" content="noindex" /></svelte:head>

<h1>Your account</h1>
<p class="by">
  {data.me?.display_name ?? data.me?.handle}
  {#if data.me?.account_tier === 'pro'}<span class="tag">Pro</span>{/if}
</p>

<div class="panel">
  <h2>Your maps</h2>
  {#if !data.systems.length}
    <p class="muted">Nothing yet. <a href="/upload">Share a map</a>.</p>
  {:else}
    <table>
      <thead><tr><th>Map</th><th>State</th><th>Hearts</th><th>Downloads</th><th></th></tr></thead>
      <tbody>
        {#each data.systems as sys (sys.id)}
          <tr>
            <td>{sys.title}</td>
            <td>{sys.state}</td>
            <td>{sys.hearts_count}</td>
            <td>{sys.download_count}</td>
            <td><a href="/manage/{sys.id}">Manage</a></td>
          </tr>
        {/each}
      </tbody>
    </table>
  {/if}
</div>

{#if data.badges.length}
  <div class="panel">
    <h2>Badges</h2>
    <ul class="badges">
      {#each data.badges as badge}
        <li><span class="tag">{BADGE_LABEL[badge] ?? badge}</span></li>
      {/each}
    </ul>
  </div>
{/if}

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

<style>
  h1 { margin: 0 0 4px; }
  .by { margin: 0 0 20px; color: var(--ink-faint); }
  h2 { margin: 0 0 10px; font-size: 1.1rem; }
  .muted { color: var(--ink-dim); }
  .badges { list-style: none; padding: 0; margin: 0; display: flex; gap: 8px; flex-wrap: wrap; }
  ul { margin: 0; padding-left: 18px; }
  .badges { padding-left: 0; }
</style>
