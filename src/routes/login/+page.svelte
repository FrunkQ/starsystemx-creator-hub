<script lang="ts">
  import { page } from '$app/state';
  let { data, form } = $props();
  // Where the confirmation link lands (D-66). Somebody who has just clicked it needs telling that
  // the click worked, or the sign-in form reads as though nothing happened.
  const justJoined = $derived(page.url.searchParams.get('joined') === '1');
  const justReset = $derived(page.url.searchParams.get('reset') === '1');
</script>

<svelte:head>
  <title>Sign in - {data.site.name}</title>
  <meta name="robots" content="noindex" />
</svelte:head>

<h1>Sign in</h1>
<p class="lede">
  You only need an account to share a map, star one, or report a problem.
  <strong>Downloading never needs one.</strong>
</p>

{#if justJoined && !form?.message}
  <div class="panel notice">
    <h3>That is your email confirmed</h3>
    <p>Sign in below and you are away. <a href="/upload">Share a map</a> whenever you like.</p>
  </div>
{/if}

{#if justReset && !form?.message}
  <div class="panel notice"><p>Password changed. Sign in with the new one.</p></div>
{/if}

{#if form?.message}
  <!-- THE WAY OUT SITS WITH THE REFUSAL (owner, 2026-09-07: "no reset password option on failure
       to log in - perhaps a reset option after 'That email and password do not match an account'").
       The same rule as the publish button: a control that will not do the thing says so, and says
       what to do instead, where the person is looking. -->
  <div class="panel notice bad">
    <p>{form.message}</p>
    <p><a href="/reset">Forgotten your password?</a> We will email you a link to set a new one.</p>
  </div>
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

<p class="muted">
  <a href="/reset">Forgotten your password?</a>
</p>
<p class="muted">No account? <a href="/join">Join</a> - it takes a minute and downloading never needs one.</p>

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
