<script lang="ts">
  // Asking for a reset link (D-68). Deliberately plain: one field, one button, one answer.
  let { form } = $props();
</script>

<svelte:head>
  <title>Reset your password - StarSystemX Explorers</title>
  <meta name="robots" content="noindex" />
</svelte:head>

<h1>Reset your password</h1>

{#if form?.asked}
  <div class="panel notice">
    <h3>Check your email</h3>
    <p>
      If that address has an account here, a link is on its way. It lets you set a new password and
      signs you in. Worth a look in your spam folder if it does not appear in a minute.
    </p>
  </div>
{:else}
  <p class="lede">
    Give us the address you signed up with and we will send you a link to set a new one.
  </p>
  <form class="panel" method="POST">
    {#if form?.message}<p class="bad">{form.message}</p>{/if}
    <label>
      Email
      <input name="email" type="email" value={form?.email ?? ''} autocomplete="email" required />
    </label>
    <button class="primary" type="submit">Send me a link</button>
  </form>
{/if}

<p class="muted"><a href="/login">Back to signing in</a></p>

<style>
  h1 { margin: 0 0 6px; }
  .lede { color: var(--ink-dim); margin: 0 0 16px; max-width: 56ch; }
  form { max-width: 420px; }
  label { display: block; margin: 12px 0; color: var(--ink-dim); }
  input {
    display: block; width: 100%; margin-top: 4px; font: inherit;
    background: var(--panel-2); color: var(--ink);
    border: 1px solid var(--edge); border-radius: 8px; padding: 10px 12px;
  }
  .bad { color: var(--bad); margin: 0 0 8px; }
</style>
