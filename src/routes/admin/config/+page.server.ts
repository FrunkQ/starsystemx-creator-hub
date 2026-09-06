import type { PageServerLoad, Actions } from './$types';
import { error, fail } from '@sveltejs/kit';
import { db, authClient } from '$lib/server/db';
import { loadGates } from '$lib/server/config';
import { loadSite } from '$lib/server/site';
import * as audit from '$lib/server/audit';
import { isDiscordWebhook } from '$lib/server/integrations/share';
import { postShare } from '$lib/server/integrations/discord';
import { readCache, shippedManifest } from '$lib/server/shippedContent';
import { sendMail, adminAddresses } from '$lib/server/mail';

export const load: PageServerLoad = async ({ platform, locals, url }) => {
  const env = platform?.env;
  if (!env) throw error(500, 'not configured');
  if (locals.viewer?.role !== 'admin') throw error(404, 'Not found');

  const sb = db(env);
  const [{ data }, gates, cache, site] = await Promise.all([
    sb.from('config').select('key, value, note, updated_at').order('key'),
    loadGates(sb),
    readCache(env),
    loadSite(sb, url)
  ]);
  // WHO THE HUB WOULD WRITE TO, shown rather than left to be guessed at (D-50). The owner asked
  // "where?" when told to set `mail_admin`, which is a fair question about a row nobody can see
  // the effect of - so the page says the address it would use, and where that address came from.
  const to = await adminAddresses(sb, gates);

  // What the hub currently believes SSE ships, and when it last managed to ask (D-36).
  return {
    rows: data ?? [],
    mail: {
      canSend: !!env.RESEND_API_KEY,
      from: gates.mail_from,
      to,
      /** True when the addresses came from the sign-ins rather than from the row. */
      lookedUp: !gates.mail_admin.trim()
    },
    // The exact URL the test email's link comes back to. Shown so it can be COPIED into Supabase's
    // redirect allow-list rather than retyped - a URL typed twice is a URL wrong once.
    resetRedirect: site.url + '/login',
    shipped: {
      url: gates.sse_manifest_url,
      appVersion: cache?.manifest?.appVersion ?? null,
      fetched_at: cache?.fetched_at ?? null,
      checked_at: cache?.checked_at ?? null,
      error: cache?.error ?? null
    }
  };
};

function admin(platform: App.Platform | undefined, locals: App.Locals) {
  const env = platform?.env;
  if (!env) throw error(500, 'not configured');
  if (locals.viewer?.role !== 'admin') throw error(404, 'Not found');
  return { env, me: locals.viewer };
}

