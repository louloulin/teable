import { Injectable } from '@nestjs/common';
import { PrismaService } from '@teable/db-main-prisma';
import { HttpErrorCode } from '@teable/core';
import { CustomHttpException } from '../../custom.exception';
import { AiAppBuilderService } from './ai-app-builder.service';

@Injectable()
export class AiAppBuilderAuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly svc: AiAppBuilderService
  ) {}

  /**
   * Verify the app belongs to the given base; used by the controller to
   * authorize cross-resource access (app secret/file/version mutations).
   */
  async assertAppInBase(appId: string, baseId: string) {
    const app = await this.svc.getApp(appId);
    if (app.baseId !== baseId) {
      throw new CustomHttpException('app does not belong to base', HttpErrorCode.NOT_FOUND);
    }
    return app;
  }
}
