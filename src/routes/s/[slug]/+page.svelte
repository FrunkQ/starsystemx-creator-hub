<script lang="ts">
  // THE FUNNEL PAGE (design 2). The purpose of this page is to get a bundle into somebody's Star
  // System Explorer. Not to browse, not to preview, not to be a nice place to spend time.
  //
  // So the order on the page is deliberate and should not be rearranged for tidiness:
  //   1. the download, above the fold and above the description
  //   2. what it is, briefly
  //   3. the cover image - the ONLY picture (decision 3)
  //   4. the data, as a tree - and every row of it can be copied, with everything beneath it, for
  //      pasting into SSE. That is SECONDARY: the cheap way to lift one body or one star without
  //      taking the whole map. It serves the same funnel - a clip used is SSE opened.
  import NodeTree from '$lib/components/NodeTree.svelte';
  import { buildClip, clipText } from '$lib/bundle/clip';
  import RoleIcon from '$lib/components/RoleIcon.svelte';
  import { SSE_PROD_ORIGIN } from '$lib/addresses';
  import Badge from '$lib/components/Badge.svelte';
  import InfoDensity from '$lib/components/InfoDensity.svelte';
  import { orderRoles } from '$lib/components/roleIcons';
  import { formatBytes, ROLE_PILLS } from '$lib/bundle/facets';
  import { COMMENT_MAX } from '$lib/comments';
  import { FAN_WORK_BADGE, fanWorkNotice, cleanSetting } from '$lib/fanWork';
  import { customCalendars, calendarCaveat } from '$lib/bundle/overrides';
  let { data, form } = $props();

  const s = $derived(data.system);
  const total = $derived(data.bodies.length + data.constructs.length);

  // ============================================================================================
  // COPY FOR SSE (D-56). The engine opens a campaign from a URL and refuses a single system - so
  // where a starmap gets "Open in Star System Explorer", a system gets the other door the engine
  // already has: the clipboard. R-14 shipped the paste target in v3.0.292, and every row of the
  // tree below has offered a clip since D-19; this is the same thing rooted at the whole map.
  //
  // ONE ROOT, because the envelope carries one (`root` in `bundle/clip.ts`). A system with two
  // separate top-level trees copies the larger. The owner has an engine-side change coming for
  // what a paste file carries - "extra data put into paste files to ID the fast" - and when the
  // format grows, `CLIP_FORMAT` is the number that says so.
  // ============================================================================================
  const nodes = $derived([...data.bodies, ...data.constructs]);
  /** The node with the most beneath it: the star of a system, not a stray barycentre. */
  const wholeRoot = $derived.by(() => {
    const roots = nodes.filter((n) => !n.parent_id);
    if (!roots.length) return null;
    const under = (id: string) => nodes.filter((n) => n.parent_id === id).length;
    return [...roots].sort((a, b) => under(b.node_id) - under(a.node_id))[0].node_id;
  });
  const copyable = $derived(s.kind !== 'starmap' && !!wholeRoot);
  let copied = $state(false);

  async function copyWhole() {
    if (!wholeRoot) return;
    const clip = buildClip(nodes as never, wholeRoot, {
      site: data.site.name, url: data.site.url + '/s/' + s.slug, title: s.title,
      creator: data.creator?.display_name ?? data.creator?.handle ?? null
      // THE MAP'S CUSTOM RULES RIDE ALONG (D-71). Without them a pasted body names a liquid the
      // destination has never heard of and the lookup returns undefined without complaining.
    }, credits as never, (s as { rule_overrides?: Record<string, unknown> }).rule_overrides ?? null);
    if (!clip) return;
    try {
      await navigator.clipboard.writeText(clipText(clip));
      copied = true;
      setTimeout(() => (copied = false), 2200);
      // TAKING A SYSTEM AWAY IS A DOWNLOAD (D-77). A system cannot be opened in the engine, so this
      // button IS its download - counting only the other one made these maps look unread. Fire and
      // forget: a counter must never be able to spoil a copy that has already worked.
      void fetch('/api/copied', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ slug: s.slug })
      }).catch(() => undefined);
    } catch {
      copied = false; // a denied clipboard permission is not an error worth shouting about
    }
  }
  let reportOpen = $state(false);

  // Comments are counted like stars: the trigger-kept count when the column exists, the rows
  // themselves on a database that has not run 0021 (then there are none).
  const commentCount = $derived(s.comments_count ?? data.comments.length);

  // "Find more maps with": the creator's own tags, then the hub's pills, minus the counted roles.
  const findMore = $derived([
    ...((s.tags ?? []) as string[]).map((tag) => ({ tag, mine: true })),
    ...((s.auto_tags ?? []) as string[]).filter((t) => !ROLE_PILLS.has(t)).map((tag) => ({ tag, mine: false }))
  ]);

  // STARS, not hearts (owner, 2026-09-04: "thematically appropriate"). The column keeps its old
  // name; the word people see is the one that fits a map of stars.
  let starred = $state(data.starred);
  let stars = $state(s.hearts_count);
  let starBusy = $state(false);
  async function toggleStar() {
    if (!data.signedIn) { location.href = '/login'; return; }
    starBusy = true;
    try {
      const res = await fetch('/api/heart', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ slug: s.slug, on: !starred })
      });
      const out = (await res.json()) as { ok: boolean; hearts?: number };
      if (out.ok) { starred = !starred; stars = out.hearts ?? stars; }
    } catch { /* a failed star is not worth a dialog */ } finally { starBusy = false; }
  }

  // Role counts are the human axis - "12 planets, 4 stations" says what "230 bodies" cannot. In
  // the fixed order every row of the tree uses, so the eye learns one layout.
  const roles = $derived(orderRoles((s.role_counts ?? {}) as Record<string, number>));

  // Other cartographers' work in this map, as the engine recorded it on paste (R-16). Each credit
  // may carry a CHAIN - where the work was before the map it was pasted from, deepest first - so a
  // copy of a copy still names its original.
  type Origin = { url: string; title: string | null; creator: string | null };
  type Credit = { title: string; creator: string | null; url: string | null; chain?: Origin[] };
  type Stop = { url: string | null; title: string | null; creator: string | null };
  const fanSetting = $derived(cleanSetting((s as { fan_setting?: string | null }).fan_setting));
  // A custom calendar is the one customisation a clip cannot carry (D-72) - it is the campaign's
  // clock rather than one of its rules, and adopting somebody else's would re-date everything in
  // the campaign it landed in. So the page says so where the copying happens.
  const calendars = $derived.by(() => {
    const names = customCalendars((s as { facet_results?: unknown }).facet_results);
    const rule = (Array.isArray((s as { facet_results?: unknown }).facet_results)
      ? ((s as { facet_results: Array<{ id: string; count: number }> }).facet_results)
      : []).find((r) => r?.id === 'custom-calendars');
    return { names, caveat: calendarCaveat(names, rule?.count ?? names.length) };
  });
  const holdNote = $derived(((s as { hold_note?: string | null }).hold_note ?? '').trim() || null);
  const credits = $derived((Array.isArray(s.content_credits) ? s.content_credits : []) as Credit[]);
  // The original of each credit, and the maps it passed through on the way here.
  const lineage = (c: Credit): { original: Stop; via: Stop[] } => {
    const chain = c.chain ?? [];
    return chain.length ? { original: chain[0], via: [...chain.slice(1), c] } : { original: c, via: [] };
  };
  // Everyone whose hands this map's content passed through - the owner's "ownership is shared".
  const cartographers = $derived.by(() => {
    const names = new Set<string>();
    for (const c of credits) { for (const o of [...(c.chain ?? []), c]) if (o.creator) names.add(o.creator); }
    const mine = data.creator?.display_name ?? data.creator?.handle;
    if (mine) names.delete(mine);
    return [...names];
  });
