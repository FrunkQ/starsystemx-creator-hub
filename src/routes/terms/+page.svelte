<script lang="ts">
  let { data } = $props();
  // The terms, as written and owner-signed-off 2026-08-28.
  //
  // TWO THINGS NOT TO "TIDY":
  //  1. The plain-English voice is deliberate and was signed off in this form. It is not a draft of
  //     something more legalistic. Do not add a governing-law clause, an arbitration clause or GDPR
  //     recitals - their absence is a decision, recorded in docs/decisions.md D-15.
  //  2. LAST_UPDATED is the version. The terms say "the current version is always the one on this
  //     page, dated", so that date IS the mechanism. Change the text, change the date.
  import TakedownAddress from '$lib/components/TakedownAddress.svelte';

  const LAST_UPDATED = '28 August 2026';
</script>

<svelte:head>
  <title>Terms of use - {data.site.name}</title>
  <meta name="description" content="The terms for sharing and downloading star systems here." />
</svelte:head>

<article class="prose">
  <h1>Terms of use</h1>
  <p class="dated">Last updated {LAST_UPDATED}</p>

  <h2>What this is</h2>
  <p>
    {data.site.name} is a place to share star systems and campaigns built with Star System Explorer,
    so other people can download them and play. It is free, it is small, and it is run by the same
    person who makes the app.
  </p>

  <h2>Your stuff stays yours</h2>
  <p>
    Uploading here does not transfer ownership of anything. You grant us just enough licence to host
    your upload, show its page, and hand copies to anyone who downloads it — which is the entire
    point of uploading it. Delete your upload and that licence ends with it.
  </p>

  <h2>You are responsible for what you upload — entirely</h2>
  <p>
    When you publish something here you are telling us, and everyone who downloads it, that you have
    the right to share every part of it: every image, every 3D model, every word. The app builds an
    attributions file into every bundle and the hub will not publish one whose art has no recorded
    source — but the record being <em>filled in</em> is your claim, not our check. If something you
    upload turns out to be someone else's, that is between you and them; we will remove it when we
    learn of it, and repeat offenders lose the account.
  </p>

  <h2 id="keep-it-tabletop-safe">Keep it tabletop-safe</h2>
  <p>
    This is a place for star maps, not a file host. No pornography or sexual content, no real-world
    hate, no malware, no doxxing, nothing illegal, and no using the hub as generic storage for things
    that are not playable content. Celestial bodies are not nude.
  </p>

  <h2>We can remove things and people, and we do not owe a debate</h2>
  <p>
    Content can be removed and accounts suspended or banned at our discretion — for anything in the
    list above, for copyright problems, or for behaviour that makes the place worse: spam, harassment
    of other explorers, gaming the limits, or being persistently, deliberately annoying. We will
    usually say why, because that is decent, but this is a free service run by one person and the
    discretion is real. A banned image stays banned even if the account that uploaded it is deleted.
  </p>

  <h2>We know almost nothing about you, on purpose</h2>
  <p>
    An account is an email address and whatever name you choose to show. We do not want your real
    name, we do not sell anything about you, and we run the minimum analytics needed to keep the site
    standing.
  </p>

  <h2>Deleting your account deletes everything about you and everything you uploaded</h2>
  <p>
    There is one deliberate delay: deletion takes effect after a seven-day hold, in case the request
    came from a hijacked account rather than from you — say so if you want it faster and can show it
    is really you. Two honest limits: where another explorer independently uploaded the same file for
    their own map, their copy is their upload and stays; and copies people downloaded before you
    deleted are on their machines and beyond anyone's reach. Sharing between maps is something people
    do by hand here — we do not track it and we are not going to chase it.
  </p>

  <h2 id="takedown">Copyright owners: tell us</h2>
  <p>
    If something here is yours and should not be, use the takedown address on this page, with a
    subject line starting <code>SSE TAKEDOWN REQUEST:</code> — that prefix is what gets it seen fast.
    Include a link to the page and enough detail to identify what is yours. A real person reads that
    inbox and acts promptly. You do not need an account to report something.
  </p>
  <TakedownAddress />

  <h2>No promises</h2>
  <p>
    The hub is provided as-is: no uptime guarantee, no warranty, and no liability for what you
    download — read the attributions file that travels with every bundle and judge for yourself.
    Limits (upload sizes, daily quotas, what file types are accepted) exist and can change without
    notice, including tightening sharply if the place is being abused.
  </p>

  <h2>Age</h2>
  <p>You must be old enough to agree to terms like these where you live.</p>

  <h2>Changes</h2>
  <p>
    These terms can change; the current version is always the one on this page, dated. Using the hub
    after a change means accepting it — which is standard, and also the only enforcement mechanism a
    free site with anonymous users actually has.
  </p>

  <h2>A last word</h2>
  <p>
    This hub exists because making star maps is fun and sharing them should be too. It is run by one
    person, for the love of it, and it earns nothing. If abuse ever makes it more work than joy, it
    will simply be shut down — so whoever is spoiling it is spoiling it for everyone.
    <strong>Be the reason it stays up.</strong>
  </p>
</article>

<style>
  .prose { max-width: 68ch; }
  .prose h1 { margin: 0 0 4px; }
  .dated { color: var(--ink-faint); margin: 0 0 28px; font-size: 0.9rem; }
  .prose h2 { margin: 28px 0 8px; font-size: 1.05rem; }
  .prose p { color: var(--ink-dim); margin: 0; }
  .prose strong { color: var(--ink); }
  .prose code {
    background: var(--panel-2); border: 1px solid var(--edge);
    border-radius: 4px; padding: 1px 5px; font-size: 0.9em; color: var(--ink);
  }
</style>
