// PAID PACKS, PP1 (design SSE4-explorers-paid-packs.md 4, 7, 8, 11): the split, the "may this carry a
// price" rule, the declaration and the switch. Pure code; nothing here touches a route or a table.
import { describe, it, expect } from 'vitest';
import { splitSale, splitUk, splitLine, money, STRIPE_UK, UK_VAT_BP } from '../src/lib/paid/split';
import { mayCarryPrice, isNonCommercialLicence, isPermissionWithoutCommercial, isNonCommercialCatalogue } from '../src/lib/paid/mayCarryPrice';
import { SELLER_DECLARATION_TEXT, SELLER_DECLARATION_VERSION, SELLER_DECLARATION_POINTS } from '../src/lib/paid/declaration';
import { paidPacksOn, requirePaidPacks, checkPrice } from '../src/lib/paid/switch';
import { GATE_FALLBACKS } from '../src/lib/server/config';
import type { AttributionEntry } from '../src/lib/bundle/attribution';

describe('the split (design section 4)', () => {
  // The design's table, a UK buyer on a standard card with Stripe Tax, every row to the penny.
  const TABLE: [number, number, number, number, number, number][] = [
    // price, VAT, fees, net, creator, site
    [100, 17, 22, 61, 49, 12],
    [200, 33, 24, 143, 114, 29],
    [300, 50, 26, 224, 179, 45],
    [500, 83, 30, 387, 310, 77],
    [800, 133, 36, 631, 505, 126]
  ];
  for (const [price, vat, fees, net, creator, site] of TABLE) {
    it(`${money(price)}: ${vat}p VAT, ${fees}p fees, ${creator}p creator, ${site}p site`, () => {
      expect(splitUk(price)).toEqual({ price, vat, fees, net, creator, site, loss: false });
    });
  }

  it('never leaks a penny: the four parts add to the price, for every price up to £50, every fee schedule and share', () => {
    for (const fees of Object.values(STRIPE_UK)) {
      for (const share of [0, 1500, 2000, 2500, 10000]) {
        for (let p = 0; p <= 5000; p++) {
          const s = splitSale({ pricePence: p, vatBp: UK_VAT_BP, fees, siteShareBp: share });
          expect(s.vat + s.fees + s.creator + s.site).toBe(p);
          for (const v of [s.vat, s.fees, s.creator, s.site]) expect(Number.isInteger(v)).toBe(true);
          if (!s.loss) expect(s.creator).toBeGreaterThanOrEqual(0);
        }
      }
    }
  });

  it('the creator is never charged for a sale that the fees eat', () => {
    const s = splitUk(20);
    expect(s.loss).toBe(true);
    expect(s.creator).toBe(0);
    expect(s.site).toBeLessThan(0);
  });

  it('refuses money that is not whole pence', () => {
    expect(() => splitUk(2.5)).toThrow(RangeError);
    expect(() => splitUk(-1)).toThrow(RangeError);
    expect(() => splitSale({ pricePence: 300, vatBp: 2000, fees: STRIPE_UK.uk, siteShareBp: 10001 })).toThrow(RangeError);
  });

  it('a buyer with no VAT due keeps the whole price in the split', () => {
    const s = splitSale({ pricePence: 300, vatBp: 0, fees: STRIPE_UK.international, siteShareBp: 2000 });
    expect(s.vat).toBe(0);
    expect(s.fees).toBe(20 + Math.round(300 * 365 / 10000));
  });

  it('says the split in the design\'s own words', () => {
    expect(splitLine(splitUk(300))).toBe('£3.00: 50p VAT, 26p card fees, £1.79 to the creator, 45p to Explorers for hosting');
    expect(splitLine(splitUk(800))).toBe('£8.00: £1.33 VAT, 36p card fees, £5.05 to the creator, £1.26 to Explorers for hosting');
    expect(splitLine(splitUk(20))).toMatch(/^£0\.20: .*nothing is left for the creator/);
  });
});

