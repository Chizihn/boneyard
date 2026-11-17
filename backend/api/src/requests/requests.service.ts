import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import * as crypto from "crypto";
import { PaymentSettlementService } from "../payments/payment-settlement.service";
import { CheckoutService } from "../payments/checkout.service";
import { NotificationsService } from "../notifications/notifications.service";
import { releaseHaintCapacity } from "./haint-capacity.util";
import {
  prisma,
  Vertical,
  RequestStatus,
  PaymentStatus,
  DisputeStatus,
  isProviderApproved,
  runMatching,
  assertTransition,
  HallowearStrategy,
  HaintStrategy,
} from "@boneyard/skeleton-core";
import type {
  ExpandingSearchConfig,
  MatchingListing,
  MatchingRequest,
  MatchingStrategy,
} from "@boneyard/skeleton-core";
import { CreateRequestDto } from "./dto/create-request.dto";

const DEFAULT_SEARCH_CONFIG: ExpandingSearchConfig = {
  startRadiusKm: 5,
  radiusStepKm: 15,
  maxRadiusKm: 150,
  maxCandidates: 20,
};

const STRATEGIES: Record<Vertical, MatchingStrategy> = {
  [Vertical.hallowear]: new HallowearStrategy(),
  [Vertical.haint]: new HaintStrategy(),
};

const REQUEST_INCLUDE = { listing: true, payment: true, dispute: true } as const;

/** Hallowear: pricePerDay x nights. Haint: flat pricePerTicket. No
 * discount path exists anywhere yet, so amount === baseAmount for every
 * request created here — the discount/platform-absorbed accounting in
 * computeRefund only actually diverges once a discount feature exists,
 * but stays correct in the meantime. */
function computeBaseAmount(
  vertical: Vertical,
  metadata: Record<string, unknown>,
  windowStart: Date,
  windowEnd: Date
): number {
  if (vertical === Vertical.hallowear) {
    const pricePerDay = Number(metadata.pricePerDay ?? 0);
    const nights = Math.max(
      1,
      Math.ceil((windowEnd.getTime() - windowStart.getTime()) / (1000 * 60 * 60 * 24))
    );
    return pricePerDay * nights;
  }
  return Number(metadata.pricePerTicket ?? 0);
}

@Injectable()
export class RequestsService {
  private readonly logger = new Logger(RequestsService.name);

  constructor(
    @Inject(PaymentSettlementService) private readonly settlement: PaymentSettlementService,
    @Inject(CheckoutService) private readonly checkout: CheckoutService,
    @Inject(NotificationsService) private readonly notifications: NotificationsService
  ) {}

  findMine(requesterId: string) {
    return prisma.request.findMany({
      where: { requesterId },
      include: REQUEST_INCLUDE,
      orderBy: { createdAt: "desc" },
    });
  }

  findIncoming(providerId: string) {
    return prisma.request.findMany({
      where: { listing: { providerId } },
      include: REQUEST_INCLUDE,
      orderBy: { createdAt: "desc" },
    });
  }

  async findByIdForUser(id: string, userId: string) {
    const request = await this.findRequestOrThrow(id);
    this.assertIsPartyToRequest(request, userId);
    return request;
  }

  /**
   * Creates a Request against a specific, already-chosen listing (the
   * requester picked it from the browse/search results). Re-runs the same
   * matching logic the search step used to (a) confirm the listing is
   * still eligible — someone else may have taken the last slot, the
   * provider may have been unapproved, etc. — and (b) persist the full
   * ranked candidate set as MatchCandidate rows, which is what makes "why
   * this provider" auditable after the fact.
   *
   * The Request stays REQUESTED (not MATCHED) and the Payment stays
   * `pending_checkout` until the Bachs webhook confirms the requester
   * actually paid — see CheckoutService. This method's job is just to
   * atomically reserve the slot and stand up a real checkout session;
   * nothing here ever marks a payment `held` without a confirmed charge.
   *
   * Ordering matters and is deliberate:
   *   1. Haint capacity is claimed atomically FIRST (its own guard, not
   *      nested in the later transaction) — before a real checkout session
   *      exists, so a requester can never be handed a checkout URL for a
   *      slot that's already gone.
   *   2. The real Bachs checkout call happens OUTSIDE any DB transaction
   *      (external I/O must never hold a transaction open), using a
   *      pre-generated Payment id so the checkout's metadata can reference
   *      it before any Payment row exists.
   *   3. If step 2 fails, step 1's claim is explicitly released (a
   *      compensating action) before the error propagates — otherwise a
   *      failed checkout-creation call would leak capacity forever.
   *   4. Only once a real checkout session exists does the (now pure-DB,
   *      fast) transaction in step 4 write the Request/Payment/
   *      MatchCandidate rows.
   */
  async create(
    requesterId: string,
    emailOrDto: string | CreateRequestDto,
    maybeDto?: CreateRequestDto
  ) {
    let requesterEmail = "";
    let dto: CreateRequestDto;

    if (typeof emailOrDto === "string") {
      requesterEmail = emailOrDto;
      dto = maybeDto!;
    } else {
      dto = emailOrDto;
      const user = await prisma.user.findUnique({
        where: { id: requesterId },
        select: { email: true },
      });
      requesterEmail = user?.email ?? "";
    }

    try {
      return await this.createInternal(requesterId, requesterEmail, dto);
    } catch (err) {
      this.logger.error(`create request failed: ${(err as Error).message}`, (err as Error).stack);
      throw err;
    }
  }

