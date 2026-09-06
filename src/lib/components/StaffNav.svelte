<script lang="ts">
  // THE STAFF STRIP: the admin areas, grouped by capability, coloured by tier, with the work
  // waiting on each. It appears under the banner on `/admin/*` only - the eight links used to sit
  // in the banner on every page, which made the chrome of a public map page half staff plumbing.
  //
  // THE COLOUR MEANS ONE THING EACH. Blue is moderation, what a moderator reaches. Amber is
  // running the place, the owner's. Red is the debug uploads: raw, unreviewed bytes from somebody
  // whose app fell over, which is neither of the other two jobs and is why it has its own group
  // between them (owner, 2026-09-06). The key at the end says so, because a colour nobody can read
  // is decoration.
  //
  // A MODERATOR SEES ONLY THEIR OWN AREAS. The nav is not a lock - every page checks for itself -
  // but a link to a 404 is a small insult, so it is not drawn.
  import { GROUPS, areasIn, badgeFor, badgeLabel, visibleTo, type AdminCounts, type StaffTier } from '$lib/adminNav';

  let { counts, path, tier }: { counts: AdminCounts; path: string; tier: StaffTier } = $props();
  const mine = $derived(visibleTo(tier));
</script>

<nav class="staff" aria-label="Staff areas">
  {#each GROUPS as group (group)}
    {#if areasIn(group, mine).length}
      <div class="group" class:group-debug={group === 'Debug'}>
        <span class="name">{group}</span>
        <ul>
          {#each areasIn(group, mine) as area (area.href)}
            {@const n = badgeFor(area, counts)}
            <li>
              <a
                href={area.href}
                class="tier-{area.tier}"
                aria-current={path === area.href ? 'page' : undefined}
              >
                {area.label}
                {#if n !== null}
                  <span class="badge" title="{n} {area.countNoun}">{badgeLabel(n)}</span>
                {/if}
              </a>
            </li>
          {/each}
        </ul>
      </div>
    {/if}
  {/each}

  <!-- Says what the colour means, and only to the person who can see more than one of them. -->
  {#if tier === 'admin'}
    <p class="key">
      <span class="dot tier-moderator"></span> moderators
      <span class="dot tier-admin"></span> the owner
      <span class="dot group-debug"></span> raw uploads
    </p>
  {/if}
</nav>

<style>
  .staff {
    max-width: var(--max);
    margin: 0 auto;
    padding: 10px 20px;
    display: flex;
    align-items: center;
    gap: 26px;
    flex-wrap: wrap;
  }
  .group { display: flex; align-items: center; gap: 10px; }
  .name {
    color: var(--ink-faint);
    font-size: 0.78rem;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    white-space: nowrap;
  }
  ul { list-style: none; display: flex; gap: 6px; margin: 0; padding: 0; flex-wrap: wrap; }

  a {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 4px 10px;
    border-radius: var(--radius);
    border: 1px solid transparent;
    color: var(--ink-dim);
    font-size: 0.92rem;
  }
  a:hover { text-decoration: none; background: var(--panel-2); color: var(--ink); }
  a[aria-current='page'] { background: var(--panel-2); color: var(--ink); }

  /* THE TIER IS THE COLOUR, carried on the left edge so a whole group reads as one band - except
     the debug uploads, which are their own thing and take the red the hub uses for "careful". */
  .tier-moderator { border-left: 2px solid var(--accent); }
  .tier-admin { border-left: 2px solid var(--warn); }
  .group-debug a { border-left-color: var(--bad); color: var(--bad); }
  .group-debug a:hover, .group-debug a[aria-current='page'] { color: var(--bad); }
  .group-debug .name { color: var(--bad); opacity: 0.8; }

  /* The number circle. Nothing is drawn when there is nothing waiting. */
  .badge {
    min-width: 18px;
    height: 18px;
    padding: 0 5px;
    border-radius: 9px;
    background: var(--bad);
    color: #1a0606;
    font-size: 0.74rem;
    font-weight: 700;
    line-height: 18px;
    text-align: center;
  }

  .key { margin: 0 0 0 auto; color: var(--ink-faint); font-size: 0.78rem; display: flex; align-items: center; gap: 6px; }
  .dot { width: 10px; height: 0; border-top: 3px solid; border-radius: 2px; display: inline-block; }
  .key .tier-moderator { color: var(--accent); border-color: var(--accent); }
  .key .tier-admin { color: var(--warn); border-color: var(--warn); margin-left: 10px; }
  .key .group-debug { color: var(--bad); border-color: var(--bad); margin-left: 10px; }

  @media (max-width: 720px) {
    .key { display: none; }
    .staff { gap: 14px; }
  }
</style>
