/**
 * Wave H (g2-008) — Prisma model stubs for business-tenant feature sets that
 * are wired in this round but whose underlying Prisma models are intentionally
 * deferred to a future migration per g2-008 brief non-goal "不新增 Prisma
 * migration".
 *
 * The auth.service.ts files copied from supervisor reference Prisma model
 * names that do not yet exist in packages/db-main-prisma/prisma/postgres/
 * schema.prisma (e.g. customerKmsKey, kmsAuditEntry, webhookDelivery, etc.).
 *
 * To satisfy tsc without (a) writing a migration and (b) scattering casts
 * across many call sites, we declare each missing model as `any`-typed on
 * PrismaClient. At runtime the methods may throw — the brief scope is module
 * wiring + DI surface; admin controller routes that would invoke these models
 * are explicitly deferred (brief non-goal #4).
 */
declare module '@prisma/client' {
  interface PrismaClient {
    customerKmsKey: any;
    kmsAuditEntry: any;
    byokLlmKey: any;
    byokLlmUsage: any;
    byokLlmAttempt: any;
    encryptionKey: any;
    webhookBridge: any;
    webhookEndpoint: any;
    webhookPayload: any;
    webhookDelivery: any;
    mirrorLog: any;
    mirrorLag: any;
  }
}

export {};