  private async createInternal(requesterId: string, requesterEmail: string, dto: CreateRequestDto) {
    const listing = await prisma.listing.findUnique({
      where: { id: dto.listingId },
      include: { provider: { select: { role: true, providerApprovedAt: true } } },
    });
    if (!listing) {
      throw new NotFoundException(`Listing "${dto.listingId}" not found.`);
    }
    if (!listing.active) {
      throw new ConflictException("This listing is not currently active.");
    }
    if (!isProviderApproved(listing.provider)) {
      throw new ConflictException("This listing's provider is not approved yet.");
    }

    const windowStart = new Date(dto.windowStart);
    const windowEnd = new Date(dto.windowEnd);
    if (!(windowEnd > windowStart)) {
      throw new ConflictException("windowEnd must be after windowStart.");
    }

    const vertical = listing.vertical;
    const strategy = STRATEGIES[vertical];

    const activeListings = await prisma.listing.findMany({
      where: { vertical, active: true },
      include: { provider: { select: { role: true, providerApprovedAt: true } } },
    });
    const pool: MatchingListing[] = activeListings.map((l) => ({
      listingId: l.id,
      providerId: l.providerId,
      vertical: l.vertical,
      location: l.location as { lat: number; lng: number },
      active: l.active,
      providerApproved: isProviderApproved(l.provider),
      metadata: l.metadata as Record<string, unknown>,
    }));

    const matchingRequest: MatchingRequest = {
      vertical,
      windowStart,
      windowEnd,
      location: listing.location as { lat: number; lng: number },
      metadata: dto.category ? { category: dto.category } : undefined,
    };

    const result = runMatching(matchingRequest, pool, strategy, DEFAULT_SEARCH_CONFIG);
    const chosen = result.candidates.find((c) => c.listingId === listing.id);
    if (!chosen) {
      throw new ConflictException(
        "This listing is no longer available for the requested window."
      );
    }

    const baseAmount = computeBaseAmount(
      vertical,
      listing.metadata as Record<string, unknown>,
      windowStart,
      windowEnd
    );

    // Step 1: claim Haint capacity atomically, BEFORE a checkout session
    // (and thus a payable URL) exists for this slot.
    if (vertical === Vertical.haint) {
      const claimed = await prisma.$queryRaw<Array<{ id: string }>>`
        UPDATE "Listing"
        SET metadata = jsonb_set(
          metadata,
          '{bookedCount}',
          to_jsonb(((metadata->>'bookedCount')::int + 1))
        )
        WHERE id = ${listing.id}
          AND (metadata->>'bookedCount')::int < (metadata->>'capacity')::int
        RETURNING id
      `;
      if (claimed.length === 0) {
        throw new ConflictException("This slot just filled up — no capacity remaining.");
      }
    }

    // Step 2: real Bachs checkout, outside any transaction. Pre-generate
    // the Payment id so it can be embedded in the checkout's metadata
    // before any Payment row exists — the webhook uses it to find the
    // Payment later without depending on Bachs's own id format.
    const paymentId = crypto.randomUUID();
    let checkout: { checkoutUrl: string; checkoutSessionId: string };
    try {
      checkout = await this.checkout.createCheckoutForPayment({
        paymentId,
        amount: baseAmount,
        requesterEmail,
      });
    } catch (err) {
      // Step 3: compensate the claim from step 1 — a failed checkout
      // creation must not leak capacity.
      if (vertical === Vertical.haint) {
        await releaseHaintCapacity(listing.id);
      }
      throw err;
    }

    // Step 4: pure-DB transaction — the Request stays REQUESTED and the
    // Payment stays `pending_checkout` until the webhook confirms payment.
    const createdRequest = await prisma.$transaction(async (tx) => {
      const request = await tx.request.create({
        data: {
          requesterId,
          listingId: listing.id,
          vertical,
          status: RequestStatus.REQUESTED,
          windowStart,
          windowEnd,
          amount: baseAmount,
        },
      });

      if (result.candidates.length > 0) {
        await tx.matchCandidate.createMany({
          data: result.candidates.map((c) => ({
            requestId: request.id,
            listingId: c.listingId,
            rank: c.rank,
            distance: c.distanceKm,
            eligible: true,
          })),
        });
      }

      await tx.payment.create({
        data: {
          id: paymentId,
          requestId: request.id,
          amount: baseAmount,
          status: PaymentStatus.pending_checkout,
          baseAmount,
          checkoutSessionId: checkout.checkoutSessionId,
          checkoutUrl: checkout.checkoutUrl,
        },
      });

      return tx.request.findUniqueOrThrow({
        where: { id: request.id },
        include: REQUEST_INCLUDE,
      });
    });

    void this.notifications.sendNotification({
      userId: listing.providerId,
      title: "New Booking Request",
      body: `You received a new booking request for "${listing.title}".`,
      type: "REQUEST_CREATED",
      data: {
        requestId: createdRequest.id,
        listingId: listing.id,
        vertical: createdRequest.vertical,
      },
    });

    return createdRequest;
  }

