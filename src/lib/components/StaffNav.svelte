<script lang="ts">
  // THE STAFF STRIP: the admin areas, grouped by capability, coloured by tier, with the work
  // waiting on each. It appears under the banner on `/admin/*` only - the eight links used to sit
  // in the banner on every page, which made the chrome of a public map page half staff plumbing.
  //
  // The colour is the tier, and it means one thing: BLUE IS MODERATION, what somebody who watches
  // the content will be able to reach; AMBER IS RUNNING THE PLACE, what only the owner reaches.
  // The key at the end says so, because a colour nobody can read is decoration.
  import { GROUPS, areasIn, badgeFor, badgeLabel, ADMIN_AREAS, type AdminCounts } from '$lib/adminNav';

  let { counts, path }: { counts: AdminCounts; path: string } = $props();
</script>

<nav class="staff" aria-label="Staff areas">
  {#each GROUPS as group (group)}
    <div class="group">
      <span class="name">{group}</span>
      <ul>
        {#each areasIn(group, ADMIN_AREAS) as area (area.href)}
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
  {/each}

  <!-- Says what the colour means. There is no moderator ROLE yet (creator_role is user | admin);
       this is the shape one would have, drawn so the decision can be made by looking at it. -->
  <p class="key">
    <span class="dot tier-moderator"></span> a moderator could do
    <span class="dot tier-admin"></span> the owner only
  </p>
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

  /* THE TIER IS THE COLOUR, carried on the left edge so a whole group reads as one band. */
  .tier-moderator { border-left: 2px solid var(--accent); }
  .tier-admin { border-left: 2px solid var(--warn); }

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

  @media (max-width: 720px) {
    .key { display: none; }
    .staff { gap: 14px; }
  }
</style>
