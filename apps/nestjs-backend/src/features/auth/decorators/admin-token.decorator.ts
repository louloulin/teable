import { SetMetadata } from '@nestjs/common';

export const ALLOW_ADMIN_TOKEN = 'allowAdminToken';

export const AllowAdminToken = () => SetMetadata(ALLOW_ADMIN_TOKEN, true);
