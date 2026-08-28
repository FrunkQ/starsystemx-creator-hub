<script lang="ts">
  // The cover image is the ONLY picture on the hub (decision 3). No rendered preview, no engine.
  interface System {
    slug: string;
    title: string;
    summary: string | null;
    kind: string;
    cover_sha256: string | null;
    hearts_count: number;
    download_count: number;
  }
  let { system }: { system: System } = $props();
</script>

<a class="card" href="/s/{system.slug}">
  {#if system.cover_sha256}
    <!-- Served through the ledger-checking route. A withheld cover simply 404s and the browser
         shows the alt text, which is honest rather than broken. -->
    <img class="cover" src="/asset/{system.cover_sha256}" alt="" loading="lazy" decoding="async" />
  {:else}
    <div class="cover-fallback">{system.kind === 'starmap' ? 'Campaign' : 'System'}</div>
  {/if}
  <div class="body">
    <h3>{system.title}</h3>
    {#if system.summary}<p>{system.summary}</p>{/if}
    <div class="meta">
      <span>{system.hearts_count} hearts</span>
      <span>{system.download_count} downloads</span>
    </div>
  </div>
</a>

<style>
  a.card { color: inherit; }
  a.card:hover { text-decoration: none; border-color: var(--accent); }
</style>
