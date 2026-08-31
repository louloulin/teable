import { Module } from '@nestjs/common';
import { GenericConnectorController } from './generic-connector.controller';
import { GenericConnectorService } from './generic-connector.service';

/**
 * Round-23: Generic Connector module — pluggable driver registry for
 * arbitrary external data sources (Cloud §Connect & Migrate More Sources).
 *
 * Built-in adapters ship in `generic-connector.adapters.ts`:
 *   - rest-api       (POST + pagination, expects {items: []})
 *   - json-endpoint  (GET + JSON response, arrays or single objects)
 *   - csv-url        (GET + CSV text, first row = headers)
 *
 * Runtime registration via POST /register — adds an adapter type that
 * future admin UI can wire to an actual fetcher function.
 *
 * ~520 LOC across 5 files. Different from source-specific drivers in
 * that there is no per-vendor module — one registry serves all.
 */
@Module({
  controllers: [GenericConnectorController],
  providers: [GenericConnectorService],
  exports: [GenericConnectorService],
})
export class GenericConnectorModule {}