</script>

<svelte:head>
  <title>{s.title} - {data.site.name}</title>
  <meta name="description" content={s.summary ?? 'A star system for Star System Explorer, free to download.'} />
  <!-- OG previews are why the cover image matters more than any in-page richness (design 2). -->
  <meta property="og:title" content={s.title} />
  <meta property="og:description" content={s.summary ?? 'Free to download and open in Star System Explorer.'} />
  <meta property="og:type" content="article" />
  <meta property="og:site_name" content={data.site.name} />
  <!-- ABSOLUTE, and that is not a detail: Open Graph ignores relative urls, so a relative og:image
       means Discord and Twitter show a link with NO PICTURE. For a hub whose product is
       link-sharing, that is the most expensive small bug available. -->
  <meta property="og:url" content="{data.site.url}/s/{s.slug}" />
  <link rel="canonical" href="{data.site.url}/s/{s.slug}" />
  {#if data.coverServable && s.cover_sha256}
    <meta property="og:image" content="{data.site.url}/asset/{s.cover_sha256}" />
    <meta name="twitter:card" content="summary_large_image" />
  {:else}
    <meta name="twitter:card" content="summary" />
  {/if}
</svelte:head>

<article>
  <h1>{s.title}</h1>
  <p class="by">
    {s.kind === 'starmap' ? 'A campaign starmap' : 'A star system'}
    {#if data.creator}by {data.creator.display_name ?? data.creator.handle}{/if}
    {#if data.creatorBadges.length}<span class="badges">{#each data.creatorBadges as b (b)}<Badge badge={b} size={18} />{/each}</span>{/if}
    - {total} {total === 1 ? 'object' : 'objects'}
  </p>

  <!-- SAY IT WHERE IT IS READ (owner, 2026-09-06; D-61). A starmap of somebody else's universe
       with no notice on it looks, to a rights holder skimming this page, exactly like a claim on
       it. The pill is above the fold and names the setting; the full wording is at the bottom
       beside the credits, where a reader who wants the sentence will look for it. -->
  {#if fanSetting}
    <p class="fan-pill"><a href="#fan-work">{FAN_WORK_BADGE}: {fanSetting}</a></p>
  {/if}

  <!-- ON A WIDE SCREEN the words sit beside the picture; on a narrow one they stack (owner,
       2026-09-05). The download stays first in reading order either way (design 2). -->
  <div class="top">
    <div class="lead">
      <!-- 1. THE DOWNLOAD. One click, no account. -->
      <p class="dl">
        <a class="download" href="/api/download/{s.slug}" data-sveltekit-reload>
          Download for Star System Explorer
        </a>
        <!-- One click into the app (D-35): shown once the engine can receive a URL (R-17). -->
        {#if data.openInSse}
          <a class="download open" href={data.openInSse} target="_blank" rel="noopener">Open in Star System Explorer</a>
        {:else if copyable}
          <!-- A SYSTEM CANNOT BE OPENED, BUT IT CAN BE PASTED (owner, 2026-09-06; D-56). The
               engine's `?open=` takes a campaign and refuses a single system, so the button that
               would have opened it copies it instead - the same clip every row of the tree below
               already offers, rooted at the whole thing. White rather than blue, because that is
               what a system is called on a card. -->
          <button class="download paste" type="button" onclick={copyWhole}>
            {copied ? 'Copied - paste it into SSE' : 'Copy for Star System Explorer'}
          </button>
        {/if}
      </p>
      <p class="download-note">
        Free. No account needed. Opens directly in
        <a href={SSE_PROD_ORIGIN} target="_blank" rel="noopener">Star System Explorer</a>,
        which runs in your browser - nothing to install.
      </p>
      <p class="social">
        <button class="star" class:on={starred} onclick={toggleStar} disabled={starBusy}
          title={data.signedIn ? (starred ? 'Take your star back' : 'Give this map a star') : 'Sign in to give this map a star'}>
          <svg viewBox="0 0 24 24"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" /></svg>
          {starred ? 'Starred' : 'Star this map'} · {stars}
        </button>
        {#if data.commentsAvailable}
          <a class="star" href="#comments" title="Comments on this map">
            <svg viewBox="0 0 24 24"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
            {commentCount} {commentCount === 1 ? 'comment' : 'comments'}
          </a>
        {/if}
      </p>

      <!-- ON HOLD (D-79). ABOVE the download and not instead of it: the owner's whole point is that the
       file stays fetchable, because a file nobody can fetch is a file nobody can diagnose - and the
       person best placed to say what is wrong with it is the person trying to use it. -->
  {#if holdNote}
    <div class="panel notice bad">
      <h3>This map may have problems</h3>
      <p>{holdNote}</p>
      <p>
        It is still yours to download. If it does not work,
        <a href="/takedown">tell us what happened</a> - that is how it gets fixed or cleared.
      </p>
    </div>
  {/if}

  {#if data.withheldCount > 0}
        <div class="panel notice">
          <h3>{data.withheldCount} {data.withheldCount === 1 ? 'picture is' : 'pictures are'} awaiting review</h3>
          <p>
            Every image uploaded here is looked at by a person before it is shared onward. The map is
            complete and downloads normally - those pictures are simply not included yet.
          </p>
        </div>
      {/if}

      <!-- 2. What it is, briefly. -->
      {#if s.description}
        <div class="panel"><p>{s.description}</p></div>
      {/if}
    </div>

    <aside class="visual">
      <!-- 3. The cover image, and it is the only picture on the page. -->
      {#if data.coverServable && s.cover_sha256}
        {#if data.openInSse}
          <!-- The dream (owner, 2026-09-05): see the banner, open it in the app, new tab. -->
          <a class="cover-link" href={data.openInSse} target="_blank" rel="noopener" title="Open this map in Star System Explorer, in a new tab">
            <img class="cover" src="/asset/{s.cover_sha256}" alt="Cover image for {s.title}" />
          </a>
        {:else}
          <img class="cover" src="/asset/{s.cover_sha256}" alt="Cover image for {s.title}" />
        {/if}
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
    </aside>
  </div>

  <!-- 4. The data. -->
  <h2>What is in it</h2>

  <!-- The facts, counted from the file. Above the table because a browsing GM wants the shape of
       the thing before the list of it. -->
  <div class="facts">
    {#if s.system_count > 1}<div><b>{s.system_count}</b> systems</div>{/if}
    {#if s.body_count}<div><b>{s.body_count}</b> bodies</div>{/if}
    {#if s.construct_count}<div><b>{s.construct_count}</b> constructs</div>{/if}
    {#if s.carried_images}<div><b>{s.carried_images}</b> pictures</div>{/if}
    {#if s.carried_models}<div><b>{s.carried_models}</b> 3D models</div>{/if}
    <div><b>{formatBytes(s.source_bytes ?? 0)}</b> download</div>
    {#if s.created_with}<div>made with SSE <b>{s.created_with}</b></div>{/if}
    <!-- HOW MUCH IS WRITTEN ABOUT IT (D-30): the "i" with its ring of five, 5 being the best here. -->
    {#if data.density.measured}
      <div class="density" title={data.density.summary}>
        <InfoDensity level={data.density.level} size={20} title={data.density.summary} />
        <b>{data.density.level}</b> of 5 described
      </div>
    {/if}
  </div>

  {#if roles.length}
    <p class="roles">
      {#each roles as [role, n] (role)}
        <span class="rc"><RoleIcon role={role} size={13} />{n} {role}{n === 1 ? '' : 's'}</span>
      {/each}
    </p>
  {/if}

  <!-- The map's pills used to sit here. They are "find more maps with", below the data (D-31). -->

  <!-- CREDIT FOLLOWS CONTENT. When this map was built partly from clips pasted out of other maps,
       the engine recorded whose (R-16) and the hub says so, with a way back. -->
  {#if credits.length}
    <div class="credits">
      <p>
        Includes work from
        {#each credits as c, i (c.title + (c.url ?? ''))}
          {@const l = lineage(c)}
          {#if l.original.url}<a href={l.original.url}>{l.original.title ?? c.title}</a>{:else}{l.original.title ?? c.title}{/if}{#if l.original.creator} by {l.original.creator}{/if}{#if l.via.length} (via {#each l.via as v, j}{#if v.url}<a href={v.url}>{v.title ?? 'a map'}</a>{:else}{v.title ?? 'a map'}{/if}{#if v.creator} by {v.creator}{/if}{j < l.via.length - 1 ? ', ' : ''}{/each}){/if}{i < credits.length - 1 ? '; ' : '.'}
        {/each}
      </p>
      {#if cartographers.length}
        <p class="shared">Cartographers whose work is in this map: {cartographers.join(', ')}{#if data.creator}, and {data.creator.display_name ?? data.creator.handle}{/if}.</p>
      {/if}
    </div>
  {/if}

  <!-- THE NOTICE, unconditional. It is shown whether or not a setting was named, because the map
       that needs it most is the one nobody remembered to fill the field in on. The wording lives
       in `$lib/fanWork.ts` so the page, the download and the terms cannot drift apart. -->
  <p class="fan-work" id="fan-work">
    <b>{FAN_WORK_BADGE}.</b> {fanWorkNotice(fanSetting)}
  </p>

  <!-- The other direction: where this map's work has gone. -->
  {#if data.usedIn.length}
    <p class="credits">
      Used in
      {#each data.usedIn as u, i (u.slug)}
        <a href="/s/{u.slug}">{u.title}</a>{#if u.creator} by {u.creator}{/if}{i < data.usedIn.length - 1 ? ', ' : '.'}
      {/each}
    </p>
  {/if}

  <!-- A TREE, not a flat table. 161 alphabetised rows put a barycentre between two unrelated
       stars and asked nobody to read any of it; the parent/child data was there all along.
       Copying lives on the rows: a branch copies itself and everything under it. -->
  <p class="muted">
    Open a star to see what orbits it. Copy any row to take that object - or that object and
    everything beneath it - into your own campaign in Star System Explorer.
  </p>
  <!-- THE ONE THING A COPY CANNOT BRING (D-72). Beside the COPY controls and deliberately nowhere
       near the download button: the calendar is in the save, so the file is complete. Telling
       somebody their download was missing something when it was not would be the worse bug. -->
  {#if calendars.caveat}
    <p class="caveat">{calendars.caveat}</p>
  {/if}
  <!-- A starmap opens with its stars minimised - sixty stars is the list, each with its summary;
       a single system opens to planet level (owner, 2026-09-05). -->
  <NodeTree
    nodes={[...data.bodies, ...data.constructs]}
    openDepth={s.kind === 'starmap' ? 0 : 1}
    {credits}
    ruleOverrides={(s as { rule_overrides?: Record<string, unknown> }).rule_overrides ?? null}
    source={{
      site: data.site.name, url: data.site.url + '/s/' + s.slug, title: s.title,
      creator: data.creator?.display_name ?? data.creator?.handle ?? null
    }}
  />

  <!-- FIND MORE MAPS WITH: the pills that describe this map as a whole - the creator's own tags
       first, then what the hub derived - below the data and prefaced (owner, 2026-09-05; D-31).
       Useful information, not a useful control up top. The counted roles are left out: the
       summary above already says "9 stations". -->
  {#if findMore.length}
    <div class="find-more">
      <span class="lbl">Find more maps with:</span>
      {#each findMore as t (t.tag)}<a class="tag" class:mine={t.mine} href="/browse?tag={t.tag}">{t.tag}</a>{/each}
    </div>
  {/if}

  <!-- COMMENTS (owner, 2026-09-05). Below the data and above the report: a place to say
       something about the map, not a reason to come here. Registered explorers only, like stars.
       Plain forms, so they work without a script; removal is one click for whoever may. -->
  {#if data.commentsAvailable}
    <section class="comments" id="comments">
      <h2>Comments{#if commentCount} · {commentCount}{/if}</h2>
      {#if data.notice}<p class="notice-line">{data.notice}</p>{/if}
      {#if data.comments.length}
        <ol>
          {#each data.comments as c (c.id)}
            <li>
              <div class="who">
                <b>{c.by}</b>
                <!-- The same two colours as the banner and the review queue (D-74): a role that
                     reads differently in different places makes people doubt all of them. -->
                {#if c.role && c.role !== 'user'}
                  <span class="role" class:mod={c.role === 'moderator'}>{c.role}</span>
                {/if}
                <time datetime={c.created_at}>{c.created_at.slice(0, 10)}</time>
                <span class="who-acts">
                  {#if c.removable}
                    <form method="POST" action="/api/comment">
                      <input type="hidden" name="slug" value={s.slug} />
                      <input type="hidden" name="remove" value={c.id} />
                      <button class="linkish" type="submit">Remove</button>
                    </form>
                  {:else if data.mayComment}
                    <!-- Report ONE comment (D-33): the missing loop now that people can be moderated. -->
                    <form method="POST" action="/api/report">
                      <input type="hidden" name="slug" value={s.slug} />
                      <input type="hidden" name="comment" value={c.id} />
                      <input type="hidden" name="reason" value="content" />
                      <button class="linkish quiet" type="submit" title="Report this comment to the hub">Report</button>
                    </form>
                  {/if}
                </span>
              </div>
              <p class="text">{c.body}</p>
            </li>
          {/each}
        </ol>
      {:else}
        <p class="muted">Nothing yet.</p>
      {/if}
      {#if data.mayComment}
        <form class="panel" method="POST" action="/api/comment">
          <input type="hidden" name="slug" value={s.slug} />
          <label>
            Say something about this map
            <textarea name="body" rows="3" maxlength={COMMENT_MAX} required></textarea>
          </label>
          <button class="primary" type="submit">Post comment</button>
        </form>
      {:else if !data.signedIn}
        <p class="muted"><a href="/login?next=/s/{s.slug}%23comments">Sign in</a> to leave a comment.</p>
      {/if}
    </section>
  {:else if data.notice}
    <p class="notice-line" id="comments">{data.notice}</p>
  {/if}

  <div class="foot-actions">
    <button onclick={() => (reportOpen = !reportOpen)}>Report a problem with this map</button>
  </div>

  <!-- THE CONTROLS WHERE THE MODERATOR ALREADY IS (D-79). Everything here is reachable from /admin;
       this is the same power, closer, because a moderator who has to walk somewhere else to act on
       what they are looking at usually does not. -->
  {#if data.isStaff}
    <div class="panel staff">
      <h3>Moderator</h3>
      {#if form?.holdMessage}<p class="ok">{form.holdMessage}</p>{/if}
      {#if holdNote}
        <p class="muted">On hold: "{holdNote}"</p>
        <form method="POST" action="?/unhold">
          <button type="submit">Take it off hold</button>
        </form>
      {:else}
        <form method="POST" action="?/hold" class="hold-form">
          <label>
            Put this map on hold
            <input name="note" maxlength="500" required
                   placeholder="What is wrong with it - this is what a downloader reads." />
          </label>
          <button type="submit">Hold</button>
        </form>
        <p class="muted small">
          It stays downloadable with your note attached. Use it when a map looks broken rather than
          unwelcome - taking it down is <a href="/admin/explorers">elsewhere</a>, and different.
        </p>
      {/if}
    </div>
  {/if}
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
  h1 { margin: 0 0 2px; font-size: 1.9rem; letter-spacing: -0.02em; }
  /* Quiet, not a warning. This is a fact about the map, not a problem with it - a red banner would
     read as "something is wrong here" and put people off sharing fan work at all. */
  .fan-pill { margin: 0 0 12px; }
  .fan-pill a {
    display: inline-block; padding: 2px 9px; border-radius: 999px; text-decoration: none;
    font-size: 0.8rem; color: var(--ink-faint); border: 1px solid var(--rule);
  }
  .fan-pill a:hover { color: var(--ink); border-color: var(--ink-faint); }
  .fan-work {
    margin: 18px 0; padding: 12px 14px; border: 1px solid var(--rule); border-radius: 8px;
    color: var(--ink-faint); font-size: 0.86rem; line-height: 1.5;
  }
  .fan-work b { color: var(--ink); }
  .by { margin: 0 0 12px; color: var(--ink-faint); }
  /* Words beside the picture when there is room; stacked when there is not. Less air up top. */
  .top { display: grid; gap: 18px; grid-template-columns: minmax(0, 1fr); margin: 0 0 8px; }
  @media (min-width: 1100px) {
    .top { grid-template-columns: minmax(0, 1.15fr) minmax(360px, 0.85fr); align-items: start; }
  }
  .lead .dl, .lead .social { margin: 0 0 8px; }
  .lead .dl { display: flex; gap: 8px; flex-wrap: wrap; }
  .download.open { background: transparent; color: var(--accent); border: 1px solid var(--accent); }
  .download.open:hover { background: var(--panel-2); filter: none; }
  /* THE SAME SHAPE IN THE OTHER COLOUR (D-56), which is the pair the cards already draw: a starmap
     in the accent, a system in ink. A button rather than a link, because it copies rather than goes. */
  .download.paste {
    background: transparent; color: var(--ink); border: 1px solid var(--ink);
    font: inherit; font-size: 1.05rem; font-weight: 650; cursor: pointer;
  }
  .download.paste:hover { background: var(--panel-2); filter: none; }
  .lead .download-note { margin: 0 0 12px; }
  .lead .panel { margin: 12px 0 0; }
  .visual .cover { margin: 0 0 12px; }
  .cover-link { display: block; }
  .cover-link:hover .cover { border-color: var(--accent); }
  .visual .shots { margin: 0; }
  .by .badges { display: inline-flex; gap: 4px; vertical-align: middle; margin: 0 4px; }
  .star {
    display: inline-flex; align-items: center; gap: 8px; font: inherit; font-size: 0.92rem;
    background: var(--panel); color: var(--ink-dim); border: 1px solid var(--edge); border-radius: 8px;
    padding: 6px 12px; cursor: pointer;
  }
  .star svg { width: 16px; height: 16px; fill: none; stroke: currentColor; stroke-width: 1.7; stroke-linejoin: round; }
  .star.on { color: var(--warn); border-color: var(--warn); }
  .star.on svg { fill: currentColor; }
  .star:hover { color: var(--ink); }
  a.star { text-decoration: none; margin-left: 8px; vertical-align: middle; }
  .comments { margin-top: 36px; }
  .comments ol { list-style: none; padding: 0; margin: 0 0 12px; }
  .comments li { border-top: 1px solid var(--edge); padding: 10px 0; }
  .comments .who { display: flex; align-items: baseline; gap: 10px; color: var(--ink-faint); font-size: 0.88rem; }
  .comments .who b { color: var(--ink); font-weight: 600; }
  .comments .who-acts { margin-left: auto; display: inline-flex; gap: 10px; }
  .comments .who form { display: inline; }
  .comments .quiet { color: var(--ink-faint); }
  .comments .text { margin: 6px 0 0; white-space: pre-wrap; overflow-wrap: anywhere; }
  .comments .panel { margin-top: 12px; }
  .notice-line { color: var(--warn); margin: 0 0 12px; }
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
  .facts { display: flex; flex-wrap: wrap; gap: 8px 22px; margin: 0 0 10px; color: var(--ink-dim); }
  .facts b { color: var(--ink); font-variant-numeric: tabular-nums; }
  .facts .density { display: inline-flex; align-items: center; gap: 6px; }
  .roles { color: var(--ink-faint); margin: 0 0 12px; font-size: 0.92rem; display: flex; flex-wrap: wrap; gap: 4px 14px; }
  .rc { display: inline-flex; align-items: center; gap: 5px; white-space: nowrap; }
  .rc :global(.role-icon) { opacity: 0.7; }
  .find-more { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; margin: 18px 0 0; }
  .find-more .lbl { color: var(--ink-faint); font-size: 0.9rem; margin-right: 4px; }
  .find-more a.tag { text-decoration: none; }
  .find-more a.tag.mine { border-color: var(--accent); }
  .find-more a.tag:hover { border-color: var(--accent); color: var(--ink); }
  .credits { color: var(--ink-dim); margin: 0 0 18px; font-size: 0.92rem; }
  .credits p { margin: 0 0 6px; }
  .shared { color: var(--ink-faint); }
  /* The map's pills sit in .find-more, below the data (D-31). */
  .foot-actions { margin-top: 36px; }
  label { display: block; margin: 10px 0; color: var(--ink-dim); }
  select, textarea {
    display: block; width: 100%; margin-top: 4px; font: inherit;
    background: var(--panel-2); color: var(--ink);
    border: 1px solid var(--edge); border-radius: 8px; padding: 8px;
  }
  /* Quiet and beside the copy controls: a fact about what copying does, not a warning. */
  .caveat {
    margin: 0 0 12px; padding: 8px 12px; border-left: 2px solid var(--warn);
    color: var(--ink-dim); font-size: 0.9rem; max-width: 78ch;
  }
  /* A commenter's role, in the banner's colours. */
  .who .role {
    font-size: 0.66rem; text-transform: uppercase; letter-spacing: 0.07em; font-weight: 700;
    padding: 1px 6px; border-radius: 999px;
    background: var(--warn); color: var(--accent-ink);
  }
  .who .role.mod { background: var(--accent); }
  .staff { border-left: 3px solid var(--warn); }
  .staff h3 { margin: 0 0 8px; font-size: 1rem; }
  .hold-form { display: flex; gap: 10px; align-items: end; flex-wrap: wrap; }
  .hold-form label { display: block; color: var(--ink-faint); font-size: 0.85rem; flex: 1 1 30ch; }
  .hold-form input {
    display: block; width: 100%; margin-top: 3px; font: inherit;
    background: var(--panel-2); color: var(--ink);
    border: 1px solid var(--edge); border-radius: 8px; padding: 8px 10px;
  }
  .staff .ok { color: var(--accent); }
  .staff .small { font-size: 0.85rem; margin-top: 8px; }
</style>
