<script lang="ts">
  let { form } = $props();
</script>

<svelte:head>
  <title>Sign in - StarSystemX Creator Hub</title>
  <meta name="robots" content="noindex" />
</svelte:head>

<h1>Sign in</h1>
<p class="lede">
  You only need an account to share a map, heart one, or report a problem.
  <strong>Downloading never needs one.</strong>
</p>

{#if form?.message}
  <div class="panel notice bad"><p>{form.message}</p></div>
{/if}

<form class="panel" method="POST">
  <label>
    Email
    <input name="email" type="email" autocomplete="username" value={form?.email ?? ''} required />
  </label>
  <label>
    Password
    <input name="password" type="password" autocomplete="current-password" required />
  </label>
  <button class="primary" type="submit">Sign in</button>
</form>

<style>
  h1 { margin: 0 0 6px; }
  .lede { color: var(--ink-dim); margin: 0 0 20px; max-width: 56ch; }
  label { display: block; margin: 12px 0; color: var(--ink-dim); }
  input {
    display: block; width: 100%; max-width: 360px; margin-top: 4px; font: inherit;
    background: var(--panel-2); color: var(--ink);
    border: 1px solid var(--edge); border-radius: 8px; padding: 8px;
  }
</style>
