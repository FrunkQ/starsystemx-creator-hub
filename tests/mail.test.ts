// The hub's own mail (D-49): when it refuses, and what the nudge says.
//
// Sending itself is one fetch to somebody else's API and is not worth mocking. What IS worth
// pinning is every reason it declines - because each one is a case where a person is told "we
// cannot send that" instead of being left to wonder - and the rules that stop the review nudge
// becoming noise, which is the only thing that would make it worth turning off.
import { describe, it, expect } from 'vitest';
import { mailReady, looksLikeEmail, sendMail } from '../src/lib/server/mail';
import { noticeText, bucketOf } from '../src/lib/server/queueNotice';
import { GATE_FALLBACKS } from '../src/lib/server/config';

const configured = { ...GATE_FALLBACKS, mail_from: 'hub@example.test', mail_admin: 'me@example.test' };
const key = { RESEND_API_KEY: 'test-key' };

describe('whether the hub can send at all', () => {
  it('needs the key and a sender', () => {
    expect(mailReady(key, configured)).toBe(true);
    expect(mailReady({}, configured)).toBe(false);
    expect(mailReady(key, { ...configured, mail_from: '' })).toBe(false);
  });

  // WHO IT WRITES TO IS NOT PART OF THE QUESTION (D-50). The owner: "where? i am the admin - i used
  // an email to set it up." An empty `mail_admin` means the admins' own sign-in addresses, which
  // the hub already knows, so a missing row is not a reason to say it cannot send.
  it('does not require somebody to have typed a recipient in', () => {
    expect(mailReady(key, { ...configured, mail_admin: '' })).toBe(true);
  });

  it('says WHICH piece is missing, rather than failing silently', async () => {
    expect(await sendMail({}, configured, { to: 'a@b.test', subject: 's', text: 't' }))
      .toEqual({ ok: false, reason: 'no RESEND_API_KEY is set on the Worker' });
    expect(await sendMail(key, { ...configured, mail_from: '' }, { to: 'a@b.test', subject: 's', text: 't' }))
      .toEqual({ ok: false, reason: 'the mail_from row is empty' });
    expect(await sendMail(key, configured, { to: 'not an address', subject: 's', text: 't' }))
      .toEqual({ ok: false, reason: 'there is nobody to send it to' });
  });

  it('knows an address from a shrug', () => {
    for (const good of ['a@b.co', 'first.last+tag@sub.domain.example']) expect(looksLikeEmail(good), good).toBe(true);
    for (const bad of ['', 'nope', 'a@b', 'a b@c.test', '@b.test', 'a@.test', null, 42, 'x'.repeat(250) + '@b.test']) {
      expect(looksLikeEmail(bad), String(bad)).toBe(false);
    }
  });
});

describe('the review nudge', () => {
  it('names what is waiting, in words, with somewhere to go', () => {
    const { subject, text } = noticeText({ pictures: 2, tags: 1, reports: 0 }, 'https://hub.test');
    expect(subject).toContain('2 pictures to review');
    expect(subject).toContain('1 tag to look at');
    expect(subject).not.toContain('report');
    expect(text).toContain('https://hub.test/admin/review');
    expect(text).toContain('https://hub.test/admin/tags');
    expect(text).not.toContain('/admin/reports');
  });

  it('counts one of a thing as one', () => {
    expect(noticeText({ pictures: 1, tags: 0, reports: 1 }, 'https://hub.test').subject)
      .toBe('Waiting on the hub: 1 picture to review, 1 report still open');
  });

  // THE RATE LIMIT IS THE DEDUPE KEY: same bucket, same key, and the outbox refuses the second.
  it('buckets six hours together and separates the seventh', () => {
    const at = (iso: string) => bucketOf(new Date(iso));
    expect(at('2026-09-06T00:00:00Z')).toBe(at('2026-09-06T05:59:00Z'));
    expect(at('2026-09-06T00:00:00Z')).not.toBe(at('2026-09-06T06:00:00Z'));
    expect(at('2026-09-06T23:00:00Z')).not.toBe(at('2026-09-07T00:00:00Z'));
  });
});
