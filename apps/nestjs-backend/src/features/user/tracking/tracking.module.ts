import type { DynamicModule } from '@nestjs/common';
import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { TrackingController } from './tracking.controller';
import { TrackingInterceptor } from './tracking.interceptor';

/**
 * TrackingModule wires the global TrackingInterceptor (APP_INTERCEPTOR) that
 * tags every HTTP request's active OTEL span with the request metadata, and
 * exposes TrackingController for explicit client-issued tracking events.
 *
 * `forRoot()` is the registration entrypoint used by AppModule. The bare
 * `TrackingModule` export is kept for tests that need to import the
 * controller without registering the global interceptor.
 */
@Module({
  controllers: [TrackingController],
})
export class TrackingModule {
  static forRoot(): DynamicModule {
    return {
      module: TrackingModule,
      providers: [
        {
          provide: APP_INTERCEPTOR,
          useClass: TrackingInterceptor,
        },
      ],
    };
  }
}
