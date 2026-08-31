// The "worth re-saving" hint. It must never nag about something a creator cannot fix.
import { describe, it, expect } from 'vitest';
import { checkFreshness, compareVersions } from '../src/lib/bundle/freshness';

const base = { createdWith: '3.0.190', legacyStamped: false, recommendBelow: '' };

describe('when to suggest a re-save', () => {
  it('says nothing about a current, fully-stamped save', () => {
    expect(checkFreshness(base).worthResaving).toBe(false);
  });

  it('notices a file the hub had to stamp itself', () => {
    const f = checkFreshness({ ...base, legacyStamped: true });
    expect(f.worthResaving).toBe(true);
    expect(f.reasons[0]).toMatch(/does not record which save format/);
  });

  it('notices a file with no build stamp', () => {
    expect(checkFreshness({ ...base, createdWith: null }).worthResaving).toBe(true);
  });

  it('suggests when the build is older than the configured bar', () => {
    const f = checkFreshness({ ...base, createdWith: '2.1.692-beta', recommendBelow: '3.0.190' });
    expect(f.worthResaving).toBe(true);
    expect(f.reasons[0]).toMatch(/2\.1\.692-beta/);
  });

  it('says nothing when the build meets the bar', () => {
    expect(checkFreshness({ ...base, createdWith: '3.0.190', recommendBelow: '3.0.190' }).worthResaving).toBe(false);
    expect(checkFreshness({ ...base, createdWith: '3.1.0', recommendBelow: '3.0.190' }).worthResaving).toBe(false);
  });

  it('an empty bar disables the version check without disabling the rest', () => {
    expect(checkFreshness({ ...base, createdWith: '1.0.0', recommendBelow: '' }).worthResaving).toBe(false);
    expect(checkFreshness({ ...base, createdWith: '1.0.0', legacyStamped: true }).worthResaving).toBe(true);
  });
});

describe('comparing engine versions', () => {
  it('orders by numeric segment, ignoring any suffix', () => {
    expect(compareVersions('2.1.692-beta', '3.0.190')).toBe(-1);
    expect(compareVersions('3.0.190', '2.1.692-beta')).toBe(1);
    expect(compareVersions('3.0.190', '3.0.190')).toBe(0);
    expect(compareVersions('3.0.9', '3.0.10')).toBe(-1); // not string order
  });

  it('treats a version it cannot read as EQUAL, never as old', () => {
    // A nag nobody can act on is worse than no nag. An unparseable version must not produce one.
    expect(compareVersions('nonsense', '3.0.190')).toBe(0);
    expect(compareVersions('', '3.0.190')).toBe(0);
  });
});
