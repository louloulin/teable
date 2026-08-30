import { Module } from '@nestjs/common';
import { ApiExplorerAdminController } from './api-explorer.admin.controller';
import {
  ApiExplorerAuthService,
  DEFAULT_TEABLE_ROUTES,
  InMemoryRouteCatalog,
} from './api-explorer.auth.service';
import { DEFAULT_API_EXPLORER_OPTIONS } from './api-explorer.defaults';
import type { IApiExplorerOptions } from './api-explorer.types';

const ROUTE_CATALOG = 'API_EXPLORER_ROUTE_CATALOG';
const API_EXPLORER_OPTIONS = 'API_EXPLORER_OPTIONS';

@Module({
  controllers: [ApiExplorerAdminController],
  providers: [
    InMemoryRouteCatalog,
    {
      provide: ROUTE_CATALOG,
      useExisting: InMemoryRouteCatalog,
    },
    {
      provide: API_EXPLORER_OPTIONS,
      useValue: DEFAULT_API_EXPLORER_OPTIONS as IApiExplorerOptions,
    },
    {
      provide: ApiExplorerAuthService,
      useFactory: (catalog: InMemoryRouteCatalog, defaults: IApiExplorerOptions) =>
        new ApiExplorerAuthService(catalog, defaults),
      inject: [InMemoryRouteCatalog, API_EXPLORER_OPTIONS],
    },
  ],
  exports: [ApiExplorerAuthService, InMemoryRouteCatalog],
})
export class ApiExplorerModule {}
