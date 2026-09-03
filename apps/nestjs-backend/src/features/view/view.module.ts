import { Module } from '@nestjs/common';
import { DbProvider } from '../../db-provider/db.provider';
import { CalculationModule } from '../calculation/calculation.module';
import { PermissionMatrixModule } from '../permission-matrix/permission-matrix.module';
import { PivotAggregationController } from './pivot-aggregation.controller';
import { PivotAggregationService } from './pivot-aggregation.service';
import { ViewDataSafetyLimitService } from './view-data-safety-limit.service';
import { ViewService } from './view.service';

@Module({
  imports: [CalculationModule, PermissionMatrixModule],
  controllers: [PivotAggregationController],
  providers: [ViewService, ViewDataSafetyLimitService, DbProvider, PivotAggregationService],
  exports: [ViewService, PivotAggregationService],
})
export class ViewModule {}
