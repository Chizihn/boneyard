import { Inject, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { prisma, PaymentStatus } from "@boneyard/skeleton-core";
import { BachsService } from "./bachs.service";

// No currency field exists on Payment (docs/ARCHITECTURE.md's data model
// doesn't have one) — hardcoded here as a hackathon simplification, not
// pulled from anywhere real. Revisit if a second currency is ever needed.
const SETTLEMENT_CURRENCY = "NGN";

@Injectable()
export class PaymentSettlementService {
  constructor(
    @Inject(BachsService) private readonly bachs: BachsService,
    @Inject(ConfigService) private readonly config: ConfigService
  ) {}

  /**
   * Idempotent: returns the provider's existing connected account if they
   * have one, otherwise creates one via Bachs and persists the id.
   *
   * Per docs.bachs.io/api-reference/accounts: `contact_email` (not `email`)
   * is the only required field, and `configuration` is NOT applied by
   * default — omitting it creates an account that can never hold any
   * capability, so the `recipient.capabilities.payouts` request below is
   * required for this account to ever actually receive a payout.
   */
  async ensureConnectedAccount(
    providerId: string
  ): Promise<{ accountId: string; onboardingUrl?: string }> {
    const provider = await prisma.user.findUniqueOrThrow({ where: { id: providerId } });
    if (provider.bachsAccountId) {
      return { accountId: provider.bachsAccountId };
    }

    const account = await this.bachs.createConnectedAccount({
      contact_email: provider.email,
      display_name: provider.name,
      configuration: {
        recipient: {
          capabilities: {
            payouts: { requested: true },
            transfers: { requested: true },
          },
        },
      },
    });

    await prisma.user.update({
      where: { id: providerId },
      data: { bachsAccountId: account.id },
    });

    const link = await this.bachs.createAccountLink(account.id, {
      type: "onboarding",
      refresh_url: this.config.get<string>("BACHS_CONNECT_REFRESH_URL"),
      return_url: this.config.get<string>("BACHS_CONNECT_RETURN_URL"),
    });

    return { accountId: account.id, onboardingUrl: link?.url };
  }

  /**
   * Releases a held Payment to the provider.
   *
   * If the provider has no Bachs connected account, falls back to the
   * pre-existing simulated behavior (a plain status flip) — Bachs
   * settlement is additive on top of the skeleton, not a hard requirement
   * of it, so everything that worked before a provider onboards keeps
   * working exactly the same way.
   *
   * Once a connected account exists, this follows the atomic-claim +
   * resume-under-the-same-key pattern from
   * .kiro/steering/payment-settlement-idempotency.md:
   *   1. Atomically claim the Payment row (providerReference: null ->
   *      "PENDING:<key>") before calling Bachs at all.
   *   2. Call Bachs with that key as the idempotency key.
   *   3. Only flip to `released` after the call succeeds. On failure the
   *      row stays at PENDING:<key> — a retry (e.g. the next time
   *      `complete()` is somehow invoked again) resumes under the exact
   *      same key rather than claiming a fresh one, so Bachs's own
   *      dedup-by-idempotency-key is what prevents a double payout.
   */
  async releasePayment(paymentId: string, providerId: string): Promise<void> {
    const provider = await prisma.user.findUnique({ where: { id: providerId } });

    if (!provider?.bachsAccountId) {
      await prisma.payment.update({
        where: { id: paymentId },
        data: { status: PaymentStatus.released },
      });
      return;
    }

    const payment = await prisma.payment.findUniqueOrThrow({ where: { id: paymentId } });

    let idempotencyKey: string;

    if (payment.providerReference?.startsWith("PENDING:")) {
      // Resuming a previously-interrupted settlement attempt.
      idempotencyKey = payment.providerReference.slice("PENDING:".length);
    } else if (payment.providerReference) {
      // Already settled for real — idempotent no-op.
      return;
    } else {
      idempotencyKey = paymentId;
      const claimed = await prisma.payment.updateMany({
        where: { id: paymentId, providerReference: null },
        data: { providerReference: `PENDING:${idempotencyKey}` },
      });
      if (claimed.count === 0) {
        // Lost the claim race to another call — safe no-op, the winner
        // will carry this through to `released`.
        return;
      }
    }

    const transfer = await this.bachs.createTransfer(
      {
        destination: provider.bachsAccountId,
        // Bachs transfer amounts are a decimal string, always two decimal
        // places (e.g. "200.00") — not a JSON number. See
        // docs.bachs.io/api-reference/transfers/create-a-transfer.
        amount: Number(payment.amount).toFixed(2),
        currency: SETTLEMENT_CURRENCY,
        transfer_group: `boneyard-payment-${paymentId}`,
      },
      idempotencyKey
    );

    await prisma.payment.update({
      where: { id: paymentId },
      data: { status: PaymentStatus.released, providerReference: transfer.id },
    });
  }
}
