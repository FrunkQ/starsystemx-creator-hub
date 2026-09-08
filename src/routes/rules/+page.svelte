<script lang="ts">
  // THE CUSTOM RULES LIBRARY (D-71). Everything anybody has invented, copyable.
  //
  // The owner: *"the site has a browse option for all these custom overrides... and they can be
  // copied and pasted in using the mechanism from 1."* So every Copy here produces the SAME
  // `sseClip` a map page's Copy produces - rules and no objects - and the paste on the far side is
  // one code path either way.
  import { buildRulesClip, clipText } from '$lib/bundle/clip';
  import { overridesFrom, KIND_LABEL, KIND_PLURAL, type OverrideKind } from '$lib/bundle/overrides';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();

  let copied = $state<string | null>(null);
  let open = $state<string | null>(null);

  const href = (kind: string) => (kind ? '/rules?kind=' + encodeURIComponent(kind) : '/rules');

  async function copy(row: PageData['rows'][number], versionIndex: number) {
    const version = row.versions[versionIndex];
    const from = data.maps[version.systems[0]];
    const clip = buildRulesClip(
      {
        site: data.site.name,
        // The MAP it came from, not this page: a credit that points at a library index tells
        // nobody whose work it was.
        url: from ? data.site.url + '/s/' + from.slug : data.site.url + '/rules',
        title: from?.title ?? 'the rules library'
      },
      overridesFrom([{ kind: row.kind, key: row.key, label: row.label, whole: row.whole, def: version.def }])
    );
    if (!clip) return;
    const id = row.id + ':' + versionIndex;
    try {
      await navigator.clipboard.writeText(clipText(clip));
      copied = id;
      setTimeout(() => { if (copied === id) copied = null; }, 2000);
    } catch {
      copied = null;
    }
  }
</script>

<svelte:head>
  <title>Custom rules - {data.site.name}</title>
  <meta name="description" content="Custom liquids, gases, atmosphere mixes, biospheres, fuels, engines and sensors that cartographers here have made. Copy one straight into your own campaign." />
</svelte:head>

<h1>Custom rules</h1>
<p class="lede">
  The liquids, gases, atmosphere mixes, biospheres, fuels, engines and sensors that cartographers
  here have invented for their own campaigns. Copy one and paste it into yours - it goes in the same
  way an object does, and if you already have it, nothing happens.
</p>

{#if !data.total}
  <div class="panel notice">
    <h3>Nothing here yet</h3>
    <p>
      When somebody publishes a map with a custom liquid or engine in it, it appears here.
      <a href="/browse">Browse the maps</a> in the meantime.
    </p>
  </div>
{:else}
  <div class="kinds">
    <a class="tag" class:on={!data.kind} href={href('')}>all<span class="n">{data.total}</span></a>
    {#each data.kinds as k (k.kind)}
      <a class="tag" class:on={data.kind === k.kind} href={href(k.kind)}>
        {k.label}<span class="n">{k.n}</span>
      </a>
    {/each}
  </div>

  <div class="rows">
    {#each data.rows as row (row.id)}
      <div class="rule">
        <div class="head">
          <span class="kind">{KIND_LABEL[row.kind as OverrideKind]}</span>
          <strong>{row.label}</strong>
          {#if row.label !== row.key}<code>{row.key}</code>{/if}
          {#if !row.whole}
            <!-- A delta on a shipped definition, not a new thing. The hub cannot tell which without
                 the base pack, so it says what it can see rather than guessing (D-71). -->
            <span class="tag muted-tag" title="Changed fields on a rule the app already ships, rather than a new one">a change</span>
          {/if}
        </div>

        {#each row.versions as version, i (i)}
          <div class="version">
            <p class="from">
              {#if row.versions.length > 1}<span class="which">Version {i + 1}</span>{/if}
              <span class="muted">from</span>
              {#each version.systems as id, j (id)}
                {#if data.maps[id]}<a href="/s/{data.maps[id].slug}">{data.maps[id].title}</a>{/if}{j < version.systems.length - 1 ? ', ' : ''}
              {/each}
            </p>
            <div class="acts">
              <button onclick={() => copy(row, i)}>
                {copied === row.id + ':' + i ? 'Copied' : 'Copy for Star System Explorer'}
              </button>
              <button class="linkish" onclick={() => (open = open === row.id + ':' + i ? null : row.id + ':' + i)}>
                {open === row.id + ':' + i ? 'Hide' : 'What is in it'}
              </button>
            </div>
            {#if open === row.id + ':' + i}
              <!-- The definition itself. It is somebody's data and the honest thing is to let a
                   person read it before they paste it into their campaign. -->
              <pre>{JSON.stringify(version.def, null, 2)}</pre>
            {/if}
          </div>
        {/each}
      </div>
    {/each}
  </div>

  <p class="muted foot">
    Pasting one adds it to your campaign only if you do not already have it. Something of yours with
    the same name is never overwritten.
  </p>
{/if}

<style>
  h1 { margin: 0 0 6px; font-size: 1.9rem; letter-spacing: -0.02em; }
  .lede { color: var(--ink-dim); max-width: 70ch; margin: 0 0 18px; }
  .kinds { display: flex; flex-wrap: wrap; gap: 6px; margin: 0 0 18px; }
  .kinds a.tag { text-decoration: none; }
  .kinds a.tag.on { background: var(--accent); color: var(--accent-ink); border-color: transparent; }
  .n { opacity: 0.6; margin-left: 6px; font-variant-numeric: tabular-nums; }
  .rows { display: grid; gap: 12px; }
  .rule { background: var(--panel); border: 1px solid var(--edge); border-radius: var(--radius); padding: 12px 14px; }
  .head { display: flex; flex-wrap: wrap; gap: 8px; align-items: baseline; }
  .kind {
    font-size: 0.68rem; text-transform: uppercase; letter-spacing: 0.07em; font-weight: 700;
    color: var(--ink-faint);
  }
  .head code { background: var(--panel-2); border: 1px solid var(--edge); border-radius: 4px; padding: 0 5px; font-size: 0.8rem; color: var(--ink-faint); }
  .muted-tag { color: var(--ink-faint); font-size: 0.72rem; }
  .version { margin-top: 8px; padding-top: 8px; border-top: 1px solid var(--edge); }
  .version:first-of-type { border-top: 0; }
  .from { margin: 0 0 6px; font-size: 0.9rem; color: var(--ink-dim); }
  .which { font-weight: 600; color: var(--ink); margin-right: 4px; }
  .acts { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; }
  pre { margin-top: 10px; max-height: 40vh; overflow: auto; }
  .foot { margin-top: 18px; font-size: 0.9rem; }
</style>
