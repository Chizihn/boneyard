import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { BachsService } from "./bachs.service";
import { PaymentSettlementService } from "./payment-settlement.service";
import { CheckoutService } from "./checkout.service";
import { PaymentsController } from "./payments.controller";
import { BachsWebhookController } from "./bachs-webhook.controller";

@Module({
  imports: [AuthModule],
  controllers: [PaymentsController, BachsWebhookController],
  providers: [BachsService, PaymentSettlementService, CheckoutService],
  exports: [PaymentSettlementService, CheckoutService],
})
export class PaymentsModule {}
