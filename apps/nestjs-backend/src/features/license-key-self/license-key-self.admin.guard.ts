import { LicenseCapabilityGuard } from '../license/license-capability.guard';

export const LicenseKeySelfAdminGuard = LicenseCapabilityGuard.for('admin_panel');
