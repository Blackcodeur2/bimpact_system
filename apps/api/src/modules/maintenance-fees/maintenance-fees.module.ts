import { Module } from '@nestjs/common';
import { LedgerModule } from '../ledger/ledger.module';
import { AdminMaintenanceFeesController, MaintenanceFeesController } from './maintenance-fees.controller';
import { MaintenanceFeesService } from './maintenance-fees.service';

@Module({
  imports: [LedgerModule],
  controllers: [MaintenanceFeesController, AdminMaintenanceFeesController],
  providers: [MaintenanceFeesService],
  exports: [MaintenanceFeesService],
})
export class MaintenanceFeesModule {}
