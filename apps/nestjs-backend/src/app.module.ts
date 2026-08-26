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
import { AggregationOpenApiModule } from './features/aggregation/open-api/aggregation-open-api.module';
import { AiModule } from './features/ai/ai.module';
import { AirtableImportModule } from './features/airtable-import/airtable-import.module';
import { AttachmentsModule } from './features/attachments/attachments.module';
import { AuthModule } from './features/auth/auth.module';
import { BaseModule } from './features/base/base.module';
import { BaseNodeModule } from './features/base-node/base-node.module';
import { BaseShareModule } from './features/base-share/base-share.module';
import { BuiltinAssetsInitModule } from './features/builtin-assets-init';
import { ByokKmsModule } from './features/byok-kms/byok-kms.module';
import { ByokLlmModule } from './features/byok-llm/byok-llm.module';
import { CanaryModule } from './features/canary';
import { ChatModule } from './features/chat/chat.module';
import { CollaboratorModule } from './features/collaborator/collaborator.module';
import { CommentOpenApiModule } from './features/comment/comment-open-api.module';
import { DashboardModule } from './features/dashboard/dashboard.module';
import { DomainVerificationModule } from './features/domain-verification/domain-verification.module';
import { DrCanvasModule } from './features/dr-canvas/dr-canvas.module';
import { ExportOpenApiModule } from './features/export/open-api/export-open-api.module';
import { FieldOpenApiModule } from './features/field/open-api/field-open-api.module';
import { HealthModule } from './features/health/health.module';
import { ImportOpenApiModule } from './features/import/open-api/import-open-api.module';
import { IntegrityModule } from './features/integrity/integrity.module';
import { InvitationModule } from './features/invitation/invitation.module';
import { IpAllowlistModule } from './features/ip-allowlist/ip-allowlist.module';
import { AggregationModule } from './features/aggregation/aggregation.module';
import { AttachmentsStorageModule } from './features/attachments/attachments-storage.module';
import { CalculationModule } from './features/calculation/calculation.module';
import { DataLoaderModule } from './features/data-loader/data-loader.module';
import { DatabaseViewModule } from './features/database-view/database-view.module';
import { FieldModule } from './features/field/field.module';
import { FieldCalculateModule } from './features/field/field-calculate/field-calculate.module';
import { FieldDuplicateModule } from './features/field/field-duplicate/field-duplicate.module';
import { GraphModule } from './features/graph/graph.module';
import { KmsEncryptionModule } from './features/kms-encryption/kms-encryption.module';
import { MailSenderOpenApiModule } from './features/mail-sender/open-api/mail-sender-open-api.module';
import { MailSenderMergeModule } from './features/mail-sender/open-api/mail-sender.merge.module';
import { MetricsModule } from './features/metrics/metrics.module';
import { ModelModule } from './features/model/model.module';
import { NextModule } from './features/next/next.module';
import { NotificationModule } from './features/notification/notification.module';
import { OAuthModule } from './features/oauth/oauth.module';
import { OrganizationModule } from './features/organization/organization.module';
import { PinModule } from './features/pin/pin.module';
import { PluginChartModule } from './features/plugin/official/chart/plugin-chart.module';
import { LicenseModule } from './features/license/license.module';
import { PermissionMatrixModule } from './features/permission-matrix/permission-matrix.module';
import { QuotaModule } from './features/quota/quota.module';
import { RetentionModule } from './features/retention/retention.module';
import { RiskControlModule } from './features/risk-control/risk-control.module';
import { SsoModule } from './features/sso/sso.module';
import { PluginModule } from './features/plugin/plugin.module';
import { PluginContextMenuModule } from './features/plugin-context-menu/plugin-context-menu.module';
import { PluginPanelModule } from './features/plugin-panel/plugin-panel.module';
import { ComputedModule } from './features/record/computed/computed.module';
import { RecordModifyModule } from './features/record/record-modify/record-modify.module';
import { RecordOpenApiModule } from './features/record/open-api/record-open-api.module';
import { RecordQueryBuilderModule } from './features/record/query-builder';
import { RecordModule } from './features/record/record.module';
import { RecordHistoryColdModule } from './features/record-history-cold/record-history-cold.module';
import { SelectionModule } from './features/selection/selection.module';
import { AdminOpenApiModule } from './features/setting/open-api/admin-open-api.module';
import { SettingOpenApiModule } from './features/setting/open-api/setting-open-api.module';
import { ShareDbModule } from './share-db/share-db.module';
import { ShareModule } from './features/share/share.module';
import { ShortLinkModule } from './features/short-link/short-link.module';
import { SpaceDataDbMigrationGuardModule } from './features/space/space-data-db-migration-guard.module';
import { SpaceModule } from './features/space/space.module';
import { TableDomainQueryModule } from './features/table-domain';
import { TableOpenApiModule } from './features/table/open-api/table-open-api.module';
import { TableModule } from './features/table/table.module';
import { TemplateOpenApiModule } from './features/template/template-open-api.module';
import { TrashModule } from './features/trash/trash.module';
import { TurnstileModule } from './features/auth/turnstile/turnstile.module';
import { UndoRedoModule } from './features/undo-redo/open-api/undo-redo.module';
import { DeleteUserModule } from './features/user/delete-user/delete-user.module';
import { TrackingModule } from './features/user/tracking/tracking.module';
import { UserModule } from './features/user/user.module';
import { ComputedOutboxWakeupConsumerModule } from './features/v2/computed-outbox-trigger/computed-outbox-wakeup-consumer.module';
import { V2Module } from './features/v2/v2.module';
import { ViewModule } from './features/view/view.module';
import { ViewOpenApiModule } from './features/view/open-api/view-open-api.module';
import { WebhookBridgeModule } from './features/webhook-bridge/webhook-bridge.module';
import { WebhookCanvasModule } from './features/webhook-canvas/webhook-canvas.module';
import { WebhookDeliveryModule } from './features/webhook-delivery/webhook-delivery.module';
import { WorkspaceMirrorModule } from './features/workspace-mirror/workspace-mirror.module';
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
    BaseNodeModule,
    IntegrityModule,
    ChatModule,
    AttachmentsModule,
    WsModule,
    SelectionModule,
    UndoRedoModule,
    AggregationOpenApiModule,
    UserModule,
    AuthModule,
    SpaceModule,
    CollaboratorModule,
    InvitationModule,
    ShareModule,
    ShortLinkModule,
    BaseShareModule,
    NotificationModule,
    AccessTokenModule,
    ImportOpenApiModule,
    AirtableImportModule,
    ExportOpenApiModule,
    PinModule,
    AdminOpenApiModule,
    CanaryModule,
    LicenseModule,
    QuotaModule,
    DomainVerificationModule,
    SsoModule,
    PermissionMatrixModule,
    SettingOpenApiModule,
    OAuthModule,
    TrashModule,
    DashboardModule,
    CommentOpenApiModule,
    OrganizationModule,
    AiModule,
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
    // Wave N1 modules (g2-006)
    IpAllowlistModule,
    RiskControlModule,
    TurnstileModule,
    DeleteUserModule,
    RetentionModule,
    TrackingModule.forRoot(),
    MetricsModule,
// Wave N2 modules (g2-007) — enterprise capability modules registered
    // here for the first time. Order is dependency-correct so the DI graph
    // can resolve transitively without forwardRef gymnastics.
    FieldModule,
    FieldCalculateModule,
    FieldDuplicateModule,
    AttachmentsStorageModule,
    ShareDbModule,
    AggregationModule,
    SpaceDataDbMigrationGuardModule,
    TableDomainQueryModule,
    RecordQueryBuilderModule,
    CalculationModule,
    ModelModule,
    DataLoaderModule,
    ViewModule,
    RecordModule,
    ComputedModule,
    GraphModule,
    DatabaseViewModule,
    TableModule,
    RecordModifyModule,
    ViewOpenApiModule,
    RecordOpenApiModule,
    TableOpenApiModule,
    // Wave H modules (g2-008): webhook / BYOK / KMS / DR
    WebhookDeliveryModule,
    WebhookBridgeModule,
    WebhookCanvasModule,
    ByokLlmModule,
    ByokKmsModule,
    KmsEncryptionModule,
    WorkspaceMirrorModule,
    DrCanvasModule,
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
