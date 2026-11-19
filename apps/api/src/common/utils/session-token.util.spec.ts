import { createHmac } from 'node:crypto';
import { computeCsrfToken, generateSessionToken, hashSessionToken, safeEqual } from './session-token.util';

describe('session-token.util', () => {
  it('generateSessionToken ينتج 256 بت (64 حرف hex) عشوائية في كل مرة', () => {
    const a = generateSessionToken();
    const b = generateSessionToken();
    expect(a).toHaveLength(64);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(a).not.toBe(b);
  });

  it('hashSessionToken تابع حتمي (نفس المدخل ⇒ نفس التجزئة)، ولا يساوي المدخل أبدًا', () => {
    const raw = generateSessionToken();
    expect(hashSessionToken(raw)).toBe(hashSessionToken(raw));
    expect(hashSessionToken(raw)).not.toBe(raw);
    expect(hashSessionToken(raw)).toHaveLength(64);
  });

  it('computeCsrfToken يطابق HMAC-SHA256 قياسي لنفس السر والمعرّف', () => {
    const raw = generateSessionToken();
    const secret = 'unit-test-secret';
    const expected = createHmac('sha256', secret).update(raw).digest('hex');
    expect(computeCsrfToken(raw, secret)).toBe(expected);
  });

  it('computeCsrfToken يتغيّر مع تغيّر السر أو معرّف الجلسة', () => {
    const raw = generateSessionToken();
    const t1 = computeCsrfToken(raw, 'secret-a');
    const t2 = computeCsrfToken(raw, 'secret-b');
    const t3 = computeCsrfToken(generateSessionToken(), 'secret-a');
    expect(t1).not.toBe(t2);
    expect(t1).not.toBe(t3);
  });

  it('safeEqual يقارن بشكل صحيح مع نصوص متساوية ومختلفة وبأطوال مختلفة', () => {
    expect(safeEqual('abc', 'abc')).toBe(true);
    expect(safeEqual('abc', 'abd')).toBe(false);
    expect(safeEqual('abc', 'abcd')).toBe(false);
    expect(safeEqual('', '')).toBe(true);
  });
});
