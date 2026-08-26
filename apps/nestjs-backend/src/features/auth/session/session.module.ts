import type { NestModule, MiddlewareConsumer } from '@nestjs/common';
import { Module } from '@nestjs/common';
import { CacheModule } from '../../../cache/cache.module';
import { EventJobModule } from '../../../event-emitter/event-job/event-job.module';
import passport from 'passport';
import { SessionHandleModule } from './session-handle.module';
import { SessionHandleService } from './session-handle.service';
import { SessionStoreService } from './session-store.service';
import { SESSION_CLEANUP_QUEUE, SessionCleanupProcessor } from './session-cleanup.processor';
import { SessionService } from './session.service';

@Module({
  imports: [
    SessionHandleModule,
    CacheModule,
    EventJobModule.registerQueue(SESSION_CLEANUP_QUEUE),
  ],
  providers: [SessionService, SessionStoreService, SessionCleanupProcessor],
  exports: [SessionService],
})
export class SessionModule implements NestModule {
  constructor(private readonly sessionHandleService: SessionHandleService) {}

  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(this.sessionHandleService.sessionMiddleware, passport.initialize())
      .forRoutes('/api/*');
  }
}