const asset = (path: string, f: Partial<AttributionEntry>): AttributionEntry =>
  ({ path, kind: 'image', usedBy: ['x'], ...f });

describe('may this carry a price? (design sections 7 and 8)', () => {
  const OWN = { sellerHandle: 'cartographer', fanSetting: null, assets: [asset('assets/images/a.jpg', { credit: 'me', license: 'My own work' })] };

  it('the seller\'s own work, credited, passes', () => {
    expect(mayCarryPrice(OWN)).toEqual({ mayCarryPrice: true, reasons: [] });
  });

  it('a fan pack refuses, naming the setting', () => {
    const v = mayCarryPrice({ ...OWN, fanSetting: '  Star   Trek ' });
    expect(v.mayCarryPrice).toBe(false);
    expect(v.reasons.map((r) => r.code)).toEqual(['fan-work']);
    expect(v.reasons[0].message).toContain('Star Trek');
  });

  it('a moderator marking it fan work refuses, whatever the field says', () => {
    expect(mayCarryPrice({ ...OWN, markedFanWork: true }).reasons.map((r) => r.code)).toEqual(['fan-work-marked']);
  });

  it('a paid item cannot include or require a fan pack', () => {
    const v = mayCarryPrice({ ...OWN, packs: [{ id: 'own.rules', fanWork: false }, { id: 'fan.trek', fanWork: true }] });
    expect(v.reasons).toEqual([expect.objectContaining({ code: 'includes-fan-pack', items: ['fan.trek'] })]);
  });

  it('a CC BY-NC asset refuses, naming the file', () => {
    const v = mayCarryPrice({ ...OWN, assets: [...OWN.assets, asset('assets/images/nc.jpg', { credit: 'An Artist', license: 'CC BY-NC 4.0' })] });
    expect(v.reasons).toEqual([expect.objectContaining({ code: 'non-commercial-licence', items: ['assets/images/nc.jpg'] })]);
  });

  it('"used with permission" refuses unless the permission says commercial', () => {
    const plain = asset('assets/images/p.jpg', { credit: 'A Friend', license: 'Used with permission' });
    const commercial = asset('assets/images/c.jpg', { credit: 'A Friend', license: 'Used with permission, including commercial use' });
    const v = mayCarryPrice({ ...OWN, assets: [plain, commercial] });
    expect(v.reasons).toEqual([expect.objectContaining({ code: 'permission-not-commercial', items: ['assets/images/p.jpg'] })]);
  });

  it('an uncredited asset refuses; the seller\'s own in-app screenshot does not', () => {
    const blank = asset('assets/images/blank.jpg', {});
    const creditOnly = asset('assets/images/credit-only.jpg', { credit: 'Someone' });
    const shot = asset('assets/images/player/shot.png', { capturedInApp: true });
    const v = mayCarryPrice({ ...OWN, assets: [blank, creditOnly, shot] });
    expect(v.reasons).toEqual([expect.objectContaining({ code: 'uncredited-asset', items: ['assets/images/blank.jpg', 'assets/images/credit-only.jpg'] })]);
  });

  it('a Gaia value refuses, naming the catalogue; a free catalogue and references do not', () => {
    const v = mayCarryPrice({ ...OWN, catalogues: [{ catalogue: 'Gaia DR3', count: 412 }, { catalogue: 'Hipparcos', count: 30 }, { catalogue: 'AT-HYG', count: 0 }] });
    expect(v.reasons).toEqual([expect.objectContaining({ code: 'non-commercial-catalogue', items: ['Gaia DR3'] })]);
    expect(v.reasons[0].message).toContain('Gaia DR3 (412)');
  });

  it('someone else\'s credited work refuses; the seller\'s own earlier map does not', () => {
    const v = mayCarryPrice({ ...OWN, includes: [
      { title: 'My old map', creator: 'Cartographer' },
      { title: 'Their station', creator: 'someone-else' },
      { title: 'Unsigned base', creator: null }
    ] });
    expect(v.reasons).toEqual([expect.objectContaining({ code: 'others-work', items: ['Their station', 'Unsigned base'] })]);
  });

  it('lists every reason at once, not the first', () => {
    const v = mayCarryPrice({
      sellerHandle: 'x', fanSetting: 'Dune',
      assets: [asset('a', { credit: 'y', license: 'CC BY-NC-SA 4.0' }), asset('b', {})],
      catalogues: [{ catalogue: 'gaia', count: 1 }]
    });
    expect(v.reasons.map((r) => r.code)).toEqual(['fan-work', 'non-commercial-licence', 'uncredited-asset', 'non-commercial-catalogue']);
  });

  it('reads licences the way people actually write them', () => {
    for (const l of ['CC BY-NC 4.0', 'cc-by-nc-sa', 'CC BY NC ND 3.0', 'Non-commercial use only', 'noncommercial', 'Free to use, not for commercial use']) expect(isNonCommercialLicence(l), l).toBe(true);
    for (const l of ['CC BY 4.0', 'CC0 1.0 (public domain)', 'My own work', 'Bought - commercial licence', 'NASA / public domain image']) expect(isNonCommercialLicence(l), l).toBe(false);
    expect(isPermissionWithoutCommercial('Used with permission, not for commercial use')).toBe(true);
    for (const c of ['Gaia DR3', 'gaia-edr3', 'CNS5', 'AT-HYG v2.4']) expect(isNonCommercialCatalogue(c), c).toBe(true);
    for (const c of ['Hipparcos', 'Yale Bright Star']) expect(isNonCommercialCatalogue(c), c).toBe(false);
  });
});

