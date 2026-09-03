<script lang="ts">
  // The usage dashboard. One RPC, every panel; no chart library (the page rule: fast to load).
  import { formatBytes } from '$lib/bundle/facets';
  import { R2_FREE_BYTES, type HubStats, type Count } from '$lib/stats';
  let { data } = $props();

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
    <div class="tile"><b>{fmt(s.totals.hearts)}</b><span>hearts</span></div>
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
          <thead><tr><th>Map</th><th>By</th><th>All</th><th>{data.days}d</th><th>Hearts</th></tr></thead>
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
          <thead><tr><th>Explorer</th><th>Maps</th><th>Downloads</th><th>Hearts</th><th>Stored</th></tr></thead>
          <tbody>
            {#each s.top_creators as c (c.handle)}
              <tr><td>{c.handle}</td><td>{fmt(c.maps)}</td><td>{fmt(c.downloads)}</td><td>{fmt(c.hearts)}</td><td>{formatBytes(n(c.bundle_bytes))}</td></tr>
            {/each}
          </tbody>
        </table>
      {:else}<p class="muted">Nobody has uploaded yet.</p>{/if}
    </section>
  </div>

  <h2>Storage</h2>
  <div class="bar"><div class="fill" style="width: {storagePct.toFixed(1)}%" class:warn={storagePct > 70} class:bad={storagePct > 90}></div></div>
  <p class="muted">
    <b>{formatBytes(storageUsed)}</b> of the {formatBytes(R2_FREE_BYTES)} free allowance ({storagePct.toFixed(1)}%) ·
    {fmt(s.storage.asset_count)} assets, {formatBytes(n(s.storage.asset_bytes))} ·
    {fmt(s.storage.bundle_count)} bundles, {formatBytes(n(s.storage.bundle_bytes))}
  </p>

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
  .bar { height: 10px; background: var(--panel-2); border: 1px solid var(--edge); border-radius: 6px; overflow: hidden; margin: 6px 0; }
  .fill { height: 100%; background: var(--accent); }
  .fill.warn { background: var(--warn); }
  .fill.bad { background: var(--bad); }
  code { background: var(--panel-2); border: 1px solid var(--edge); border-radius: 4px; padding: 1px 5px; font-size: 0.85em; }
</style>
