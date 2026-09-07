<script lang="ts">
  // JOINING (D-66). The page the hub did not have.
  //
  // The tone is the terms' tone: plain, and honest about what an account is FOR. The single most
  // useful thing on this page is the line saying you do not need one to download - most people who
  // arrive here arrived from a map, and the worst outcome is somebody making an account they never
  // needed and then feeling they were made to.
  import { enhance } from '$app/forms';
  import { cleanHandle, handleProblem, HANDLE_MAX } from '$lib/handles';
  import type { ActionData, PageData } from './$types';

  let { data, form }: { data: PageData; form: ActionData } = $props();

  let handle = $state(form?.handle ?? '');
  let busy = $state(false);

  // SHOWN BACK AS IT WILL BE STORED. A handle is tidied - upper case folded, spaces and accents
  // turned into something a URL can carry - and finding that out AFTER submitting is a small
  // unpleasant surprise on the one form where a person is deciding what they are called.
  const tidy = $derived(cleanHandle(handle));
  const problem = $derived(handle.trim() ? handleProblem(tidy) : null);
</script>

<svelte:head>
  <title>Join - StarSystemX Explorers</title>
  <meta name="description" content="Make an account to share a star map, star one, or leave a comment. Downloading never needs one." />
</svelte:head>

<h1>Join</h1>

{#if form?.check}
  <!-- THE ONE THING THEY NEED NOW is to go and look at their email, so it is the whole page. -->
  <div class="panel notice">
    <h3>Check your email</h3>
    <p>
      We have sent a confirmation link to <strong>{form.check}</strong>. Click it and you are in.
      It can take a minute, and it is worth a look in your spam folder if it does not appear.
    </p>
    {#if form.renamed}
      <p>
        Somebody took that name a moment before you did, so you are <strong>{form.handle}</strong>.
        Sorry - you can set a display name on your account page, which is what people actually see.
      </p>
    {:else}
      <p>You will be <strong>{form.handle}</strong>.</p>
    {/if}
  </div>
{:else if !data.open}
  <div class="panel notice">
    <h3>New accounts are closed at the moment</h3>
    <p>
      Nothing on the hub is behind a login except sharing your own maps - <a href="/browse">browse</a>
      and download as much as you like without one.
    </p>
  </div>
{:else}
  <p class="lede">
    An account lets you <strong>share a map</strong>, star one, and leave comments.
    <strong>Downloading never needs one</strong> - it never will.
  </p>

  <form class="panel" method="POST" use:enhance={() => { busy = true; return async ({ update }) => { await update({ reset: false }); busy = false; }; }}>
    {#if form?.message}<p class="bad">{form.message}</p>{/if}

    <label>
      What should we call you?
      <input name="handle" bind:value={handle} maxlength={HANDLE_MAX * 2} autocomplete="username"
             placeholder="nomad" required />
    </label>
    <!-- The live read-back: what it becomes, or why it cannot be used. Never both. -->
    {#if problem}
      <p class="hint bad">{problem}</p>
    {:else if tidy && tidy !== handle}
      <p class="hint">You will be <code>{tidy}</code>.</p>
    {:else}
      <p class="hint">This goes under every map you share. Letters and numbers, with - or _ in the middle.</p>
    {/if}

    <label>
      Email
      <input name="email" type="email" value={form?.email ?? ''} autocomplete="email" required />
    </label>
    <p class="hint">Used to confirm this account and to reset your password. It is never shown on the site.</p>

    <label>
      Password
      <input name="password" type="password" autocomplete="new-password" minlength="8" required />
    </label>
    <p class="hint">Eight characters or more.</p>

    <button class="primary" type="submit" disabled={busy || !!problem}>
      {busy ? 'Making your account...' : 'Join'}
    </button>

    <!-- A sentence, not a tick box. The tick box that matters is the one on the upload form, where
         somebody states they have the right to share what they are sharing - putting a second one
         here would train people to tick without reading, which costs more than it buys. -->
    <p class="hint">
      By joining you agree to the <a href="/terms">terms</a>, including
      <a href="/terms#keep-it-tabletop-safe">what belongs here</a> and
      <a href="/terms#fan-work">how fan work is treated</a>.
    </p>
  </form>

  <p class="muted">Already have an account? <a href="/login">Sign in</a>.</p>
{/if}

<style>
  h1 { margin: 0 0 6px; font-size: 1.9rem; letter-spacing: -0.02em; }
  .lede { color: var(--ink-dim); max-width: 62ch; margin: 0 0 4px; }
  form { max-width: 460px; }
  label { display: block; margin: 14px 0 0; color: var(--ink-dim); }
  input {
    display: block; width: 100%; margin-top: 4px; font: inherit;
    background: var(--panel-2); color: var(--ink);
    border: 1px solid var(--edge); border-radius: 8px; padding: 10px 12px;
  }
  .hint { margin: 5px 0 0; color: var(--ink-faint); font-size: 0.88rem; }
  .bad { color: var(--bad); }
  button { margin-top: 18px; }
  code { background: var(--panel-2); border: 1px solid var(--edge); border-radius: 4px; padding: 1px 6px; color: var(--ink); }
</style>