describe('the seller declaration', () => {
  it('is one versioned string made of the design\'s six points', () => {
    expect(SELLER_DECLARATION_VERSION).toBe(1);
    expect(SELLER_DECLARATION_POINTS).toHaveLength(6);
    expect(SELLER_DECLARATION_TEXT).toBe(SELLER_DECLARATION_POINTS.join(' '));
    expect(SELLER_DECLARATION_TEXT).toMatch(/based on anyone else's setting/);
  });
});

describe('the master switch', () => {
  it('is off by default, with EU sales separately off', () => {
    expect(GATE_FALLBACKS.paid_packs).toBe(false);
    expect(GATE_FALLBACKS.paid_packs_sell_eu).toBe(false);
    expect(paidPacksOn(GATE_FALLBACKS)).toBe(false);
  });

  it('is on only for a literal true', () => {
    for (const v of ['true', 'yes', 1, {}, null, undefined]) expect(paidPacksOn({ paid_packs: v }), String(v)).toBe(false);
    expect(paidPacksOn({ paid_packs: true })).toBe(true);
  });

  it('a money route behind it is a plain 404 while it is off', () => {
    let status = 0;
    try { requirePaidPacks({ paid_packs: false }); } catch (e) { status = (e as { status: number }).status; }
    expect(status).toBe(404);
    expect(() => requirePaidPacks({ paid_packs: true })).not.toThrow();
  });

  it('keeps the design\'s settled values as settings', () => {
    expect(GATE_FALLBACKS.paid_packs_site_share_bp).toBe(2000);
    expect(GATE_FALLBACKS.paid_packs_min_price_pence).toBe(200);
    expect(GATE_FALLBACKS.paid_packs_payout_floor_pence).toBe(2500);
    expect(GATE_FALLBACKS.paid_packs_hold_days).toBe(30);
  });

  it('the price box: free is always allowed, under the minimum is refused with the reason', () => {
    expect(checkPrice(0, GATE_FALLBACKS)).toBeNull();
    expect(checkPrice(300, GATE_FALLBACKS)).toBeNull();
    expect(checkPrice(150, GATE_FALLBACKS)).toMatch(/lowest price is £2\.00/);
    expect(checkPrice(2.5, GATE_FALLBACKS)).toMatch(/whole number of pence/);
  });
});