  /** Provider accepts a matched request: MATCHED -> ACCEPTED. */
  async accept(requestId: string, providerId: string) {
    const request = await this.findRequestOrThrow(requestId);
    this.assertIsProviderOwner(request, providerId);
    assertTransition(request.status, RequestStatus.ACCEPTED);
    const updated = await prisma.request.update({
      where: { id: requestId },
      data: { status: RequestStatus.ACCEPTED },
      include: REQUEST_INCLUDE,
    });

    void this.notifications.sendNotification({
      userId: request.requesterId,
      title: "Booking Accepted",
      body: `Your booking request for "${request.listing.title}" has been accepted.`,
      type: "REQUEST_ACCEPTED",
      data: {
        requestId: updated.id,
        listingId: request.listing.id,
        vertical: request.vertical,
      },
    });

    return updated;
  }

  /** Provider marks service as started: ACCEPTED -> IN_PROGRESS. */
  async start(requestId: string, providerId: string) {
    const request = await this.findRequestOrThrow(requestId);
    this.assertIsProviderOwner(request, providerId);
    assertTransition(request.status, RequestStatus.IN_PROGRESS);
    const updated = await prisma.request.update({
      where: { id: requestId },
      data: { status: RequestStatus.IN_PROGRESS },
      include: REQUEST_INCLUDE,
    });

    void this.notifications.sendNotification({
      userId: request.requesterId,
      title: "Service Started",
      body: `Your booking for "${request.listing.title}" is now in progress.`,
      type: "REQUEST_IN_PROGRESS",
      data: {
        requestId: updated.id,
        listingId: request.listing.id,
        vertical: request.vertical,
      },
    });

    return updated;
  }

  /**
   * Provider marks service complete: IN_PROGRESS -> COMPLETED, and releases
   * the held payment in full to the provider (no partial-release feature
   * exists, so this is always a single full release).
   *
   * The status transition and the payment release are deliberately NOT in
   * the same DB transaction: PaymentSettlementService.releasePayment may
   * make a real external call to Bachs, and a transaction must never be
   * held open across slow external I/O (that's a lock-contention problem
   * waiting to happen). Instead: the transition commits first (the service
   * was in fact rendered — that's true regardless of payout outcome), then
   * settlement is attempted. If settlement fails (e.g. Bachs is down), the
   * error is logged, not thrown — the request legitimately stays
   * COMPLETED with the payment still `held` and `providerReference` at
   * `PENDING:<key>`, which is a safe, resumable state per
   * .kiro/steering/payment-settlement-idempotency.md: calling
   * `releasePayment` again later (e.g. via an admin retry) picks up that
   * same PENDING key rather than double-paying.
   */
  async complete(requestId: string, providerId: string) {
    const request = await this.findRequestOrThrow(requestId);
    this.assertIsProviderOwner(request, providerId);
    assertTransition(request.status, RequestStatus.COMPLETED);

    await prisma.request.update({
      where: { id: requestId },
      data: { status: RequestStatus.COMPLETED },
    });

    if (request.payment) {
      try {
        await this.settlement.releasePayment(request.payment.id, providerId);
      } catch (err) {
        this.logger.error(
          `Payment settlement failed for request ${requestId}, payment ${request.payment.id}: ${(err as Error).message}`
        );
      }
    }

    void this.notifications.sendNotification({
      userId: request.requesterId,
      title: "Booking Completed",
      body: `Your booking for "${request.listing.title}" is complete.`,
      type: "REQUEST_COMPLETED",
      data: {
        requestId: request.id,
        listingId: request.listing.id,
        vertical: request.vertical,
      },
    });

    return prisma.request.findUniqueOrThrow({
      where: { id: requestId },
      include: REQUEST_INCLUDE,
    });
  }

