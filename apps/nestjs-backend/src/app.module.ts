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
import { EnterpriseReadinessModule } from './features/admin/enterprise-readiness.module';
import { AgentOrchestratorModule } from './features/agent-orchestrator/agent-orchestrator.module';
import { AggregationOpenApiModule } from './features/aggregation/open-api/aggregation-open-api.module';
import { AiFieldRecordListenerModule } from './features/ai/ai-field-record-listener.module';
import { AiModule } from './features/ai/ai.module';
import { AiBuilderModule } from './features/ai-builder/ai-builder.module';
import { AiCostForecasterModule } from './features/ai-cost-forecaster/ai-cost-forecaster.module';
import { AirtableImportModule } from './features/airtable-import/airtable-import.module';
import { BaserowImportModule } from './features/baserow-import/baserow-import.module';
import { AnnouncementsModule } from './features/announcements/announcements.module';
import { ApiExplorerModule } from './features/api-explorer/api-explorer.module';
import { AttachmentsModule } from './features/attachments/attachments.module';
import { AuditSourceModule } from './features/audit/audit.module';
import { AuditExportModule } from './features/audit-export/audit-export.module';
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
import { CuppyPromptRouterModule } from './features/cuppy-prompt-router/cuppy-prompt-router.module';
import { CustomDomainModule } from './features/custom-domain/custom-domain.module';
import { DashboardModule } from './features/dashboard/dashboard.module';
import { DataMaskingModule } from './features/data-masking/data-masking.module';
import { DatabaseViewModule } from './features/database-view/database-view.module';
import { DomainVerificationModule } from './features/domain-verification/domain-verification.module';
import { EmailDomainClaimModule } from './features/email-domain-claim/email-domain-claim.module';
import { EvalHarnessModule } from './features/eval-harness/eval-harness.module';
import { ExportOpenApiModule } from './features/export/open-api/export-open-api.module';
import { FieldOpenApiModule } from './features/field/open-api/field-open-api.module';
import { GoogleSheetsModule } from './features/google-sheets/google-sheets.module';
import { GraphModule } from './features/graph/graph.module';
import { HealthModule } from './features/health/health.module';
import { ImBridgeModule } from './features/im-bridge/im-bridge.module';
import { ImportOpenApiModule } from './features/import/open-api/import-open-api.module';
import { InstanceSkillModule } from './features/instance-skills/instance-skill.module';
import { IntegrityModule } from './features/integrity/integrity.module';
import { InvitationModule } from './features/invitation/invitation.module';
import { IpAllowlistModule } from './features/ip-allowlist/ip-allowlist.module';
import { LicenseModule } from './features/license/license.module';
import { GridProViewModule } from './features/grid-pro-view/grid-pro-view.module';
import { MapViewModule } from './features/map-view/map-view.module';
import { TimelineViewModule } from './features/timeline-view/timeline-view.module';
import { LicenseKeySelfModule } from './features/license-key-self/license-key-self.module';
import { MailSenderOpenApiModule } from './features/mail-sender/open-api/mail-sender-open-api.module';
import { MailSenderMergeModule } from './features/mail-sender/open-api/mail-sender.merge.module';
import { ModelFinetunePipelineModule } from './features/model-finetune-pipeline/model-finetune-pipeline.module';
import { NextModule } from './features/next/next.module';
import { NotificationModule } from './features/notification/notification.module';
import { NotionModule } from './features/notion/notion.module';
import { OAuthModule } from './features/oauth/oauth.module';
import { OAuthServerModule } from './features/oauth-server/oauth-server.module';
import { OrganizationModule } from './features/organization/organization.module';
import { PermissionMatrixModule } from './features/permission-matrix/permission-matrix.module';
import { PinModule } from './features/pin/pin.module';
import { PluginChartModule } from './features/plugin/official/chart/plugin-chart.module';
import { PluginModule } from './features/plugin/plugin.module';
import { PluginContextMenuModule } from './features/plugin-context-menu/plugin-context-menu.module';
import { PluginPanelModule } from './features/plugin-panel/plugin-panel.module';
import { PresenceModule } from './features/presence/presence.module';
import { QuotaModule } from './features/quota/quota.module';
import { RecordHistoryColdModule } from './features/record-history-cold/record-history-cold.module';
import { AutomationRunCleanupModule } from './features/retention/automation-run-cleanup.module';
import { RiskControlModule } from './features/risk-control/risk-control.module';
import { SandboxAgentModule } from './features/sandbox-agent/sandbox-agent.module';
import { ScimModule } from './features/scim/scim.module';
import { SelectionModule } from './features/selection/selection.module';
import { AdminOpenApiModule as SettingAdminOpenApiModule } from './features/setting/open-api/admin-open-api.module';
import { SettingOpenApiModule } from './features/setting/open-api/setting-open-api.module';
import { ShareModule } from './features/share/share.module';
import { ShortLinkModule } from './features/short-link/short-link.module';
import { SmtpModule } from './features/smtp/smtp.module';
import { SpaceModule } from './features/space/space.module';
import { SsoModule } from './features/sso/sso.module';
import { SamlModule } from './features/saml/saml.module';
import { TemplateOpenApiModule } from './features/template/template-open-api.module';
import { TotpModule } from './features/totp/totp.module';
import { TrashModule } from './features/trash/trash.module';
import { UndoRedoModule } from './features/undo-redo/open-api/undo-redo.module';
import { UserModule } from './features/user/user.module';
import { ComputedOutboxWakeupConsumerModule } from './features/v2/computed-outbox-trigger/computed-outbox-wakeup-consumer.module';
import { V2Module } from './features/v2/v2.module';
import { ViewPermissionModule } from './features/view-permission/view-permission.module';
import { WebhookDeliveryModule } from './features/webhook-delivery/webhook-delivery.module';
import { WorkspaceMirrorModule } from './features/workspace-mirror/workspace-mirror.module';
import { WorkspaceSwitchModule } from './features/workspace-switch/workspace-switch.module';
import { GlobalModule } from './global/global.module';
import { InitBootstrapProvider } from './global/init-bootstrap.provider';
import { HealthModule as HealthProbeModule } from './health/health.module';
import { LoggerModule } from './logger/logger.module';
import { ObservabilityModule } from './observability/observability.module';
import { WsModule } from './ws/ws.module';
export const appModules = {
  imports: [
    SentryModule.forRoot(),
    LoggerModule.register(),
    GridProViewModule,
    MailSenderOpenApiModule,
    MailSenderMergeModule,
    TimelineViewModule,
    HealthModule,
    HealthProbeModule,
    NextModule,
    FieldOpenApiModule,
    TemplateOpenApiModule,
    BaseModule,
    BackupModule,
    GoogleSheetsModule,
    BaseNodeModule,
    MapViewModule,
    IntegrityModule,
    ChatModule,
    AttachmentsModule,
    WsModule,
    SelectionModule,
    SmtpModule,
    ImBridgeModule,
    UndoRedoModule,
    AggregationOpenApiModule,
    AnnouncementsModule,
    SandboxAgentModule,
    PresenceModule,
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
    NotionModule,
    AccessTokenModule,
    AdminOpenApiModule,
    EnterpriseReadinessModule,
    InstanceSkillModule,
    SettingAdminOpenApiModule,
    ImportOpenApiModule,
    AirtableImportModule,
    BaserowImportModule, // Round-16: minimal baserow driver
    ExportOpenApiModule,
    PinModule,
    SettingAdminOpenApiModule,
    CanaryModule,
    LicenseModule,
    LicenseKeySelfModule,
    QuotaModule,
    DomainVerificationModule,
    CustomDomainModule,
    IpAllowlistModule,
    EmailDomainClaimModule,
    RiskControlModule,
    SsoModule,
    SamlModule,
    TotpModule,
    DataMaskingModule,
    AuditExportModule,
    ApiExplorerModule,
    ScimModule,
    PermissionMatrixModule,
    SettingOpenApiModule,
    OAuthModule,
    OAuthServerModule,
    TrashModule,
    DashboardModule,
    DatabaseViewModule,
    GraphModule,
    CommentOpenApiModule,
    OrganizationModule,
    AiModule,
    AiBuilderModule,
    AiFieldRecordListenerModule,
    PluginModule,
    PluginPanelModule,
    // the ONLY mount of the cold queue CONSUMER: feature modules import
    // RecordHistoryColdCoreModule (services only), so auxiliary entrypoints
    // composing them never become competing cold-queue workers
    RecordHistoryColdModule,
    AutomationRunCleanupModule,
    PluginContextMenuModule,
    PluginChartModule,
    ObservabilityModule,
    BuiltinAssetsInitModule,
    V2Module,
    WebhookDeliveryModule,
    ComputedOutboxWakeupConsumerModule.register(),
    AgentOrchestratorModule,
    AiCostForecasterModule,
    CuppyPromptRouterModule,
    ModelFinetunePipelineModule,
    EvalHarnessModule,
    WorkspaceMirrorModule,
    WorkspaceSwitchModule,
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
