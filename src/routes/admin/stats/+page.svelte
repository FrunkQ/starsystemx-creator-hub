<script lang="ts">
  // The usage dashboard. One RPC, every panel; no chart library (the page rule: fast to load).
  import { formatBytes } from '$lib/bundle/facets';
  import { R2_FREE_BYTES, LIMITS, TRAFFIC_CATEGORIES, type HubStats, type HubTraffic, type Count } from '$lib/stats';
  let { data } = $props();

  // WHERE IT STARTS TO COST (owner, 2026-09-04). Each meter is drawn to 125% of its allowance so
  // the red line - the free level - sits inside the bar with headroom visible beyond it.
  const today = new Date().toISOString().slice(0, 10);
  const tr = $derived(data.traffic as HubTraffic | null);
  const traffic = $derived(tr?.days ?? []);
  const requestsToday = $derived(traffic.filter((t) => t.day === today).reduce((a, t) => a + Number(t.requests), 0));

  // One row per day: requests and bytes by category, bytes in, bytes out.
  type Day = { requests: number; out: number; in: number; bytesBy: Record<string, number>; reqBy: Record<string, number> };
  const byDay = $derived.by(() => {
    const m = new Map<string, Day>();
    for (const t of traffic) {
      const d = m.get(t.day) ?? { requests: 0, out: 0, in: 0, bytesBy: {}, reqBy: {} };
      d.requests += Number(t.requests);
      d.out += Number(t.bytes);
      d.in += Number(t.bytes_in);
      d.bytesBy[t.category] = (d.bytesBy[t.category] ?? 0) + Number(t.bytes);
      d.reqBy[t.category] = (d.reqBy[t.category] ?? 0) + Number(t.requests);
      m.set(t.day, d);
    }
    return [...m.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1));
  });
  const busiestDay = $derived(byDay.reduce((a, [, d]) => Math.max(a, d.requests), 0));
  const month = $derived(tr?.month);

  // THE CHART: bytes out stacked upward by kind, bytes in downward, one column per day, 31 days.
  const chart = $derived.by(() => {
    const cols = [...byDay].reverse().slice(-31);
    const peak = Math.max(1, ...cols.map(([, d]) => Math.max(d.out, d.in)));
    const W = 620, H = 150, base = 100, colW = W / 31;
    return {
      W, H, base,
      peak,
      cols: cols.map(([day, d], i) => {
        let y = base;
        const segments = TRAFFIC_CATEGORIES.filter((c) => c !== 'upload').map((c) => {
          const h = ((d.bytesBy[c] ?? 0) / peak) * (base - 6);
          y -= h;
          return { c, y, h };
        });
        return { day, x: (31 - cols.length + i) * colW + 1, w: colW - 2, segments, inH: (d.in / peak) * (H - base - 6) };
      })
    };
  });
  const COLOURS: Record<string, string> = { page: 'var(--accent)', api: '#9aa6bf', asset: '#7fd1a8', download: '#ffe08a', upload: '#ff8080' };
  const project = (used: number) => {
    const elapsed = Math.max(1, Number(month?.days_elapsed ?? 1));
    return Math.round((used / elapsed) * Number(month?.days_in_month ?? 30));
  };

  const s = $derived(data.stats as HubStats | null);
  const n = (v: Count | null | undefined) => Number(v ?? 0);
  const fmt = (v: Count | null | undefined) => n(v).toLocaleString('en-GB');

  // A sparkline is a polyline over twelve weekly values, scaled to its own maximum.
  function points(values: number[]): string {
    const max = Math.max(1, ...values);
    const w = 140, h = 30;
    const step = w / Math.max(1, values.length - 1);
    return values.map((v, i) => (i * step).toFixed(1) + ',' + (h - 2 - (v / max) * (h - 4)).toFixed(1)).join(' ');
  }
  type GrowthKey = 'creators' | 'maps' | 'uploads' | 'refusals' | 'downloads' | 'visitors';
  const series = (key: GrowthKey) => (s?.growth ?? []).map((g) => n(g[key]));
  const sum = (key: GrowthKey) => series(key).reduce((a, b) => a + b, 0);

  const storageUsed = $derived(n(s?.storage.asset_bytes) + n(s?.storage.bundle_bytes));
  const storagePct = $derived(Math.min(100, (storageUsed / R2_FREE_BYTES) * 100));

  const age = (iso: string | null) => {
    if (!iso) return '';
    const days = Math.floor((Date.now() - Date.parse(iso)) / 864e5);
    return days === 0 ? 'today' : days === 1 ? '1 day' : days + ' days';
  };
</script>

<svelte:head><title>Usage - admin</title></svelte:head>

