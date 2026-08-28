<script lang="ts">
  // A copy-paste JSON snippet for one node. Secondary to the download by design (design 2), so it
  // is collapsed: it must never compete for attention with the one-click download above it.
  let { name, snippet }: { name: string; snippet: unknown } = $props();

  let copied = $state(false);
  const text = $derived(JSON.stringify(snippet, null, 2));

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      copied = true;
      setTimeout(() => (copied = false), 1600);
    } catch {
      copied = false; // a denied clipboard permission is not an error worth shouting about
    }
  }
</script>

<details>
  <summary>{name}</summary>
  <div class="row">
    <button onclick={copy}>{copied ? 'Copied' : 'Copy JSON'}</button>
  </div>
  <pre><code>{text}</code></pre>
</details>

<style>
  details {
    border: 1px solid var(--edge); border-radius: var(--radius);
    background: var(--panel); margin: 8px 0; padding: 10px 14px;
  }
  summary { cursor: pointer; font-weight: 550; }
  .row { margin: 10px 0; }
</style>
