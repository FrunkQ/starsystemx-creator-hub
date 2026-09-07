<script lang="ts">
  // SETTING THE NEW PASSWORD (D-68). The only page in the hub that talks to Supabase from a browser.
  //
  // WHY IT HAS TO: the recovery token is in the URL FRAGMENT, and a fragment is never sent to a
  // server. So this cannot be a form action, and the sign-in cookie the rest of the hub runs on
  // cannot be set until the token has been read here.
  //
  // WHAT IT DOES, in order: let the Supabase client read the fragment, take the new password, call
  // `updateUser`, then hand the resulting session BACK to the hub so the normal server-side cookie
  // is set and every other page works the way it always has. One page borrows the browser flow; the
  // hub keeps its own session model.
  import { onMount } from 'svelte';
  import { createClient, type SupabaseClient } from '@supabase/supabase-js';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();

  let ready = $state(false);
  let problem = $state<string | null>(null);
  let password = $state('');
  let again = $state('');
  let busy = $state(false);
  let client: SupabaseClient | null = null;

  const mismatch = $derived(again.length > 0 && password !== again);
  const tooShort = $derived(password.length > 0 && password.length < 8);

  onMount(async () => {
    client = createClient(data.supabaseUrl, data.publishableKey, {
      // `detectSessionInUrl` is what reads the fragment. `implicit` matches how the link was asked
      // for (`linkClient` in server/db.ts) - a PKCE link would need a verifier this browser never
      // had, because the Worker that asked for the link is not the thing opening it.
      auth: { detectSessionInUrl: true, persistSession: false, flowType: 'implicit' }
    });
    const { data: session } = await client.auth.getSession();
    if (session.session) {
      ready = true;
      return;
    }
    // A LINK THAT DID NOT WORK MUST SAY WHY IT MIGHT NOT HAVE, rather than just failing. Expiry is
    // much the most common cause and is the one thing the person can do something about.
    problem = 'That link has expired or has already been used. Ask for a fresh one.';
  });

  async function submit(event: SubmitEvent) {
    event.preventDefault();
    if (!client || busy) return;
    busy = true;
    problem = null;
    try {
      const { data: updated, error: updateError } = await client.auth.updateUser({ password });
      if (updateError) throw new Error(updateError.message);

      // HAND THE SESSION TO THE SERVER so the ordinary sign-in cookie is set. Without this they
      // would have a new password and still be signed out, which reads as a reset that failed.
      const { data: session } = await client.auth.getSession();
      if (session.session && updated.user) {
        const res = await fetch('/reset/new', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            access_token: session.session.access_token,
            refresh_token: session.session.refresh_token
          })
        });
        if (res.ok) {
          location.assign('/account');
          return;
        }
      }
      // The password IS changed by this point; only the convenience of being signed in failed.
      location.assign('/login?reset=1');
    } catch (e) {
      problem = (e as Error).message ?? 'That did not work. Ask for a fresh link.';
      busy = false;
    }
  }
</script>

<svelte:head>
  <title>Set a new password - StarSystemX Explorers</title>
  <meta name="robots" content="noindex" />
</svelte:head>

<h1>Set a new password</h1>

{#if problem}
  <div class="panel notice bad">
    <p>{problem}</p>
    <p><a href="/reset">Send me a new link</a></p>
  </div>
{:else if !ready}
  <p class="muted">Checking your link...</p>
{:else}
  <form class="panel" onsubmit={submit}>
    <label>
      New password
      <input type="password" bind:value={password} autocomplete="new-password" minlength="8" required />
    </label>
    <p class="hint" class:bad={tooShort}>Eight characters or more.</p>
    <label>
      Type it again
      <input type="password" bind:value={again} autocomplete="new-password" required />
    </label>
    {#if mismatch}<p class="hint bad">Those two do not match.</p>{/if}
    <button class="primary" type="submit" disabled={busy || mismatch || password.length < 8}>
      {busy ? 'Saving...' : 'Set it and sign me in'}
    </button>
  </form>
{/if}

<style>
  h1 { margin: 0 0 6px; }
  form { max-width: 420px; }
  label { display: block; margin: 12px 0 0; color: var(--ink-dim); }
  input {
    display: block; width: 100%; margin-top: 4px; font: inherit;
    background: var(--panel-2); color: var(--ink);
    border: 1px solid var(--edge); border-radius: 8px; padding: 10px 12px;
  }
  .hint { margin: 5px 0 0; color: var(--ink-faint); font-size: 0.88rem; }
  .bad { color: var(--bad); }
  button { margin-top: 16px; }
</style>
