/* eslint-disable @typescript-eslint/naming-convention */
import { BullModule } from '@nestjs/bullmq';
import type { ModuleMetadata } from '@nestjs/common';
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SentryModule } from '@sentry/nestjs/setup';
import Redis from 'ioredis';
import type { ICacheConfig } from './configs/cache.config';
import { ConfigModule } from './configs/config.module';
import { AccessTokenModule } from './features/access-token/access-token.module';
import { AdminOpenApiModule } from './features/admin/admin-open-api.module';
import { AggregationOpenApiModule } from './features/aggregation/open-api/aggregation-open-api.module';
import { AdminOpenApiModule as SettingAdminOpenApiModule } from './features/setting/open-api/admin-open-api.module';
import { AiModule } from './features/ai/ai.module';
import { AiFieldRecordListenerModule } from './features/ai/ai-field-record-listener.module';
import { AirtableImportModule } from './features/airtable-import/airtable-import.module';
import { AttachmentsModule } from './features/attachments/attachments.module';
import { AuditSourceModule } from './features/audit/audit.module';
import { AuthModule } from './features/auth/auth.module';
import { AutomationModule } from './features/automation/automation.module';
import { BackupModule } from './features/backup/backup.module';
import { BaseModule } from './features/base/base.module';
import { BaseNodeModule } from './features/base-node/base-node.module';
import { BaseShareModule } from './features/base-share/base-share.module';
import { BuiltinAssetsInitModule } from './features/builtin-assets-init';
import { CanaryModule } from './features/canary';
import { ChatModule } from './features/chat/chat.module';
import { CollaboratorModule } from './features/collaborator/collaborator.module';
import { CommentOpenApiModule } from './features/comment/comment-open-api.module';
import { ConditionalFormatModule } from './features/conditional-format/conditional-format.module';
import { DashboardModule } from './features/dashboard/dashboard.module';
import { CustomDomainModule } from './features/custom-domain/custom-domain.module';
import { DomainVerificationModule } from './features/domain-verification/domain-verification.module';
import { ExportOpenApiModule } from './features/export/open-api/export-open-api.module';
import { FieldOpenApiModule } from './features/field/open-api/field-open-api.module';
import { HealthModule } from './features/health/health.module';
import { ImportOpenApiModule } from './features/import/open-api/import-open-api.module';
import { IntegrityModule } from './features/integrity/integrity.module';
import { InvitationModule } from './features/invitation/invitation.module';
import { MailSenderOpenApiModule } from './features/mail-sender/open-api/mail-sender-open-api.module';
import { MailSenderMergeModule } from './features/mail-sender/open-api/mail-sender.merge.module';
import { NextModule } from './features/next/next.module';
import { NotificationModule } from './features/notification/notification.module';
import { OAuthModule } from './features/oauth/oauth.module';
import { OAuthServerModule } from './features/oauth-server/oauth-server.module';
import { OrganizationModule } from './features/organization/organization.module';
import { PinModule } from './features/pin/pin.module';
import { PluginChartModule } from './features/plugin/official/chart/plugin-chart.module';
import { LicenseModule } from './features/license/license.module';
import { PermissionMatrixModule } from './features/permission-matrix/permission-matrix.module';
import { QuotaModule } from './features/quota/quota.module';
import { SsoModule } from './features/sso/sso.module';
import { PluginModule } from './features/plugin/plugin.module';
import { PluginContextMenuModule } from './features/plugin-context-menu/plugin-context-menu.module';
import { PluginPanelModule } from './features/plugin-panel/plugin-panel.module';
import { RecordHistoryColdModule } from './features/record-history-cold/record-history-cold.module';
import { SelectionModule } from './features/selection/selection.module';
import { SettingOpenApiModule } from './features/setting/open-api/setting-open-api.module';
import { SmtpModule } from './features/smtp/smtp.module';
import { ShareModule } from './features/share/share.module';
import { ShortLinkModule } from './features/short-link/short-link.module';
import { SpaceModule } from './features/space/space.module';
import { TemplateOpenApiModule } from './features/template/template-open-api.module';
import { TrashModule } from './features/trash/trash.module';
import { UndoRedoModule } from './features/undo-redo/open-api/undo-redo.module';
import { UserModule } from './features/user/user.module';
import { ViewPermissionModule } from './features/view-permission/view-permission.module';
import { ComputedOutboxWakeupConsumerModule } from './features/v2/computed-outbox-trigger/computed-outbox-wakeup-consumer.module';
import { V2Module } from './features/v2/v2.module';
import { GlobalModule } from './global/global.module';
import { InitBootstrapProvider } from './global/init-bootstrap.provider';
import { LoggerModule } from './logger/logger.module';
import { ObservabilityModule } from './observability/observability.module';
import { WsModule } from './ws/ws.module';

