import { Controller, Get, Module, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../../common/access/access.decorators';
import { AuthContext, CurrentAuth } from '../../common/request-context';
import { LedgerModule } from '../ledger/ledger.module';
import { WalletTransactionsQueryDto } from './wallet.dto';
import { WalletService } from './wallet.service';

@ApiTags('wallet')
@ApiBearerAuth()
@Controller('wallet')
export class WalletController {
  constructor(private readonly wallets: WalletService) {}

  @RequirePermissions('wallet.read.self')
  @Get()
  getMine(@CurrentAuth() auth: AuthContext) {
    return this.wallets.getMine(auth.userId);
  }

  @RequirePermissions('wallet.read.self')
  @Get('transactions')
  listTransactions(@CurrentAuth() auth: AuthContext, @Query() query: WalletTransactionsQueryDto) {
    return this.wallets.listTransactions(auth.userId, query);
  }
}

@Module({
  imports: [LedgerModule],
  controllers: [WalletController],
  providers: [WalletService],
  exports: [WalletService],
})
export class WalletModule {}
