import { Inject, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import * as crypto from "crypto";
import {
  prisma,
  PaymentStatus,
  RequestStatus,
  Vertical,
  assertTransition,
  computeRefund,
} from "@boneyard/skeleton-core";
import { releaseHaintCapacity } from "../requests/haint-capacity.util";
import { BachsService } from "./bachs.service";

const SIGNATURE_MAX_AGE_SECONDS = 300;

const CHECKOUT_SUCCESS_EVENT_TYPES = new Set([
  "collection.succeeded",
  "checkout.completed",
  "payment.success",
]);
const CHECKOUT_FAILURE_EVENT_TYPES = new Set([
  "collection.failed",
  "checkout.expired",
  "checkout.cancelled",
  "payment.failed",
]);
// refund.created just means "accepted, processing" — nothing to act on yet;
// the final outcome is refund.paid or refund.failed. Listed explicitly so
// it doesn't log as an unrecognized type.
const REFUND_NOOP_EVENT_TYPES = new Set(["refund.created"]);
const REFUND_PAID_EVENT_TYPES = new Set(["refund.paid"]);
const REFUND_FAILED_EVENT_TYPES = new Set(["refund.failed"]);

export interface CreateCheckoutResult {
  checkoutUrl: string;
  checkoutSessionId: string;
}

export interface RefundOutcome {
  refundAmount: number;
  fromEscrow: number;
  platformAbsorbed: number;
}

/**
 * Owns both legs of real money movement that touch the requester directly:
 * creating a Bachs checkout session (collecting payment) and issuing a
 * Bachs refund (giving it back pre-acceptance). Both are asynchronous on
 * Bachs's side — a checkout isn't "paid" until a webhook says so, and a
 * refund isn't "done" until a separate webhook says so — so this service
 * owns the webhook handler for both. The payout-to-provider leg is a
 * different, unrelated flow and lives in PaymentSettlementService.
 */
@Injectable()
export class CheckoutService {
  private readonly logger = new Logger(CheckoutService.name);
  private readonly webhookSecret: string;
  private readonly successUrl: string;
  private readonly cancelUrl: string;

  constructor(
    @Inject(BachsService) private readonly bachs: BachsService,
    @Inject(ConfigService) config: ConfigService
  ) {
    this.webhookSecret = config.get<string>("BACHS_WEBHOOK_SECRET") ?? "";
    this.successUrl = config.get<string>("BACHS_CHECKOUT_SUCCESS_URL")!;
    this.cancelUrl = config.get<string>("BACHS_CHECKOUT_CANCEL_URL")!;
  }

  get isConfigured(): boolean {
    return this.bachs.isConfigured;
  }

  /**
   * Creates a real Bachs checkout session for a Payment that already
   * exists (with a pre-assigned id — see RequestsService.create, which
   * generates the Payment's id up front specifically so it can be passed
   * as metadata here, before any DB row exists). Called BEFORE opening the
   * DB transaction that actually writes the Request/Payment rows: if this
   * call fails, nothing has been written yet, so there's nothing to roll
   * back or clean up.
   */
  async createCheckoutForPayment(input: {
    paymentId: string;
    amount: number;
    requesterEmail: string;
  }): Promise<CreateCheckoutResult> {
    const session = await this.bachs.createCheckout({
      pricing: { currency: "NGN", amount: input.amount.toFixed(2) },
      customer: { email: input.requesterEmail },
      success_url: this.successUrl,
      cancel_url: this.cancelUrl,
      metadata: { paymentId: input.paymentId },
    });

    return {
      checkoutUrl: session.checkout_url,
      checkoutSessionId: session.checkout_id,
    };
  }

  /**
   * Issues a real Bachs refund for a `held` payment (pre-acceptance
   * cancellation — see RequestsService.cancel). No-ops with a
   * zero-amount result if the payment never actually collected money
   * (still `pending_checkout`) — there's nothing to refund through Bachs
   * in that case, only the Request's own cancellation matters.
   *
   * Follows .kiro/steering/payment-settlement-idempotency.md: atomic
   * claim (providerReference null -> "PENDING:<key>") before the call,
   * and the refund itself is asynchronous — this only gets the refund to
   * `pending_refund`; the refund.paid webhook is what finalizes it to
   * `refunded`. Amount is always baseAmount-derived via computeRefund,
   * capped at what's actually in escrow (fromEscrow) — never Bachs's own
   * notion of "full" (which would be the discounted total actually
   * charged, exactly the number the refund-base-amount steering rule says
   * never to use).
   */
  async refundPayment(paymentId: string): Promise<RefundOutcome> {
    const payment = await prisma.payment.findUniqueOrThrow({ where: { id: paymentId } });

    if (payment.status === PaymentStatus.pending_checkout) {
      return { refundAmount: 0, fromEscrow: 0, platformAbsorbed: 0 };
    }

    const refund = computeRefund({
      heldAmount: Number(payment.amount),
      baseAmount: Number(payment.baseAmount),
      alreadyReleased: 0,
    });

    if (payment.status !== PaymentStatus.held) {
      // Already refunded/pending_refund/released — idempotent no-op,
      // still return the computed shape so callers have consistent data.
      return refund;
    }

    if (!payment.chargeId) {
      throw new Error(
        `Payment ${paymentId} is held but has no chargeId — cannot issue a real Bachs refund.`
      );
    }

    let idempotencyKey: string;
    if (payment.providerReference?.startsWith("PENDING:")) {
      idempotencyKey = payment.providerReference.slice("PENDING:".length);
    } else if (payment.providerReference) {
      return refund; // already settled for real
    } else {
      idempotencyKey = paymentId;
      const claimed = await prisma.payment.updateMany({
        where: { id: paymentId, providerReference: null },
        data: { providerReference: `PENDING:${idempotencyKey}` },
      });
      if (claimed.count === 0) {
        return refund; // lost the claim race; the winner carries it through
      }
    }

    const bachsRefund = await this.bachs.createRefund({
      charge_id: payment.chargeId,
      reference: idempotencyKey, // == paymentId; also how the refund.paid/failed webhook finds this Payment
      idempotency_key: idempotencyKey,
      amount: refund.fromEscrow.toFixed(2),
      reason: "Cancelled before provider acceptance",
    });

    await prisma.payment.update({
      where: { id: paymentId },
      data: { status: PaymentStatus.pending_refund, providerReference: bachsRefund.refund_id },
    });

    return refund;
  }

  /**
   * HMAC-SHA256 over `${timestamp}.${rawBody}`, timing-safe compared, with
   * a 5-minute freshness window to reject replayed old signatures.
   */
  verifySignature(
    rawBody: Buffer,
    signature: string | undefined,
    timestamp: string | undefined
  ): boolean {
    if (!signature || !timestamp || !this.webhookSecret) return false;

    const sentAt = Number(timestamp);
    if (!Number.isFinite(sentAt) || Math.abs(Date.now() / 1000 - sentAt) > SIGNATURE_MAX_AGE_SECONDS) {
      return false;
    }

    const expected = crypto
      .createHmac("sha256", this.webhookSecret)
      .update(`${timestamp}.${rawBody.toString("utf8")}`)
      .digest("hex");

    const expectedBuf = Buffer.from(expected);
    const givenBuf = Buffer.from(signature);
    return expectedBuf.length === givenBuf.length && crypto.timingSafeEqual(expectedBuf, givenBuf);
  }

  /**
   * Processes a verified webhook event. Caller must verify the signature
   * first — this method only handles dedup + dispatch.
   */
  async handleWebhookEvent(rawBody: Buffer): Promise<{ received: true }> {
    const event = JSON.parse(rawBody.toString("utf8"));
    const eventId: string | undefined = event.id ?? event.data?.id;

    if (!eventId) {
      this.logger.warn("Bachs webhook event missing an id — ignoring");
      return { received: true };
    }

    // Dedup by event id BEFORE acting — see
    // .kiro/steering/payment-settlement-idempotency.md. Record first, act
    // second: if this insert succeeds but we crash before acting, the
    // event is lost rather than double-processed, which is the safer
    // failure direction for money-moving webhooks.
    try {
      await prisma.processedWebhookEvent.create({ data: { id: eventId } });
    } catch (err: any) {
      if (err?.code === "P2002") {
        return { received: true }; // already processed
      }
      throw err;
    }

    const type: string = event.type ?? "";
    const data = event.data ?? {};

    if (REFUND_NOOP_EVENT_TYPES.has(type)) {
      this.logger.log(`Bachs webhook event ${eventId} (${type}) — refund still processing, no action`);
      return { received: true };
    }

    if (REFUND_PAID_EVENT_TYPES.has(type) || REFUND_FAILED_EVENT_TYPES.has(type)) {
      // `reference` is the paymentId — see refundPayment, which sends it
      // as the refund's reference specifically so this lookup works.
      const paymentId: string | undefined = data.reference;
      if (!paymentId) {
        this.logger.warn(`Bachs refund webhook event ${eventId} (${type}) has no reference/paymentId`);
        return { received: true };
      }
      if (REFUND_PAID_EVENT_TYPES.has(type)) {
        await this.markRefundPaid(paymentId);
      } else {
        await this.markRefundFailed(paymentId);
      }
      return { received: true };
    }

    const paymentId: string | undefined = data.metadata?.paymentId;
    const checkoutSessionId: string | undefined = data.checkout_id ?? data.reference;

    const payment = paymentId
      ? await prisma.payment.findUnique({ where: { id: paymentId } })
      : checkoutSessionId
        ? await prisma.payment.findUnique({ where: { checkoutSessionId } })
        : null;

    if (!payment) {
      this.logger.warn(`Bachs webhook event ${eventId} (${type}) didn't resolve to a known Payment`);
      return { received: true };
    }

    if (CHECKOUT_SUCCESS_EVENT_TYPES.has(type)) {
      const chargeId: string | undefined = data.charge_id ?? data.id;
      await this.markCheckoutSucceeded(payment.id, chargeId);
    } else if (CHECKOUT_FAILURE_EVENT_TYPES.has(type)) {
      await this.markCheckoutFailed(payment.id);
    } else {
      this.logger.log(`Bachs webhook event ${eventId} has unhandled type "${type}" — recorded, no action taken`);
    }

    return { received: true };
  }

  private async markCheckoutSucceeded(paymentId: string, chargeId: string | undefined): Promise<void> {
    await prisma.$transaction(async (tx) => {
      const claim = await tx.payment.updateMany({
        where: { id: paymentId, status: PaymentStatus.pending_checkout },
        data: { status: PaymentStatus.held, chargeId: chargeId ?? null },
      });
      if (claim.count === 0) return; // already held/refunded, or a duplicate — no-op

      const payment = await tx.payment.findUniqueOrThrow({ where: { id: paymentId } });
      const request = await tx.request.findUniqueOrThrow({ where: { id: payment.requestId } });

      // Asserts from the request's ACTUAL current status, not an assumed
      // REQUESTED — if it was somehow already cancelled (e.g. a failure
      // event for a different event id raced this one), this throws and
      // the whole transaction, including the payment flip above, rolls back.
      assertTransition(request.status, RequestStatus.MATCHED);
      await tx.request.update({
        where: { id: request.id },
        data: { status: RequestStatus.MATCHED },
      });
    });
  }

  private async markCheckoutFailed(paymentId: string): Promise<void> {
    // The transaction returns what to release afterward, rather than
    // mutating an outer variable from inside the closure — simpler, and
    // sidesteps TS control-flow narrowing surprises across that boundary.
    const listingToRelease = await prisma.$transaction(
      async (tx): Promise<{ listingId: string } | null> => {
        const payment = await tx.payment.findUnique({ where: { id: paymentId } });
        // Only act while still pending — if it's already held/released/
        // refunded, a late failure event is stale and must not undo it.
        if (!payment || payment.status !== PaymentStatus.pending_checkout) return null;

        const request = await tx.request.findUniqueOrThrow({ where: { id: payment.requestId } });

        try {
          assertTransition(request.status, RequestStatus.CANCELLED);
        } catch {
          return null; // already past REQUESTED somehow — nothing to do
        }

        await tx.request.update({
          where: { id: request.id },
          data: { status: RequestStatus.CANCELLED },
        });

        // Payment intentionally stays at `pending_checkout` — there's no
        // PaymentStatus value for "checkout failed, nothing was ever
        // collected" (refunded would be wrong: nothing to refund).
        // Request.status === CANCELLED is the authoritative signal that
        // this attempt is dead; Payment is just along for the ride.
        return request.vertical === Vertical.haint ? { listingId: request.listingId } : null;
      }
    );

    if (listingToRelease) {
      await releaseHaintCapacity(listingToRelease.listingId);
    }
  }

  private async markRefundPaid(paymentId: string): Promise<void> {
    const result = await prisma.payment.updateMany({
      where: { id: paymentId, status: PaymentStatus.pending_refund },
      data: { status: PaymentStatus.refunded },
    });
    if (result.count === 0) {
      this.logger.log(`refund.paid for payment ${paymentId} — already finalized or not pending_refund, no-op`);
    }
  }

  private async markRefundFailed(paymentId: string): Promise<void> {
    // No automatic reversal back to `held` — a failed refund on a
    // cancelled request needs a human to look at it (Bachs rejected the
    // refund for some reason; silently un-cancelling the request would be
    // more confusing than leaving this visible). Logged loudly so it
    // actually gets noticed rather than silently sitting in a DB column.
    const payment = await prisma.payment.findUnique({ where: { id: paymentId } });
    if (payment?.status === PaymentStatus.pending_refund) {
      this.logger.error(
        `Bachs refund FAILED for payment ${paymentId} (providerReference=${payment.providerReference}) ` +
          `— needs manual admin follow-up, left at pending_refund intentionally.`
      );
    }
  }
}
