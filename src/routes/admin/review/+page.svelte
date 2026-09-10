<script lang="ts">
  // THE REVIEW QUEUE. Design for SPEED, because it is manual and volume is the enemy (design 6.4).
  //
  // KEYBOARD-DRIVEN WITH UNDO. A mouse-driven queue is a queue nobody clears:
  //   A  approve      R  reject (content)     C  reject (copyright)   S  reject (spam)
  //   U  undo last    J / K  next / previous
  //
  // Every decision is written against the HASH with a reviewer and a timestamp. Never against the
  // upload, or the same bytes come back tomorrow.
  import { invalidate } from '$app/navigation';
  import { humanBytes } from '$lib/bundle/sniff';
  let { data } = $props();

  // A decided hash is hidden by FILTERING the loaded queue rather than by mutating a local copy.
  // That keeps the list reactive to a reload, and it makes undo a one-line set deletion instead of
  // splice-index bookkeeping that would drift the moment two decisions overlapped.
  let decided = $state(new Set<string>());
  let cursor = $state(0);
  let lastHash = $state<string | null>(null);
  let busy = $state(false);

  const cards = $derived(data.cards.filter((c: any) => !decided.has(c.sha256)));
  const current = $derived(cards[Math.min(cursor, Math.max(0, cards.length - 1))]);

  // WHAT THE BYTES SAY, asked for the card on screen and no other (D-76). Sixty R2 reads before the
  // page painted would answer a question about the one picture somebody is looking at.
  let facts = $state<Record<string, any> | null>(null);
  let factsFor: string | null = null;
  $effect(() => {
    const hash = current?.sha256;
    if (!hash || hash === factsFor) return;
    factsFor = hash;
    facts = null;
    fetch('/api/review/sniff/' + hash)
      .then((r) => (r.ok ? r.json() : null))
      .then((f) => { if (factsFor === hash) facts = (f as Record<string, any>) ?? null; })
      .catch(() => { if (factsFor === hash) facts = null; });
  });

  /** "A Painter (moderator)" - the pill matters, because staff uploads are not a stranger's. */
  const who = (u: any) => u?.uploader?.display_name ?? u?.uploader?.handle ?? 'unknown';

  async function post(hash: string, verdict: string, reason?: string) {
    const res = await fetch('/api/review', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ hash, verdict, reason })
    });
    if (!res.ok) throw new Error('failed');
  }

  async function decide(verdict: 'approved' | 'banned', reason?: 'content' | 'copyright' | 'spam') {
    const card = current;
    if (!card || busy) return;
    busy = true;
    try {
      await post(card.sha256, verdict, reason);
      decided = new Set(decided).add(card.sha256);
      lastHash = card.sha256;
      if (cursor >= cards.length) cursor = Math.max(0, cards.length - 1);
      // The number circle in the banner is the layout's, and this page decides by fetch - so say
      // so, or it keeps the count it was drawn with (D-43). Not awaited: the queue on screen is
      // already right, and a reviewer should not wait for a badge.
      void invalidate('hub:counts');
    } catch {
      alert('That decision did not save. Nothing has changed.');
    } finally {
      busy = false;
    }
  }

  // Undo puts the hash back to novel AND back on screen. Without it the queue is a one-way door
  // and a reviewer working fast will not work fast.
  async function undo() {
    if (!lastHash || busy) return;
    busy = true;
    try {
      await post(lastHash, 'novel');
      const next = new Set(decided);
      next.delete(lastHash);
      decided = next;
      lastHash = null;
      void invalidate('hub:counts');
    } catch {
      alert('That undo did not save.');
    } finally {
      busy = false;
    }
  }

  function onkey(e: KeyboardEvent) {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const k = e.key.toLowerCase();
    if (k === 'a') { e.preventDefault(); decide('approved'); }
    else if (k === 'r') { e.preventDefault(); decide('banned', 'content'); }
    else if (k === 'c') { e.preventDefault(); decide('banned', 'copyright'); }
    else if (k === 's') { e.preventDefault(); decide('banned', 'spam'); }
    else if (k === 'u') { e.preventDefault(); undo(); }
    else if (k === 'j') { e.preventDefault(); cursor = Math.min(cursor + 1, cards.length - 1); }
    else if (k === 'k') { e.preventDefault(); cursor = Math.max(cursor - 1, 0); }
  }
</script>

<svelte:window onkeydown={onkey} />
<svelte:head><title>Review queue</title><meta name="robots" content="noindex" /></svelte:head>

