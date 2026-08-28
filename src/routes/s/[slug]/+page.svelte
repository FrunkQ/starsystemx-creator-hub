<script lang="ts">
  // THE FUNNEL PAGE (design 2). The purpose of this page is to get a bundle into somebody's Star
  // System Explorer. Not to browse, not to preview, not to be a nice place to spend time.
  //
  // So the order on the page is deliberate and should not be rearranged for tidiness:
  //   1. the download, above the fold and above the description
  //   2. what it is, briefly
  //   3. the cover image - the ONLY picture (decision 3)
  //   4. the data
  //   5. the copy-paste snippets, which are SECONDARY: the cheap way to lift one body without
  //      taking the whole map. They serve the same funnel - a snippet used is SSE opened.
  import SnippetBlock from '$lib/components/SnippetBlock.svelte';
  let { data } = $props();

  const s = $derived(data.system);
  const total = $derived(data.bodies.length + data.constructs.length);
  let reportOpen = $state(false);
</script>

<svelte:head>
  <title>{s.title} - StarSystemX Creator Hub</title>
  <meta name="description" content={s.summary ?? 'A star system for Star System Explorer, free to download.'} />
  <!-- OG previews are why the cover image matters more than any in-page richness (design 2). -->
  <meta property="og:title" content={s.title} />
  <meta property="og:description" content={s.summary ?? 'Free to download and open in Star System Explorer.'} />
  <meta property="og:type" content="article" />
  {#if data.coverServable && s.cover_sha256}
    <meta property="og:image" content="/asset/{s.cover_sha256}" />
    <meta name="twitter:card" content="summary_large_image" />
  {/if}
</svelte:head>

<article>
  <h1>{s.title}</h1>
  <p class="by">
    {s.kind === 'starmap' ? 'A campaign starmap' : 'A star system'}
    {#if data.creator}by {data.creator.display_name ?? data.creator.handle}{/if}
    - {total} {total === 1 ? 'object' : 'objects'}
  </p>

  <!-- 1. THE DOWNLOAD. One click, no account. -->
  <p>
    <a class="download" href="/api/download/{s.slug}" data-sveltekit-reload>
      Download for Star System Explorer
    </a>
  </p>
  <p class="download-note">
    Free. No account needed. Opens directly in Star System Explorer -
    <a href="https://starsystemx.com" rel="noopener">get it here</a> if you have not already.
  </p>

  {#if data.withheldCount > 0}
    <div class="panel notice">
      <h3>{data.withheldCount} {data.withheldCount === 1 ? 'picture is' : 'pictures are'} awaiting review</h3>
      <p>
        Every image uploaded here is looked at by a person before it is shared onward. The map is
        complete and downloads normally - those pictures are simply not included yet.
      </p>
    </div>
  {/if}

  {#if s.description}
    <div class="panel"><p>{s.description}</p></div>
  {/if}

  <!-- 3. The cover image, and it is the only picture on the page. -->
  {#if data.coverServable && s.cover_sha256}
    <img class="cover" src="/asset/{s.cover_sha256}" alt="Cover image for {s.title}" />
  {/if}

  {#if data.screenshots.length}
    <div class="shots">
      {#each data.screenshots as shot (shot.sha256)}
        <figure>
          <img src="/asset/{shot.sha256}" alt={shot.caption ?? 'Screenshot of ' + s.title} loading="lazy" />
          {#if shot.caption}<figcaption>{shot.caption}</figcaption>{/if}
        </figure>
      {/each}
    </div>
  {/if}

  <!-- 4. The data. -->
  <h2>What is in it</h2>
  <table>
    <thead>
      <tr><th>Name</th><th>Kind</th><th>Role</th><th>Tags</th></tr>
    </thead>
    <tbody>
      {#each data.bodies as b (b.node_id)}
        <tr>
          <td>{b.name}</td><td>{b.kind}</td><td>{b.role_hint ?? ''}</td>
          <td>{#each b.tags as t}<span class="tag">{t}</span> {/each}</td>
        </tr>
      {/each}
      {#each data.constructs as c (c.node_id)}
        <tr>
          <td>{c.name}</td><td>{c.kind}</td><td>{c.role_hint ?? ''}</td>
          <td>{#each c.tags as t}<span class="tag">{t}</span> {/each}</td>
        </tr>
      {/each}
    </tbody>
  </table>

  <!-- 5. Snippets: secondary, and collapsed by default so they never compete with the download. -->
  <h2>Copy one piece</h2>
  <p class="muted">
    Take a single body or construct without the whole map. Paste it into your own campaign in
    Star System Explorer.
  </p>
  {#each [...data.bodies, ...data.constructs] as n (n.node_id)}
    <SnippetBlock name={n.name} snippet={n.snippet} />
  {/each}

  <div class="foot-actions">
    <button onclick={() => (reportOpen = !reportOpen)}>Report a problem with this map</button>
  </div>
  {#if reportOpen}
    <form class="panel" method="POST" action="/api/report">
      <input type="hidden" name="slug" value={s.slug} />
      <p class="muted">You need an account to report. Tell us what is wrong and we will look.</p>
      <label>
        Reason
        <select name="reason">
          <option value="content">Offensive or inappropriate content</option>
          <option value="copyright">Copyright - this is my work</option>
          <option value="spam">Spam or nonsense</option>
          <option value="other">Something else</option>
        </select>
      </label>
      <label>Detail <textarea name="detail" rows="3"></textarea></label>
      <button class="primary" type="submit">Send report</button>
    </form>
  {/if}
</article>

<style>
  h1 { margin: 0 0 4px; font-size: 1.9rem; letter-spacing: -0.02em; }
  .by { margin: 0 0 20px; color: var(--ink-faint); }
  .cover {
    width: 100%; max-width: 100%; border-radius: var(--radius);
    border: 1px solid var(--edge); margin: 22px 0; display: block;
  }
  h2 { margin: 32px 0 8px; font-size: 1.2rem; }
  .shots { display: grid; gap: 12px; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); margin: 22px 0; }
  .shots figure { margin: 0; }
  .shots img { width: 100%; border-radius: var(--radius); border: 1px solid var(--edge); display: block; }
  .shots figcaption { color: var(--ink-faint); font-size: 0.85rem; margin-top: 6px; }
  .muted { color: var(--ink-dim); margin: 0 0 12px; }
  .foot-actions { margin-top: 36px; }
  label { display: block; margin: 10px 0; color: var(--ink-dim); }
  select, textarea {
    display: block; width: 100%; margin-top: 4px; font: inherit;
    background: var(--panel-2); color: var(--ink);
    border: 1px solid var(--edge); border-radius: 8px; padding: 8px;
  }
</style>
