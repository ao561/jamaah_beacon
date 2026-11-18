import { describe, expect, it } from 'vitest';
import { withoutFragment } from './monitoring';

describe('withoutFragment', () => {
  it('strips sign-in tokens from the URL fragment', () => {
    expect(withoutFragment('https://app.test/?b=1#access_token=secret&refresh_token=secret')).toBe('https://app.test/?b=1');
  });

  it('leaves URLs without a fragment alone', () => {
    expect(withoutFragment('https://app.test/?b=1')).toBe('https://app.test/?b=1');
  });
});