export const actions: Actions = {
  /**
   * A gate an admin relaxes takes effect on the next request. That is the whole point of putting
   * them in a table: a limit that needs a deploy to relax is a limit nobody relaxes (design 6.3).
   *
   * NAMED `set`, NOT `default` (D-47). SvelteKit refuses a page that has a default action AND named
   * ones - "When using named actions, the default action cannot be used" - and it refuses it at
   * REQUEST time, as a 500, not at build time. This page grew its first named action in 0.18.0 and
   * every button on it has thrown ever since: the two test buttons, and Set itself.
   */
  set: async ({ request, platform, locals }) => {
    const { env, me } = admin(platform, locals);

    const form = await request.formData();
    const key = String(form.get('key') ?? '');
    const raw = String(form.get('value') ?? '');

    let value: unknown;
    try {
      value = JSON.parse(raw);
    } catch {
      return fail(400, { key, message: 'That is not valid JSON. Use true, false, a number, or a string in quotes.' });
    }

    // The one value people get wrong first time (the owner did): a channel LINK is not a webhook.
    if (key === 'discord_share_webhook' && typeof value === 'string' && value !== '' && !isDiscordWebhook(value)) {
      return fail(400, {
        key,
        message: 'That is not a webhook URL. A channel link (discord.com/channels/...) will not do. In Discord, open the '
          + 'channel\'s settings, Integrations, Webhooks, New Webhook, Copy Webhook URL - it starts with '
          + 'https://discord.com/api/webhooks/ - and paste it here in quotes.'
      });
    }

    const sb = db(env);
    const { error: e } = await sb.from('config')
      .update({ value, updated_by: me.id, updated_at: new Date().toISOString() })
      .eq('key', key);
    if (e) return fail(500, { key, message: e.message });

    await audit.record(sb, me.id, 'config.set', key, undefined, { value });
    return { ok: true, key };
  },

  /** The real thing, once: a test post to the sharing channel through the configured webhook. */
  testShare: async ({ platform, locals, url }) => {
    const { env, me } = admin(platform, locals);
    const sb = db(env);
    const [gates, site] = await Promise.all([loadGates(sb), loadSite(sb, url)]);
    if (!gates.discord_share_webhook) return fail(400, { message: 'Set discord_share_webhook first.' });
    try {
      await postShare(gates.discord_share_webhook, {
        event: 'published', slug: '', url: site.url, title: 'A test from the hub', kind: 'system',
        by: me.handle,
        blurb: 'If you can read this, the sharing channel is wired up. Newly published and updated maps will appear here.',
        cover: null, counts: { systems: 1, bodies: 0, constructs: 0 }, stars: 0, downloads: 0
      }, site.name);
    } catch (e) {
      return fail(502, { message: 'Discord refused the test post: ' + (e as Error).message });
    }
    await audit.record(sb, me.id, 'discord.test-share', 'config:discord_share_webhook');
    return { tested: 'A test post went to the sharing channel.' };
  },

  /**
   * Ask the engine what it ships, now, whatever the cache says (R-13, D-36). The same fetch the
   * upload path makes, so a failure here is the failure an upload would have had.
   */
  refreshShipped: async ({ platform, locals }) => {
    const { env, me } = admin(platform, locals);
    const sb = db(env);
    const gates = await loadGates(sb);
    if (!gates.sse_manifest_url) return fail(400, { message: 'Set sse_manifest_url first.' });

    const manifest = await shippedManifest(env, gates.sse_manifest_url, { force: true });
    const cache = await readCache(env);
    if (!manifest) {
      return fail(502, {
        message: 'The engine did not give a manifest: ' + (cache?.error ?? 'unknown reason')
          + '. The hub is using ' + (cache?.manifest ? 'the last one it fetched.' : 'no baselines, so the custom-content facets are skipped.')
      });
    }
    await audit.record(sb, me.id, 'shipped.refresh', 'config:sse_manifest_url', undefined, { appVersion: manifest.appVersion });
    return {
      tested: 'Star System Explorer ' + manifest.appVersion + ' says it ships '
        + (manifest.calendars?.length ?? 0) + ' calendars and '
        + (manifest.tagCategories?.length ?? 0) + ' tag categories.'
    };
  },

  /**
   * PIN THE ADDRESS the hub would write to anyway into the row, so it is explicit and editable
   * (the owner, 2026-09-06: *"it needs to be pinned there for admin emails"*). Nothing changes
   * about where mail goes; what changes is that it now SAYS where, and stays put if the sign-in
   * behind it ever changes.
   */
  pinMailAdmin: async ({ platform, locals }) => {
    const { env, me } = admin(platform, locals);
    const sb = db(env);
    const gates = await loadGates(sb);
    const to = await adminAddresses(sb, gates);
    if (!to.length) return fail(400, { message: 'There is no address to pin: no admin sign-in carries one.' });

    const value = to.join(', ');
    const { error: e } = await sb.from('config')
      .update({ value, updated_by: me.id, updated_at: new Date().toISOString() })
      .eq('key', 'mail_admin');
    if (e) return fail(500, { message: e.message });
    await audit.record(sb, me.id, 'config.set', 'mail_admin', 'pinned from the admin sign-ins', { value });
    return { tested: 'mail_admin is now ' + value + '. Edit the row to send somewhere else.' };
  },

  /**
   * THE HUB'S OWN MAIL, which is a different thing from the button below (D-49). That one asks
   * SUPABASE to send one of its auth templates, and proves the SMTP settings in its dashboard.
   * This one is the hub writing a message itself, through Resend, which is what the takedown form
   * and the queue nudge use - and it can be broken while the other works.
   */
  testHubMail: async ({ platform, locals, url }) => {
    const { env, me } = admin(platform, locals);
    const sb = db(env);
    const [gates, site] = await Promise.all([loadGates(sb), loadSite(sb, url)]);
    if (!env.RESEND_API_KEY) {
      return fail(400, { message: 'No RESEND_API_KEY on the Worker. `wrangler secret put RESEND_API_KEY` - it is the only thing that has to be set by hand.' });
    }
    // Nobody has to be named: with `mail_admin` empty the hub writes to the admins' own sign-in
    // addresses, which it already knows (D-50).
    const to = await adminAddresses(sb, gates);
    if (!to.length) {
      return fail(400, { message: 'No admin has an email address on their sign-in, and mail_admin is empty. Set mail_admin to somewhere the hub should write.' });
    }

    const result = await sendMail(env, gates, {
      to: to[0],
      subject: 'The hub can send mail',
      text: [
        'If you are reading this, ' + site.url + ' can send its own mail.',
        '',
        'That is what the takedown form and the review-queue nudge use. It is not the same path as',
        'the password-reset test, which asks Supabase to send one of its own templates.'
      ].join('\n')
    });
    if (!result.ok) return fail(502, { message: 'It did not send: ' + result.reason });
    await audit.record(sb, me.id, 'mail.test-hub', 'config:mail_from');
    return { tested: 'Sent from ' + gates.mail_from + ' to ' + to[0] + '. If it arrives, the hub can write to you.' };
  },

  /**
   * The one email Supabase will send on demand: a password reset, to the admin's own address,
   * through whatever SMTP is configured in the Supabase dashboard. If it arrives, mail works.
   */
  testMail: async ({ platform, locals, url }) => {
    const { env, me } = admin(platform, locals);
    const sb = db(env);
    const { data } = await sb.auth.admin.getUserById(me.id);
    const email = data?.user?.email;
    if (!email) return fail(400, { message: 'Your sign-in has no email address to send to.' });
    const site = await loadSite(sb, url);
    const { error: e } = await authClient(env).auth.resetPasswordForEmail(email, { redirectTo: site.url + '/login' });
    if (e) return fail(502, { message: 'Supabase could not send it: ' + e.message });
    await audit.record(sb, me.id, 'mail.test', 'creator:' + me.id);
    return { tested: 'A password-reset email is on its way to ' + email + '. If it arrives, SMTP works; ignore the link.' };
  }
};
