import { Module } from '@nestjs/common';
import { DbProvider } from '../../db-provider/db.provider';
import { CalculationModule } from '../calculation/calculation.module';
import { PermissionMatrixModule } from '../permission-matrix/permission-matrix.module';
import { ViewDataSafetyLimitService } from './view-data-safety-limit.service';
import { ViewService } from './view.service';

@Module({
  imports: [CalculationModule, PermissionMatrixModule],
  providers: [ViewService, ViewDataSafetyLimitService, DbProvider],
  exports: [ViewService],
})
export class ViewModule {}
