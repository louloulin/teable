import { Module } from '@nestjs/common';
import { PrismaModule } from '@teable/db-main-prisma';

import { ByokLlmAuthService } from './byok-llm.auth.service';
import { ByokLlmController } from './byok-llm.controller';

/**
 * BYOK LLM HTTP module.
 *
 * Wires the existing ByokLlmAuthService (key register / list / disable / health
 * + per-org usage + per-call attempt recording + routing decisions) to HTTP.
 * The service layer is unchanged — Stage 66 already shipped it. The only
 * missing piece was the controller + module registration in app.module.ts.
 *
 * Routes (all under /api/admin/byok-llm):
 *   GET    /providers                       list supported providers + labels
 *   GET    /keys/:orgId                     list keys for an org
 *   GET    /keys/:orgId/count               count keys for an org
 *   GET    /keys/:orgId/can-register        capacity check
 *   POST   /keys/:orgId                     register a new key
 *   GET    /keys/id/:keyId                  load one key
 *   DELETE /keys/:keyId                     disable a key
 *   GET    /keys/:keyId/health              rolling 1m health snapshot
 *   POST   /route                           resolve a routing decision
 */
@Module({
  imports: [PrismaModule],
  controllers: [ByokLlmController],
  providers: [ByokLlmAuthService],
  exports: [ByokLlmAuthService],
})
export class ByokLlmModule {}