<h1>Review queue</h1>
<p class="lede">
  {cards.length} unreviewed {cards.length === 1 ? 'image' : 'images'}.
  Only novel bytes appear here - anything already approved never comes back.
</p>
<p class="keys">
  <kbd>A</kbd> approve &nbsp; <kbd>R</kbd> reject: content &nbsp; <kbd>C</kbd> copyright &nbsp;
  <kbd>S</kbd> spam &nbsp; <kbd>U</kbd> undo &nbsp; <kbd>J</kbd>/<kbd>K</kbd> move
</p>

{#if !cards.length}
  <div class="panel"><p>Nothing waiting. The queue holds only novel images, so this is the normal state.</p></div>
{:else}
  <div class="review">
    <div class="stage">
      <!-- The single privileged serve route: the one place an unreviewed asset is shown. -->
      <img src="/private/asset/{current.sha256}" alt="Unreviewed upload awaiting review" />
    </div>
    <aside>
      <h2>Claimed provenance</h2>
      {#if !current.claims.length}
        <p class="bad-text">Nothing recorded at all.</p>
      {/if}
      {#each current.claims as c}
        <dl>
          {#if c.title}<dt>Title</dt><dd>{c.title}</dd>{/if}
          {#if c.credit}<dt>Credit</dt><dd>{c.credit}</dd>{/if}
          {#if c.license}<dt>Licence</dt><dd>{c.license}</dd>{/if}
          {#if c.source_url}<dt>Source</dt><dd><a href={c.source_url} rel="noopener nofollow">{c.source_url}</a></dd>{/if}
        </dl>
        {#if c.cc_by_breach}
          <p class="bad-text">CC-BY with no credit recorded - the author must be named.</p>
        {/if}
      {/each}

      <h2>The file</h2>
      <dl class="facts">
        {#if current.filename}<dt>Name</dt><dd class="mono">{current.filename}</dd>{/if}
        <dt>Declared</dt><dd class="mono">{current.mime ?? 'nothing'}</dd>
        <dt>Size</dt><dd>{humanBytes(current.byte_size)}</dd>
        <dt>Bytes say</dt>
        <dd>
          {#if !facts}
            <span class="muted">looking...</span>
          {:else if facts.format}
            {facts.format}
          {:else if facts.readable === false}
            <span class="bad-text">the stored object is missing</span>
          {:else}
            <span class="muted">not a format the hub recognises</span>
          {/if}
        </dd>
      </dl>
      {#if facts?.mismatch}
        <!-- THE ONE SIGNAL WORTH INTERRUPTING FOR. Everything else on this card is a claim - the
             name came out of a stranger's zip and the type came off that name. This is the bytes
             disagreeing with both. -->
        <p class="bad-text">
          The bytes say <strong>{facts.format}</strong>, which is not what this file claims to be.
        </p>
      {/if}

      <h2>Who and where</h2>
      <ul class="uses">
        {#each current.uses as u}
          <li>
            <a href="/s/{u.systems?.slug}" rel="noopener">{u.systems?.title ?? u.system_id}</a>
            <span class="muted">by</span>
            {#if u.uploader}
              <a href="/admin/explorers/{u.uploader.handle}">{who(u)}</a>
              {#if u.uploader.role !== 'user'}
                <span class="role" class:mod={u.uploader.role === 'moderator'}>{u.uploader.role}</span>
              {/if}
              {#if u.uploader.state !== 'active'}
                <span class="tag warn">{u.uploader.state}</span>
              {/if}
            {:else}
              <span class="muted">an unknown explorer</span>
            {/if}
          </li>
        {/each}
      </ul>

      <h2>Signals</h2>
      <p class="muted">
        {current.usage_count} {current.usage_count === 1 ? 'map' : 'maps'} waiting.
        {current.report_count} reports.
        {current.flagged ? 'Flagged by upload pattern.' : ''}
      </p>

      <div class="actions">
        <button class="primary" onclick={() => decide('approved')} disabled={busy}>Approve (A)</button>
        <button class="danger" onclick={() => decide('banned', 'content')} disabled={busy}>Content (R)</button>
        <button class="danger" onclick={() => decide('banned', 'copyright')} disabled={busy}>Copyright (C)</button>
        <button class="danger" onclick={() => decide('banned', 'spam')} disabled={busy}>Spam (S)</button>
        <button onclick={undo} disabled={!lastHash || busy}>Undo (U)</button>
      </div>
    </aside>
  </div>

  <!-- ============================================================================================
       THE REST OF THE QUEUE, VISIBLE (owner, 2026-09-10: "The queue only shows the first image and
       it would be great if it thumbnailed the rest below with who uploaded them and which map they
       are associated with").
       
       It is not decoration: a reviewer who can see the next eight can tell a batch of one person's
       screenshots from eight unrelated uploads, and that changes how they read the one in front of
       them. Clicking moves the cursor rather than opening anything - this page is a queue, and
       leaving it to come back is what makes a queue not get cleared.
       ============================================================================================ -->
  {#if cards.length > 1}
    <h2 class="strip-head">Waiting behind it</h2>
    <div class="strip">
      {#each cards as c, i (c.sha256)}
        <button class="thumb" class:on={i === cursor} onclick={() => (cursor = i)}
                title="{c.filename ?? c.sha256.slice(0, 12)} - {c.uses.length} {c.uses.length === 1 ? 'map' : 'maps'}">
          <img src="/private/asset/{c.sha256}" alt="" loading="lazy" />
          <span class="cap">
            {#if c.uses[0]}
              <strong>{who(c.uses[0])}</strong>
              <span class="map">{c.uses[0].systems?.title ?? 'a map'}</span>
            {:else}
              <span class="map">no map yet</span>
            {/if}
          </span>
        </button>
      {/each}
    </div>
  {/if}
{/if}

<style>
  h1 { margin: 0 0 4px; }
  .lede { color: var(--ink-dim); margin: 0 0 8px; }
  .keys { color: var(--ink-faint); font-size: 0.88rem; margin: 0 0 20px; }
  kbd {
    background: var(--panel-2); border: 1px solid var(--edge);
    border-radius: 4px; padding: 1px 6px; font-size: 0.85em;
  }
  .review { display: grid; grid-template-columns: minmax(0, 1.4fr) minmax(260px, 1fr); gap: 20px; }
  @media (max-width: 780px) { .review { grid-template-columns: 1fr; } }
  .stage {
    background: #05070c; border: 1px solid var(--edge); border-radius: var(--radius);
    display: grid; place-items: center; min-height: 320px; padding: 10px;
  }
  .stage img { max-width: 100%; max-height: 62vh; display: block; }
  aside h2 { font-size: 0.95rem; margin: 16px 0 6px; color: var(--ink-faint); }
  aside h2:first-child { margin-top: 0; }
  dl { margin: 0 0 8px; display: grid; grid-template-columns: auto 1fr; gap: 2px 10px; font-size: 0.9rem; }
  dt { color: var(--ink-faint); }
  dd { margin: 0; overflow-wrap: anywhere; }
  ul { margin: 0; padding-left: 18px; font-size: 0.9rem; }
  .muted { color: var(--ink-dim); font-size: 0.9rem; }
  .bad-text { color: var(--bad); font-size: 0.9rem; }
  .actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 20px; }
  /* The file facts, as a definition list so the labels line up and the values can be long. */
  .facts { display: grid; grid-template-columns: max-content 1fr; gap: 2px 12px; margin: 0 0 10px; font-size: 0.9rem; }
  .facts dt { color: var(--ink-faint); }
  .facts dd { margin: 0; }
  .mono { font-family: ui-monospace, Consolas, monospace; font-size: 0.85rem; word-break: break-all; }
  .uses { list-style: none; padding: 0; margin: 0; }
  .uses li { margin: 0 0 4px; }
  /* The banner's two colours, so a role reads the same wherever it appears (D-74). */
  .role {
    font-size: 0.66rem; text-transform: uppercase; letter-spacing: 0.07em; font-weight: 700;
    padding: 1px 6px; border-radius: 999px; margin-left: 4px;
    background: var(--warn); color: var(--accent-ink);
  }
  .role.mod { background: var(--accent); }
  .tag.warn { border-color: var(--warn); color: var(--warn); }

  .strip-head { margin: 26px 0 10px; font-size: 1rem; }
  .strip { display: grid; gap: 10px; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); }
  .thumb {
    padding: 0; background: var(--panel); border: 1px solid var(--edge); border-radius: 8px;
    overflow: hidden; cursor: pointer; text-align: left; display: block;
  }
  .thumb.on { border-color: var(--accent); }
  .thumb img { width: 100%; aspect-ratio: 4 / 3; object-fit: cover; display: block; background: var(--panel-2); }
  .cap { display: block; padding: 6px 8px; font-size: 0.78rem; line-height: 1.35; }
  .cap strong { display: block; color: var(--ink); font-weight: 600; }
  .cap .map { color: var(--ink-faint); }
</style>
