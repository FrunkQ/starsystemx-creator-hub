<script lang="ts">
  let { data, form } = $props();
</script>

<svelte:head><title>Tag review</title><meta name="robots" content="noindex" /></svelte:head>

<h1>Tag review</h1>
<p class="lede">
  Words creators have asked for. The list is curated because free tags fragment - "scifi", "sci-fi"
  and "science fiction" become three filters that each find a third of the maps - so the first
  question here is never "is this a good word", it is <strong>"do we already have this one?"</strong>
  Swapping puts the existing tag on their map, which is what they wanted anyway.
</p>

{#if form?.done}<div class="panel notice"><p>{form.done}</p></div>{/if}
{#if form?.message}<div class="panel notice bad"><p>{form.message}</p></div>{/if}

{#if !data.pending.length}
  <div class="panel"><p class="muted">Nothing waiting. Every word anybody asked for has an answer.</p></div>
{/if}

{#each data.pending as p (p.tag)}
  <div class="panel proposal">
    <div class="head">
      <h2><code>{p.tag}</code></h2>
      <span class="muted">
        in {p.group}
        {#if p.uses > 1}· <strong>{p.uses} people have asked</strong>{/if}
        {#if p.by}· {p.by}{/if}
        {#if p.map}· <a href="/s/{p.map.slug}">{p.map.title}</a>{/if}
        · {p.created_at.slice(0, 10)}
      </span>
    </div>

    {#if p.similar.length}
      <!-- FIRST, AND ONE CLICK. The path of least resistance has to point at the word that
           already exists, or the vocabulary fragments through this page. -->
      <div class="similar">
        <span class="label">Use one we have:</span>
        {#each p.similar as s (s.tag)}
          <form method="POST" action="?/merge">
            <input type="hidden" name="tag" value={p.tag} />
            <input type="hidden" name="into" value={s.tag} />
            <button type="submit" title="{s.group} · {Math.round(s.score * 100)}% alike">{s.tag}</button>
          </form>
        {/each}
      </div>
    {:else}
      <p class="muted">Nothing in the list is close to this one.</p>
    {/if}

    <div class="decide">
      <form method="POST" action="?/accept">
        <input type="hidden" name="tag" value={p.tag} />
        <label>
          Keep it in
          <select name="group">
            {#each data.groups as g (g)}<option value={g} selected={g === p.group}>{g}</option>{/each}
          </select>
        </label>
        <button class="primary" type="submit">Keep "{p.tag}"</button>
      </form>

      <form method="POST" action="?/reject">
        <input type="hidden" name="tag" value={p.tag} />
        <input name="note" placeholder="Why not (they will not see it, but you will)" maxlength="300" />
        <button class="danger" type="submit">Turn down</button>
      </form>
    </div>
  </div>
{/each}

{#if data.recent.length}
  <h2 class="recent-head">Recently decided</h2>
  <table>
    <thead><tr><th>Tag</th><th>What happened</th><th>When</th></tr></thead>
    <tbody>
      {#each data.recent as r (r.tag)}
        <tr>
          <td><code>{r.tag}</code></td>
          <td>
            {#if r.state === 'merged'}became <code>{r.merged_into}</code>
            {:else if r.state === 'accepted'}kept
            {:else}turned down{/if}
          </td>
          <td class="when">{r.decided_at?.slice(0, 10) ?? ''}</td>
        </tr>
      {/each}
    </tbody>
  </table>
{/if}

<style>
  h1 { margin: 0 0 6px; }
  .lede { color: var(--ink-dim); margin: 0 0 18px; max-width: 78ch; }
  .proposal { display: flex; flex-direction: column; gap: 12px; }
  .head { display: flex; align-items: baseline; gap: 12px; flex-wrap: wrap; }
  .head h2 { margin: 0; font-size: 1.1rem; }
  .muted { color: var(--ink-dim); font-size: 0.9rem; margin: 0; }

  .similar { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
  .similar .label { color: var(--ink-faint); font-size: 0.85rem; }
  .similar form { margin: 0; }
  /* The suggestions look like the tags they are, not like buttons: what you get is a pill. */
  .similar button {
    border-radius: 999px; padding: 4px 12px;
    border-color: var(--accent); color: var(--accent); background: none;
  }
  .similar button:hover { background: var(--accent); color: var(--accent-ink); }

  .decide { display: flex; gap: 24px; flex-wrap: wrap; align-items: center; }
  .decide form { display: flex; gap: 8px; align-items: center; margin: 0; }
  select, input {
    font: inherit; background: var(--panel-2); color: var(--ink);
    border: 1px solid var(--edge); border-radius: 6px; padding: 5px 8px;
  }
  .decide input[name='note'] { min-width: 280px; }
  .recent-head { font-size: 1rem; margin: 28px 0 8px; color: var(--ink-dim); }
  .when { color: var(--ink-faint); white-space: nowrap; }
</style>
