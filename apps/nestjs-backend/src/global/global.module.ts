import type { DynamicModule, MiddlewareConsumer, ModuleMetadata, NestModule } from '@nestjs/common';
import { Global, Module } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { context, trace } from '@opentelemetry/api';
import { DataPrismaModule } from '@teable/db-data-prisma';
import { PrismaModule } from '@teable/db-main-prisma';
import type { Request } from 'express';
import { nanoid } from 'nanoid';
import { ClsMiddleware, ClsModule } from 'nestjs-cls';
import {
  I18nModule,
  QueryResolver,
  AcceptLanguageResolver,
  HeaderResolver,
  CookieResolver,
} from 'nestjs-i18n';
import { CacheModule } from '../cache/cache.module';
import { ConfigModule } from '../configs/config.module';
import { X_REQUEST_ID } from '../const';
import { DbProvider } from '../db-provider/db.provider';
import { EventEmitterModule } from '../event-emitter/event-emitter.module';
import { AuditInterceptor } from '../features/audit/audit.interceptor';
import { AuditSourceModule } from '../features/audit/audit.module';
import { AuthGuard } from '../features/auth/guard/auth.guard';
import { PermissionGuard } from '../features/auth/guard/permission.guard';
import { PermissionModule } from '../features/auth/permission.module';
import { PermissionGuard as PermissionMatrixGuard } from '../features/permission-matrix/permission.guard';
import { PermissionInterceptor as PermissionMatrixInterceptor } from '../features/permission-matrix/permission.interceptor';
import { DataLoaderModule } from '../features/data-loader/data-loader.module';
import { IpAllowlistMiddleware } from '../features/ip-allowlist/ip-allowlist.middleware';
import { IpAllowlistModule } from '../features/ip-allowlist/ip-allowlist.module';
import { ModelModule } from '../features/model/model.module';
import { DataDbMigrationService } from '../features/space/data-db-migration.service';
import { SpaceDataDbMigrationGuardService } from '../features/space/space-data-db-migration-guard.service';
import { RequestInfoMiddleware } from '../middleware/request-info.middleware';
import { SessionCsrfMiddleware } from '../middleware/session-csrf.middleware';
import { PerformanceCacheModule } from '../performance-cache';
import { RouteTracingInterceptor } from '../tracing/route-tracing.interceptor';
import { getI18nPath, getI18nTypesOutputPath } from '../utils/i18n';
import { DataDbClientManager } from './data-db-client-manager.service';
import { DataDbRuntimeCacheService } from './data-db-runtime-cache.service';
import { DatabaseClientPoolMetrics } from './database-client-pool.metrics';
import { DatabaseRouter } from './database-router.service';
import { KnexModule } from './knex';

const globalModules = {
  imports: [
    ConfigModule.register(),
    ClsModule.forRoot({
      global: true,
      middleware: {
        mount: false,
        generateId: true,
        idGenerator: (req: Request) => {
          const existingID = req.headers[X_REQUEST_ID] as string;
          if (existingID) return existingID;

          const span = trace.getSpan(context.active());
          if (!span) return nanoid();

          const { traceId } = span.spanContext();
          return traceId;
        },
      },
    }),
    CacheModule.register({ global: true }),
    EventEmitterModule.register({ global: true }),
    AuditSourceModule,
    KnexModule.register(),
    ModelModule,
    PrismaModule,
    DataPrismaModule,
    PermissionModule,
    DataLoaderModule,
    PerformanceCacheModule,
    IpAllowlistModule,
    I18nModule.forRootAsync({
      useFactory: () => {
        const i18nPath = getI18nPath();
        const typesOutputPath = getI18nTypesOutputPath();
        return {
          fallbackLanguage: 'en',
          loaderOptions: {
            path: i18nPath,
            watch: process.env.NODE_ENV !== 'production',
          },
          typesOutputPath,
          formatter: (template: string, ...args: Array<string | Record<string, string>>) => {
            // replace {{field}} to {$field}
            const normalized = template.replace(/\{\{\s*(\w+)\s*\}\}/g, '{$1}');
            const options = I18nModule['sanitizeI18nOptions']();
            return options.formatter(normalized, ...args);
          },
        };
      },
      resolvers: [
        { use: QueryResolver, options: ['lang'] },
        { use: CookieResolver, options: ['NEXT_LOCALE'] },
        AcceptLanguageResolver,
        new HeaderResolver(['x-lang']),
      ],
    }),
  ],

  // for overriding the default TablePermissionService, FieldPermissionService, RecordPermissionService, and ViewPermissionService
  providers: [
    DbProvider,
    DataDbRuntimeCacheService,
    DataDbClientManager,
    DatabaseClientPoolMetrics,
    DataDbMigrationService,
    SpaceDataDbMigrationGuardService,
    DatabaseRouter,
    RequestInfoMiddleware,
    SessionCsrfMiddleware,
    IpAllowlistMiddleware,
    {
      provide: APP_GUARD,
      useClass: AuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: PermissionGuard,
    },
    {
      // G2-001: wire the permission-matrix guard as APP_GUARD so the hidden-field
      // write protection runs on every /api/space/* /api/base/* /api/table/* write.
      // Order: after AuthGuard (anonymous → 401 first) and after the auth
      // permission guard (existing row/col checks still apply); the matrix gate
      // fires last and only when the user has role assignments on the base.
      provide: APP_GUARD,
      useClass: PermissionMatrixGuard,
    },
    {
      // Register before RouteTracingInterceptor so the audit row carries the
      // raw request/response state; tracing span attributes only influence
      // observability output and have no effect on what gets persisted.
      provide: APP_INTERCEPTOR,
      useClass: AuditInterceptor,
    },
    {
      // G2-001: wire the permission-matrix interceptor as APP_INTERCEPTOR so
      // every response gets hidden-field projection and req.permission.filter is
      // AND-merged for downstream Prisma `where` composition. Order: after
      // AuditInterceptor (rejected requests are still audited), before
      // RouteTracingInterceptor.
      provide: APP_INTERCEPTOR,
      useClass: PermissionMatrixInterceptor,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: RouteTracingInterceptor,
    },
  ],
  exports: [
    DbProvider,
    DataDbRuntimeCacheService,
    DataDbClientManager,
    DataDbMigrationService,
    SpaceDataDbMigrationGuardService,
    DatabaseRouter,
    KnexModule,
    PrismaModule,
    DataPrismaModule,
  ],
};

@Global()
@Module(globalModules)
export class GlobalModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(ClsMiddleware)
      .forRoutes('*')
      .apply(SessionCsrfMiddleware)
      .forRoutes('*')
      .apply(IpAllowlistMiddleware)
      .forRoutes('*')
      .apply(RequestInfoMiddleware)
      .forRoutes('*');
  }

  static register(moduleMetadata: ModuleMetadata): DynamicModule {
    return {
      module: GlobalModule,
      global: true,
      imports: [...globalModules.imports, ...(moduleMetadata.imports || [])],
      providers: [...globalModules.providers, ...(moduleMetadata.providers || [])],
      exports: [...globalModules.exports, ...(moduleMetadata.exports || [])],
    };
  }
}
