import { Injectable } from '@nestjs/common';
import type { CanActivate, ExecutionContext } from '@nestjs/common';

import type { LicenseCapability } from './license-capability.service';
import { LicenseCapabilityService } from './license-capability.service';

/**
 * Route-level license gate. Apply via `@UseGuards(LicenseCapabilityGuard('ai_chat'))`
 * to throw 402 Payment Required when the resolved license does not include
 * the capability. Falls through when the env says enforcement is permissive.
 */
@Injectable()
export class LicenseCapabilityGuard implements CanActivate {
  private cap: LicenseCapability;
  constructor(private readonly caps: LicenseCapabilityService) {
    // Default capability — overridden by the `for()` factory below.
    this.cap = 'ai_chat';
  }

  static for(cap: LicenseCapability): typeof LicenseCapabilityGuard {
    class Scoped extends LicenseCapabilityGuard {
      constructor(c: LicenseCapabilityService) {
        super(c);
        this.cap = cap;
      }
    }
    return Scoped;
  }

  canActivate(_context: ExecutionContext): boolean {
    if (!this.caps.isEnabled(this.cap)) {
      // Throw via the same path as require() so the error surface matches.
      this.caps.require(this.cap);
    }
    return true;
  }
}