export const appModules = {
  imports: [
    SentryModule.forRoot(),
    LoggerModule.register(),
    MailSenderOpenApiModule,
    MailSenderMergeModule,
    HealthModule,
    NextModule,
    FieldOpenApiModule,
    TemplateOpenApiModule,
    BaseModule,
    BackupModule,
    BaseNodeModule,
    IntegrityModule,
    ChatModule,
    AttachmentsModule,
    WsModule,
    SelectionModule,
    SmtpModule,
    UndoRedoModule,
    AggregationOpenApiModule,
    UserModule,
    ViewPermissionModule,
    AuthModule,
    AuditSourceModule,
    AutomationModule,
    SpaceModule,
    CollaboratorModule,
    ConditionalFormatModule,
    InvitationModule,
    ShareModule,
    ShortLinkModule,
    BaseShareModule,
    NotificationModule,
    AccessTokenModule,
    AdminOpenApiModule,
    SettingAdminOpenApiModule,
    ImportOpenApiModule,
    AirtableImportModule,
    ExportOpenApiModule,
    PinModule,
    SettingAdminOpenApiModule,
    CanaryModule,
    LicenseModule,
    QuotaModule,
    DomainVerificationModule,
    CustomDomainModule,
    SsoModule,
    PermissionMatrixModule,
    SettingOpenApiModule,
    OAuthModule,
    OAuthServerModule,
    TrashModule,
    DashboardModule,
    CommentOpenApiModule,
    OrganizationModule,
    AiModule,
    AiFieldRecordListenerModule,
    PluginModule,
    PluginPanelModule,
    // the ONLY mount of the cold queue CONSUMER: feature modules import
    // RecordHistoryColdCoreModule (services only), so auxiliary entrypoints
    // composing them never become competing cold-queue workers
    RecordHistoryColdModule,
    PluginContextMenuModule,
    PluginChartModule,
    ObservabilityModule,
    BuiltinAssetsInitModule,
    V2Module,
    ComputedOutboxWakeupConsumerModule.register(),
  ],
  providers: [InitBootstrapProvider],
};

@Module({
  ...appModules,
  imports: [
    GlobalModule,
    ...appModules.imports,
    BullModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => {
        const redisUri = configService.get<ICacheConfig>('cache')?.redis.uri;
        if (!redisUri) {
          throw new Error('Redis URI is not defined');
        }
        const redis = new Redis(redisUri, { lazyConnect: true, maxRetriesPerRequest: null });
        await redis.connect();

        return {
          connection: redis,
          // Tests give short-lived app instances their own queue namespace so
          // they don't consume each other's jobs; unset means the bull default.
          prefix: process.env.BACKEND_QUEUE_PREFIX,
        };
      },
      inject: [ConfigService],
    }),
  ],
  controllers: [],
})
export class AppModule {
  static register(customModuleMetadata: ModuleMetadata) {
    return {
      module: AppModule,
      ...customModuleMetadata,
    };
  }
}
