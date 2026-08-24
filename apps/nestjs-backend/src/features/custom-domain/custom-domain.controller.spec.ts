import { HttpErrorCode } from '@teable/core';

import { CustomHttpException } from '../../custom.exception';
import { LicenseCapabilityService } from '../license/license-capability.service';
import { LicenseCapabilityGuard } from '../license/license-capability.guard';

describe('CustomDomain capability guard', () => {
  const caps = {
    isEnabled: jest.fn(),
    require: jest.fn((cap: string) => {
      throw new CustomHttpException(
        `capability "${cap}" requires a license upgrade`,
        HttpErrorCode.PAYMENT_REQUIRED,
        { cause: 'LICENSE_REQUIRED', meta: { capability: cap, plan: 'self_hosted' } }
      );
    }),
  } as unknown as LicenseCapabilityService;

  const Guard = LicenseCapabilityGuard.for('custom_domain');

  it('allows the request when the capability is enabled', () => {
    (caps.isEnabled as jest.Mock).mockReturnValueOnce(true);
    const guard = new Guard(caps);
    expect(guard.canActivate({} as never)).toBe(true);
  });

  it('rejects the request when the capability is disabled (402 LICENSE_REQUIRED)', () => {
    (caps.isEnabled as jest.Mock).mockReturnValueOnce(false);
    const guard = new Guard(caps);
    expect(() => guard.canActivate({} as never)).toThrow(CustomHttpException);
    try {
      guard.canActivate({} as never);
    } catch (err) {
      expect(err).toBeInstanceOf(CustomHttpException);
      expect((err as CustomHttpException).code).toBe(HttpErrorCode.PAYMENT_REQUIRED);
    }
  });
});