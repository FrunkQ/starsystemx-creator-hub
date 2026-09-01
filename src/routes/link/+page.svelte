<script lang="ts">
  let { data, form } = $props();
</script>

<svelte:head><title>Connect Star System Explorer</title><meta name="robots" content="noindex" /></svelte:head>

{#if form?.approved}
  <h1>Connected</h1>
  <div class="panel">
    <p>
      Star System Explorer can now publish maps to your account. Go back to the app — it will pick
      this up within a few seconds.
    </p>
    <p class="muted">
      You can disconnect it at any time from <a href="/account">your account</a>.
    </p>
  </div>
{:else}
  <h1>Connect Star System Explorer</h1>
  <p class="lede">
    Star System Explorer is asking to publish maps to your account. Type the code it is showing you.
  </p>

  {#if form?.message}
    <div class="panel notice bad"><p>{form.message}</p></div>
  {/if}

  {#if data.pending}
    <div class="panel notice">
      <h3>Waiting to connect</h3>
      <p>
        {data.pending.client}{#if data.pending.client_version} {data.pending.client_version}{/if},
        asked at {new Date(data.pending.created_at).toLocaleTimeString()}.
      </p>
    </div>
  {/if}

  <form class="panel" method="POST">
    <label>
      The code
      <input name="code" value={data.prefill} placeholder="WXYZ-1234" maxlength="12"
             autocomplete="off" autocapitalize="characters" spellcheck="false" />
    </label>

    <div class="what">
      <h3>What you are allowing</h3>
      <ul>
        <li>Publishing and updating maps as you</li>
        <li>Reading your own maps back</li>
      </ul>
      <h3>What you are not</h3>
      <ul>
        <li>Changing your email or password</li>
        <li>Anything at all if you disconnect it</li>
      </ul>
    </div>

    <button class="primary" type="submit">Connect it</button>
  </form>

  <p class="muted">
    Did not expect this? <strong>Do not enter a code somebody sent you.</strong> A code only ever
    comes from Star System Explorer running on your own machine.
  </p>
{/if}

<style>
  h1 { margin: 0 0 6px; }
  h3 { margin: 14px 0 4px; font-size: 0.95rem; }
  .lede { color: var(--ink-dim); margin: 0 0 18px; max-width: 56ch; }
  .muted { color: var(--ink-dim); max-width: 60ch; }
  label { display: block; margin: 4px 0 12px; color: var(--ink-dim); }
  input {
    display: block; width: 100%; max-width: 260px; margin-top: 4px;
    font: 1.3rem ui-monospace, Consolas, monospace; letter-spacing: 0.12em; text-transform: uppercase;
    background: var(--panel-2); color: var(--ink);
    border: 1px solid var(--edge); border-radius: 8px; padding: 10px;
  }
  .what { margin: 8px 0 16px; }
  .what ul { margin: 0; padding-left: 20px; color: var(--ink-dim); }
</style>
