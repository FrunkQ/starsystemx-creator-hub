<script lang="ts">
  // THE REVIEW QUEUE. Design for SPEED, because it is manual and volume is the enemy (design 6.4).
  //
  // KEYBOARD-DRIVEN WITH UNDO. A mouse-driven queue is a queue nobody clears:
  //   A  approve      R  reject (content)     C  reject (copyright)   S  reject (spam)
  //   U  undo last    J / K  next / previous
  //
  // Every decision is written against the HASH with a reviewer and a timestamp. Never against the
  // upload, or the same bytes come back tomorrow.
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
      <!-- The admin-only serve route: the one place an unreviewed asset is shown. -->
      <img src="/admin/asset/{current.sha256}" alt="Unreviewed upload awaiting review" />
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

      <h2>Used by</h2>
      <ul>
        {#each current.uses as u}
          <li><a href="/s/{u.systems?.slug}" rel="noopener">{u.systems?.title ?? u.system_id}</a></li>
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
</style>