{#snippet meter(label: string, used: number, limit: number, note: string, show: (v: number) => string)}
  {@const pct = (used / limit) * 100}
  <div class="meter" class:warn={pct > 70} class:bad={pct >= 100}>
    <div class="head"><span>{label}</span><b>{show(used)} <em>of {show(limit)}</em></b></div>
    <div class="track">
      <div class="fill" style="width: {Math.min(125, pct) * 0.8}%"></div>
      <div class="line" title="the free level"></div>
    </div>
    <div class="note">{pct.toFixed(pct < 10 ? 2 : 0)}% · {note}</div>
  </div>
{/snippet}

<h1>Usage</h1>

{#if data.problem}
  <div class="panel notice bad">
    <h3>The statistics function is not available</h3>
    <p>{data.problem}</p>
    <p>If this is a fresh database, run <code>db/migrations/0014_stream_f_and_stats.sql</code> in the
      Supabase SQL editor - it creates <code>hub_stats()</code> and the download-events table.</p>
  </div>
{:else if s}
  <p class="muted">
    Last {data.days} days ·
    <a href="?days=7">7</a> · <a href="?days=30">30</a> · <a href="?days=90">90</a> · <a href="?days=365">365</a>
    · generated {new Date(s.generated_at).toLocaleString('en-GB')}
  </p>

  <div class="tiles">
    <div class="tile"><b>{fmt(s.totals.creators)}</b><span>explorers</span></div>
    <div class="tile"><b>{fmt(s.totals.maps_public)}</b><span>maps public <em>of {fmt(s.totals.maps_all)}</em></span></div>
    <div class="tile"><b>{fmt(s.totals.downloads)}</b><span>downloads, all time</span></div>
    <div class="tile"><b>{fmt(s.totals.downloads_period)}</b><span>downloads, {data.days} days</span></div>
    <div class="tile"><b>{fmt(s.totals.visitors_period)}</b><span>distinct visitors <em>{data.days > 7 ? 'visitor-weeks' : 'this week'}</em></span></div>
    <div class="tile"><b>{fmt(s.totals.uploads_period)}</b><span>uploads, {data.days} days</span></div>
    <div class="tile" class:warn={n(s.totals.refusals_period) > 0}><b>{fmt(s.totals.refusals_period)}</b><span>refused uploads</span></div>
    <div class="tile"><b>{fmt(s.totals.hearts)}</b><span>stars</span></div>
  </div>

  <h2>Growth, last twelve weeks</h2>
  <div class="sparks">
    {#each [['downloads', 'Downloads'], ['visitors', 'Visitors'], ['maps', 'New maps'], ['creators', 'New explorers'], ['uploads', 'Uploads'], ['refusals', 'Refusals']] as [key, label]}
      {@const values = series(key as GrowthKey)}
      <div class="spark">
        <svg viewBox="0 0 140 30" preserveAspectRatio="none"><polyline points={points(values)} /></svg>
        <div><b>{fmt(sum(key as GrowthKey))}</b> {label}</div>
      </div>
    {/each}
  </div>
  <div class="scroll">
    <table>
      <thead><tr><th>Week of</th><th>Explorers</th><th>Maps</th><th>Uploads</th><th>Refusals</th><th>Downloads</th><th>Visitors</th></tr></thead>
      <tbody>
        {#each [...s.growth].reverse() as g (g.week)}
          <tr>
            <td>{g.week}</td><td>{fmt(g.creators)}</td><td>{fmt(g.maps)}</td><td>{fmt(g.uploads)}</td>
            <td class:bad={n(g.refusals) > 0}>{fmt(g.refusals)}</td><td>{fmt(g.downloads)}</td><td>{fmt(g.visitors)}</td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>

  <div class="two">
    <section>
      <h2>Most downloaded maps</h2>
      {#if s.top_maps.length}
        <table>
          <thead><tr><th>Map</th><th>By</th><th>All</th><th>{data.days}d</th><th>Stars</th></tr></thead>
          <tbody>
            {#each s.top_maps as m (m.slug)}
              <tr>
                <td><a href="/s/{m.slug}">{m.title}</a></td><td>{m.handle}</td>
                <td>{fmt(m.download_count)}</td><td>{fmt(m.downloads_period)}</td><td>{fmt(m.hearts_count)}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      {:else}<p class="muted">Nothing public yet.</p>{/if}
    </section>

    <section>
      <h2>Cartographers</h2>
      {#if s.top_creators.length}
        <table>
          <thead><tr><th>Explorer</th><th>Maps</th><th>Downloads</th><th>Stars</th><th>Stored</th></tr></thead>
          <tbody>
            {#each s.top_creators as c (c.handle)}
              <tr><td>{c.handle}</td><td>{fmt(c.maps)}</td><td>{fmt(c.downloads)}</td><td>{fmt(c.hearts)}</td><td>{formatBytes(n(c.bundle_bytes))}</td></tr>
            {/each}
          </tbody>
        </table>
      {:else}<p class="muted">Nobody has uploaded yet.</p>{/if}
    </section>
  </div>

  <h2>Where it starts to cost</h2>
  <p class="muted">
    The red line is the free level. Bandwidth out of Cloudflare is free and has no line; the
    database-to-Worker traffic Supabase meters (5 GB a month) cannot be measured from here.
    {#if !tr}<strong>Request counting starts once migrations 0016 and 0017 have run.</strong>{/if}
  </p>
  <div class="meters">
    {@render meter('Requests today', requestsToday, LIMITS.workersRequestsPerDay, 'Workers free plan, per day, resets at midnight UTC', fmt)}
    {@render meter('Busiest day, last month', busiestDay, LIMITS.workersRequestsPerDay, 'the day that came closest', fmt)}
    {@render meter('Stored', storageUsed, LIMITS.r2Bytes, fmt(s.storage.asset_count) + ' assets ' + formatBytes(n(s.storage.asset_bytes)) + ' · ' + fmt(s.storage.bundle_count) + ' bundles ' + formatBytes(n(s.storage.bundle_bytes)), formatBytes)}
    {@render meter('R2 reads this month', project(n(month?.reads)), LIMITS.r2ReadsPerMonth, 'assets and downloads served, projected to month end (' + fmt(month?.reads) + ' so far)', fmt)}
    {@render meter('R2 writes this month', project(n(month?.writes)), LIMITS.r2WritesPerMonth, 'assets and bundles stored, projected (' + fmt(month?.writes) + ' so far)', fmt)}
    {@render meter('Database', n(s.storage.db_bytes), LIMITS.supabaseDbBytes, 'Supabase free plan', formatBytes)}
  </div>
  <h2>Data transfer</h2>
  <p class="muted">
    This month: <b>{formatBytes(n(month?.bytes))}</b> out over {fmt(month?.requests)} requests,
    <b>{formatBytes(n(month?.bytes_in))}</b> in. Pages count as transfer - with clips, most of what
    leaves may leave through a page rather than a download. Free on Cloudflare, and worth watching:
    it grows before everything else does.
  </p>

  {#if chart.cols.length}
    <div class="chart">
      <svg viewBox="0 0 {chart.W} {chart.H}" preserveAspectRatio="none" role="img" aria-label="Bytes out and in per day">
        <line x1="0" y1={chart.base} x2={chart.W} y2={chart.base} class="axis" />
        {#each chart.cols as col (col.day)}
          {#each col.segments as seg (seg.c)}
            {#if seg.h > 0}<rect x={col.x} y={seg.y} width={col.w} height={seg.h} fill={COLOURS[seg.c]}><title>{col.day} {seg.c}</title></rect>{/if}
          {/each}
          {#if col.inH > 0}<rect x={col.x} y={chart.base + 1} width={col.w} height={col.inH} fill={COLOURS.upload}><title>{col.day} in</title></rect>{/if}
        {/each}
      </svg>
      <div class="legend">
        <span>peak day {formatBytes(chart.peak)}</span>
        {#each TRAFFIC_CATEGORIES as c}<span><i style="background: {COLOURS[c]}"></i>{c === 'upload' ? 'uploads (in)' : c + 's'}</span>{/each}
      </div>
    </div>
  {/if}

  {#if byDay.length}
    <div class="scroll">
      <table>
        <thead><tr><th>Day</th><th>Requests</th><th>Pages</th><th>API</th><th>Assets</th><th>Downloads</th><th>Uploads</th><th>Out</th><th>In</th></tr></thead>
        <tbody>
          {#each byDay.slice(0, 14) as [day, d] (day)}
            <tr class:bad={d.requests > LIMITS.workersRequestsPerDay}>
              <td>{day}</td><td>{fmt(d.requests)}</td>
              <td>{fmt(d.reqBy.page)}</td><td>{fmt(d.reqBy.api)}</td><td>{fmt(d.reqBy.asset)}</td><td>{fmt(d.reqBy.download)}</td><td>{fmt(d.reqBy.upload)}</td>
              <td>{formatBytes(d.out)}</td><td>{formatBytes(d.in)}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}

  <div class="two">
    <section>
      <h2>Refused uploads, {data.days} days</h2>
      {#if s.failures.length}
        <table>
          <thead><tr><th>Reason</th><th>Count</th></tr></thead>
          <tbody>{#each s.failures as f (f.reason)}<tr><td><code>{f.reason}</code></td><td>{fmt(f.n)}</td></tr>{/each}</tbody>
        </table>
      {:else}<p class="muted">None recorded. Refusals are logged from 0.6.0 on; older ones were never kept.</p>{/if}
    </section>

    <section>
      <h2>Moderation</h2>
      <p>
        <b>{fmt(s.queue.pending)}</b> pictures awaiting review
        {#if n(s.queue.flagged)}({fmt(s.queue.flagged)} flagged){/if}
        {#if s.queue.oldest_pending}· oldest waiting {age(s.queue.oldest_pending)}{/if}
        {#if n(s.queue.pending)}· <a href="/admin/review">review</a>{/if}
      </p>
      <p><b>{fmt(s.queue.open_reports)}</b> open reports {#if n(s.queue.open_reports)}· <a href="/admin/reports">read</a>{/if}</p>
    </section>
  </div>
{/if}

<style>
  h1 { margin: 0 0 6px; }
  h2 { margin: 28px 0 8px; font-size: 1.1rem; }
  .muted { color: var(--ink-dim); margin: 0 0 12px; }
  .tiles { display: grid; gap: 10px; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); margin: 16px 0; }
  .tile { background: var(--panel); border: 1px solid var(--edge); border-radius: var(--radius); padding: 12px 14px; }
  .tile b { display: block; font-size: 1.5rem; font-variant-numeric: tabular-nums; letter-spacing: -0.02em; }
  .tile span { color: var(--ink-dim); font-size: 0.85rem; }
  .tile em { color: var(--ink-faint); font-style: normal; }
  .tile.warn b { color: var(--warn); }
  .sparks { display: grid; gap: 10px; grid-template-columns: repeat(auto-fill, minmax(170px, 1fr)); margin: 0 0 14px; }
  .spark { background: var(--panel); border: 1px solid var(--edge); border-radius: var(--radius); padding: 10px 12px; }
  .spark svg { width: 100%; height: 34px; display: block; margin-bottom: 4px; }
  .spark polyline { fill: none; stroke: var(--accent); stroke-width: 1.5; vector-effect: non-scaling-stroke; }
  .spark div { color: var(--ink-dim); font-size: 0.85rem; }
  .spark b { color: var(--ink); font-variant-numeric: tabular-nums; }
  .scroll { overflow-x: auto; }
  table { border-collapse: collapse; width: 100%; font-size: 0.92rem; }
  th, td { text-align: left; padding: 6px 10px; border-bottom: 1px solid var(--edge); font-variant-numeric: tabular-nums; }
  th { color: var(--ink-faint); font-weight: 500; font-size: 0.82rem; }
  td.bad { color: var(--bad); }
  .two { display: grid; gap: 22px; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); }
  .meters { display: grid; gap: 12px; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); margin: 0 0 14px; }
  .meter { background: var(--panel); border: 1px solid var(--edge); border-radius: var(--radius); padding: 10px 12px; }
  .meter .head { display: flex; justify-content: space-between; gap: 10px; font-size: 0.9rem; color: var(--ink-dim); }
  .meter .head b { color: var(--ink); font-variant-numeric: tabular-nums; white-space: nowrap; }
  .meter .head em { color: var(--ink-faint); font-style: normal; font-weight: 400; }
  .track { position: relative; height: 10px; background: var(--panel-2); border: 1px solid var(--edge); border-radius: 6px; margin: 8px 0 6px; overflow: hidden; }
  .fill { height: 100%; background: var(--accent); }
  .meter.warn .fill { background: var(--warn); }
  .meter.bad .fill { background: var(--bad); }
  /* THE RED LINE: the free level, at 80% of the track so the headroom beyond it is visible. */
  .line { position: absolute; top: -1px; bottom: -1px; left: 80%; width: 2px; background: var(--bad); }
  .meter .note { color: var(--ink-faint); font-size: 0.8rem; }
  tr.bad td { color: var(--bad); }
  .chart { background: var(--panel); border: 1px solid var(--edge); border-radius: var(--radius); padding: 10px 12px; margin: 0 0 14px; }
  .chart svg { width: 100%; height: 150px; display: block; }
  .chart .axis { stroke: var(--edge); stroke-width: 1; }
  .legend { display: flex; flex-wrap: wrap; gap: 14px; margin-top: 8px; color: var(--ink-faint); font-size: 0.8rem; }
  .legend i { display: inline-block; width: 10px; height: 10px; border-radius: 2px; margin-right: 5px; vertical-align: -1px; }
  code { background: var(--panel-2); border: 1px solid var(--edge); border-radius: 4px; padding: 1px 5px; font-size: 0.85em; }
</style>
