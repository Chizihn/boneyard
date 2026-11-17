import { Inject, Injectable } from "@nestjs/common";
import { prisma, Role, DisputeService } from "@boneyard/skeleton-core";
import type { DisputeStatus, RequestStatus, Vertical } from "@boneyard/skeleton-core";
import { PaymentSettlementService } from "../payments/payment-settlement.service";
import { NotificationsService } from "../notifications/notifications.service";

@Injectable()
export class AdminService {
  // DisputeService needs no config beyond the shared Prisma client, and
  // nothing else in this app needs to inject it separately — constructing
  // it directly here avoids registering an extra Nest provider for no benefit.
  private readonly disputes = new DisputeService(prisma);

  constructor(
    @Inject(PaymentSettlementService) private readonly settlement: PaymentSettlementService,
    @Inject(NotificationsService) private readonly notifications: NotificationsService
  ) {}

  findPendingProviders() {
    return prisma.user.findMany({
      where: { role: Role.provider, providerApprovedAt: null },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        providerApprovedAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  findDisputes(status?: DisputeStatus) {
    return prisma.dispute.findMany({
      where: status ? { status } : undefined,
      include: { request: { include: { listing: true, payment: true } } },
      orderBy: { createdAt: "asc" },
    });
  }

  claimDispute(disputeId: string, adminId: string) {
    return this.disputes.claimDispute(disputeId, adminId);
  }

  async resolveDispute(disputeId: string, adminId: string) {
    const result = await this.disputes.resolveDispute(disputeId, adminId);

    try {
      const dispute = await prisma.dispute.findUnique({
        where: { id: disputeId },
        include: { request: { include: { listing: true } } },
      });
      if (dispute?.request) {
        const title = "Dispute Resolved";
        const body = `The dispute on "${dispute.request.listing.title}" has been resolved by an administrator.`;
        const data = {
          requestId: dispute.request.id,
          listingId: dispute.request.listing.id,
          vertical: dispute.request.vertical,
        };

        void this.notifications.sendNotification({
          userId: dispute.request.requesterId,
          title,
          body,
          type: "DISPUTE_RESOLVED",
          data,
        });

        void this.notifications.sendNotification({
          userId: dispute.request.listing.providerId,
          title,
          body,
          type: "DISPUTE_RESOLVED",
          data,
        });
      }
    } catch {
      // Non-fatal notification failure
    }

    return result;
  }

  /** Shared admin activity feed — recent requests across both verticals. */
  findActivity(filters: { vertical?: Vertical; status?: RequestStatus }) {
    return prisma.request.findMany({
      where: {
        ...(filters.vertical ? { vertical: filters.vertical } : {}),
        ...(filters.status ? { status: filters.status } : {}),
      },
      include: { listing: true, payment: true, dispute: true },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
  }

  /**
   * Re-attempts a stuck payment settlement — a payment left `held` with
   * `providerReference` at `PENDING:<key>` because the Bachs call failed
   * when `complete()` first tried it. Reuses `releasePayment`, which
   * resumes under that same key rather than claiming a fresh one (see
   * .kiro/steering/payment-settlement-idempotency.md).
   */
  async retrySettlement(paymentId: string) {
    const payment = await prisma.payment.findUniqueOrThrow({
      where: { id: paymentId },
      include: { request: { include: { listing: true } } },
    });
    await this.settlement.releasePayment(paymentId, payment.request.listing.providerId);
    return prisma.payment.findUniqueOrThrow({ where: { id: paymentId } });
  }
}