  /**
   * Either party cancels before acceptance: REQUESTED/MATCHED -> CANCELLED.
   * Only reachable pre-acceptance by the state machine's own transition
   * table — assertTransition throws for any later state, which is the
   * correct behavior (use dispute instead once accepted).
   *
   * Same ordering principle as complete(): the status transition and
   * capacity release are fast pure-DB work and commit first; the real
   * Bachs refund (CheckoutService.refundPayment — a no-op if the payment
   * never actually collected money) is attempted after and its errors are
   * logged, not thrown. refundPayment itself only gets as far as
   * `pending_refund`; the refund.paid webhook is what finalizes it — so
   * there's nothing more for this method to wait on anyway.
   */
  async cancel(requestId: string, userId: string) {
    const request = await this.findRequestOrThrow(requestId);
    this.assertIsPartyToRequest(request, userId);
    assertTransition(request.status, RequestStatus.CANCELLED);

    await prisma.request.update({
      where: { id: requestId },
      data: { status: RequestStatus.CANCELLED },
    });

    if (request.vertical === Vertical.haint) {
      await releaseHaintCapacity(request.listingId);
    }

    if (request.payment) {
      try {
        await this.checkout.refundPayment(request.payment.id);
      } catch (err) {
        this.logger.error(
          `Refund failed for request ${requestId}, payment ${request.payment.id}: ${(err as Error).message}`
        );
      }
    }

    const cancelled = await prisma.request.findUniqueOrThrow({
      where: { id: requestId },
      include: REQUEST_INCLUDE,
    });

    const otherUserId =
      userId === request.requesterId ? request.listing.providerId : request.requesterId;
    void this.notifications.sendNotification({
      userId: otherUserId,
      title: "Booking Cancelled",
      body: `The booking for "${request.listing.title}" was cancelled.`,
      type: "REQUEST_CANCELLED",
      data: {
        requestId: request.id,
        listingId: request.listing.id,
        vertical: request.vertical,
      },
    });

    return cancelled;
  }

  /** Either party raises a dispute: IN_PROGRESS -> DISPUTED. */
  async raiseDispute(requestId: string, userId: string, reason: string | undefined) {
    const request = await this.findRequestOrThrow(requestId);
    this.assertIsPartyToRequest(request, userId);
    assertTransition(request.status, RequestStatus.DISPUTED);

    const disputed = await prisma.$transaction(async (tx) => {
      await tx.dispute.create({
        data: {
          requestId,
          raisedBy: userId,
          status: DisputeStatus.open,
          reason: reason ?? null,
        },
      });
      return tx.request.update({
        where: { id: requestId },
        data: { status: RequestStatus.DISPUTED },
        include: REQUEST_INCLUDE,
      });
    });

    const otherUserId =
      userId === request.requesterId ? request.listing.providerId : request.requesterId;
    void this.notifications.sendNotification({
      userId: otherUserId,
      title: "Dispute Opened",
      body: `A dispute was opened for "${request.listing.title}". Reason: ${reason ?? "Not specified"}.`,
      type: "DISPUTE_RAISED",
      data: {
        requestId: request.id,
        listingId: request.listing.id,
        vertical: request.vertical,
      },
    });

    return disputed;
  }

  private async findRequestOrThrow(id: string) {
    const request = await prisma.request.findUnique({
      where: { id },
      include: REQUEST_INCLUDE,
    });
    if (!request) {
      throw new NotFoundException(`Request "${id}" not found.`);
    }
    return request;
  }

  private assertIsProviderOwner(
    request: { listing: { providerId: string } },
    userId: string
  ) {
    if (request.listing.providerId !== userId) {
      throw new ForbiddenException("You do not own the listing for this request.");
    }
  }

  private assertIsPartyToRequest(
    request: { requesterId: string; listing: { providerId: string } },
    userId: string
  ) {
    if (request.requesterId !== userId && request.listing.providerId !== userId) {
      throw new ForbiddenException("You are not a party to this request.");
    }
  }
}
