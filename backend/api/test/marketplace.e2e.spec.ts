/**
 * End-to-end coverage for listings, requests, admin, and the real Bachs
 * checkout/refund flow — runs against the real Postgres container, not
 * mocks. Only the Bachs HTTP boundary itself is faked (there's no real
 * sandbox key in this environment); every DB-level invariant (atomic
 * claims, webhook idempotency, state transitions) is exercised for real.
 */
import "dotenv/config";
import * as crypto from "crypto";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Test } from "@nestjs/testing";
import { ValidationPipe, INestApplication } from "@nestjs/common";
import request from "supertest";
import bcrypt from "bcryptjs";
import { prisma } from "@boneyard/skeleton-core";
import { AppModule } from "../src/app.module";
import { DomainExceptionFilter } from "../src/common/domain-exception.filter";
import { BachsService } from "../src/payments/bachs.service";

const RUN_ID = Date.now();
const EMAIL_DOMAIN = `mkt-${RUN_ID}.test`;
const emailFor = (label: string) => `${label}@${EMAIL_DOMAIN}`;
const ADMIN_PASSWORD = "admin-password-123";

// Must match backend/api/.env's BACHS_WEBHOOK_SECRET — used to sign
// simulated webhook deliveries the same way a real Bachs webhook call
// would be signed.
const TEST_WEBHOOK_SECRET =
  process.env.BACHS_WEBHOOK_SECRET ?? "test-webhook-secret-for-local-dev-and-tests";

/**
 * Stands in for the real Bachs HTTP API. Every method just returns a
 * plausible success shape — the point of faking this one boundary is to
 * exercise all the real DB-level logic (atomic claims, webhook dedup,
 * state transitions) without needing a real sandbox key or live network.
 */
class FakeBachsService {
  isConfigured = true;
  private counter = 0;

  async createCheckout(_payload: Record<string, unknown>) {
    this.counter++;
    return {
      checkout_id: `chk_fake_${RUN_ID}_${this.counter}`,
      checkout_url: `https://fake-sandbox.bachs.io/checkout/${this.counter}`,
    };
  }
  async getCheckout(checkoutId: string) {
    return { id: checkoutId, status: "succeeded" };
  }
  async createConnectedAccount(_payload: Record<string, unknown>) {
    this.counter++;
    return { id: `acct_fake_${RUN_ID}_${this.counter}` };
  }
  async getConnectedAccount(accountId: string) {
    return { id: accountId };
  }
  async createAccountLink(accountId: string, _payload: Record<string, unknown>) {
    return { url: `https://fake-sandbox.bachs.io/onboard/${accountId}` };
  }
  async createTransfer(_payload: Record<string, unknown>, idempotencyKey: string) {
    return { id: `tr_fake_${idempotencyKey}` };
  }
  async createRefund(payload: Record<string, unknown>) {
    return { refund_id: `rfnd_fake_${payload.reference}`, status: "processing" };
  }
}

function signPayload(payload: object): { body: string; signature: string; timestamp: string } {
  const body = JSON.stringify(payload);
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const signature = crypto
    .createHmac("sha256", TEST_WEBHOOK_SECRET)
    .update(`${timestamp}.${body}`)
    .digest("hex");
  return { body, signature, timestamp };
}

describe("Marketplace e2e (listings, requests, admin, real Bachs checkout/refund)", () => {
  let app: INestApplication;
  let http: ReturnType<typeof request>;
  let webhookEventCounter = 0;

  let reqToken: string;
  let req2Token: string;
  let provToken: string;
  let adminToken: string;
  let hallowearListingId: string;

  function nextEventId() {
    return `evt_test_${RUN_ID}_${++webhookEventCounter}`;
  }

  function postWebhook(payload: object) {
    const { body, signature, timestamp } = signPayload(payload);
    return http
      .post("/webhooks/bachs")
      .set("Content-Type", "application/json")
      .set("X-Bachs-Signature", signature)
      .set("X-Bachs-Timestamp", timestamp)
      .send(body);
  }

  /** Simulates Bachs confirming a checkout succeeded. */
  function completeCheckout(paymentId: string, chargeId = `ch_test_${paymentId}`) {
    return postWebhook({
      id: nextEventId(),
      type: "collection.succeeded",
      data: { charge_id: chargeId, metadata: { paymentId } },
    });
  }

  /** Simulates Bachs reporting a checkout failed/expired. */
  function failCheckout(paymentId: string) {
    return postWebhook({
      id: nextEventId(),
      type: "checkout.expired",
      data: { metadata: { paymentId } },
    });
  }

  /** Simulates Bachs confirming a refund completed. */
  function confirmRefundPaid(paymentId: string) {
    return postWebhook({
      id: nextEventId(),
      type: "refund.paid",
      data: { reference: paymentId },
    });
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(BachsService)
      .useValue(new FakeBachsService())
      .compile();
    app = moduleRef.createNestApplication({ rawBody: true });
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true })
    );
    app.useGlobalFilters(new DomainExceptionFilter());
    await app.init();
    http = request(app.getHttpServer());

    await http.post("/auth/signup").send({
      email: emailFor("req"),
      password: "password123",
      name: "Requester",
      role: "requester",
    });
    await http.post("/auth/signup").send({
      email: emailFor("req2"),
      password: "password123",
      name: "Requester Two",
      role: "requester",
    });
    await http.post("/auth/signup").send({
      email: emailFor("prov"),
      password: "password123",
      name: "Provider",
      role: "provider",
    });
    await prisma.user.create({
      data: {
        email: emailFor("admin"),
        password: await bcrypt.hash(ADMIN_PASSWORD, 12),
        name: "Admin",
        role: "admin",
      },
    });

    reqToken = (await http.post("/auth/login").send({ email: emailFor("req"), password: "password123" })).body.accessToken;
    req2Token = (await http.post("/auth/login").send({ email: emailFor("req2"), password: "password123" })).body.accessToken;
    provToken = (await http.post("/auth/login").send({ email: emailFor("prov"), password: "password123" })).body.accessToken;
    adminToken = (await http.post("/auth/login").send({ email: emailFor("admin"), password: ADMIN_PASSWORD })).body.accessToken;

    const provider = await prisma.user.findUniqueOrThrow({ where: { email: emailFor("prov") } });
    await http.post(`/auth/providers/${provider.id}/approve`).set("Authorization", `Bearer ${adminToken}`);
  });

  afterAll(async () => {
    const users = await prisma.user.findMany({
      where: { email: { endsWith: `@${EMAIL_DOMAIN}` } },
      select: { id: true },
    });
    const userIds = users.map((u) => u.id);

    const listings = await prisma.listing.findMany({
      where: { providerId: { in: userIds } },
      select: { id: true },
    });
    const listingIds = listings.map((l) => l.id);

    const requests = await prisma.request.findMany({
      where: { OR: [{ requesterId: { in: userIds } }, { listingId: { in: listingIds } }] },
      select: { id: true },
    });
    const requestIds = requests.map((r) => r.id);

    await prisma.matchCandidate.deleteMany({ where: { requestId: { in: requestIds } } });
    await prisma.dispute.deleteMany({ where: { requestId: { in: requestIds } } });
    await prisma.payment.deleteMany({ where: { requestId: { in: requestIds } } });
    await prisma.request.deleteMany({ where: { id: { in: requestIds } } });
    await prisma.listing.deleteMany({ where: { id: { in: listingIds } } });
    await prisma.refreshToken.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });

    await app.close();
  });

  describe("Listings", () => {
    it("provider creates a hallowear listing", async () => {
      const res = await http
        .post("/listings")
        .set("Authorization", `Bearer ${provToken}`)
        .send({
          title: "Vampire Cape",
          vertical: "hallowear",
          metadata: {
            category: "costume",
            availabilityStart: "2026-10-01T00:00:00.000Z",
            availabilityEnd: "2026-11-30T00:00:00.000Z",
            pricePerDay: 20,
          },
          location: { lat: 37.7749, lng: -122.4194 },
        })
        .expect(201);

      hallowearListingId = res.body.id;
      expect(res.body.active).toBe(true);
    });

    it("a requester cannot create a listing (403)", async () => {
      await http
        .post("/listings")
        .set("Authorization", `Bearer ${reqToken}`)
        .send({
          title: "x",
          vertical: "hallowear",
          metadata: {},
          location: { lat: 0, lng: 0 },
        })
        .expect(403);
    });

    it("a different provider cannot edit this listing (403)", async () => {
      await http.post("/auth/signup").send({
        email: emailFor("prov2"),
        password: "password123",
        name: "Provider Two",
        role: "provider",
      });
      const prov2Token = (
        await http.post("/auth/login").send({ email: emailFor("prov2"), password: "password123" })
      ).body.accessToken;

      await http
        .patch(`/listings/${hallowearListingId}`)
        .set("Authorization", `Bearer ${prov2Token}`)
        .send({ title: "hijacked" })
        .expect(403);
    });

    it("search finds the listing, ranked, with no password field anywhere in the response", async () => {
      const res = await http
        .get("/listings/search")
        .query({
          vertical: "hallowear",
          windowStart: "2026-10-15T00:00:00.000Z",
          windowEnd: "2026-10-17T00:00:00.000Z",
          lat: 37.78,
          lng: -122.42,
          category: "costume",
        })
        .set("Authorization", `Bearer ${reqToken}`)
        .expect(200);

      expect(res.body.candidates.length).toBeGreaterThan(0);
      // Not asserting candidates[0] specifically: this search isn't scoped
      // to this test run's own data, so an unrelated listing elsewhere in
      // the DB that happens to also match could legitimately outrank it.
      expect(
        res.body.candidates.some((c: { listingId: string }) => c.listingId === hallowearListingId)
      ).toBe(true);
      // Regression test: this endpoint used to leak the full provider
      // relation (including the bcrypt password hash) via `include: { provider: true }`.
      expect(JSON.stringify(res.body)).not.toContain("password");
    });
  });

  describe("Request lifecycle (Hallowear) — full real checkout via simulated webhook", () => {
    let requestId: string;
    let paymentId: string;

    it("requester books the listing — price computed server-side (2 nights x $20 = $40), checkout pending", async () => {
      const res = await http
        .post("/requests")
        .set("Authorization", `Bearer ${reqToken}`)
        .send({
          listingId: hallowearListingId,
          windowStart: "2026-10-15T00:00:00.000Z",
          windowEnd: "2026-10-17T00:00:00.000Z",
          category: "costume",
        })
        .expect(201);

      requestId = res.body.id;
      paymentId = res.body.payment.id;
      // Not MATCHED/held yet — nothing has confirmed the requester actually paid.
      expect(res.body.status).toBe("REQUESTED");
      expect(res.body.amount).toBe("40");
      expect(res.body.payment.status).toBe("pending_checkout");
      expect(res.body.payment.baseAmount).toBe("40");
      expect(res.body.payment.checkoutUrl).toContain("fake-sandbox.bachs.io");
    });

    it("the webhook confirming payment flips REQUESTED->MATCHED and pending_checkout->held", async () => {
      await completeCheckout(paymentId).expect(200);

      const res = await http
        .get(`/requests/${requestId}`)
        .set("Authorization", `Bearer ${reqToken}`)
        .expect(200);

      expect(res.body.status).toBe("MATCHED");
      expect(res.body.payment.status).toBe("held");
    });

    it("a duplicate delivery of the same webhook event is a no-op (idempotent dedup)", async () => {
      // Re-send the exact same event id — must not double-process.
      const payload = {
        id: `evt_test_${RUN_ID}_dup_${paymentId}`,
        type: "collection.succeeded",
        data: { charge_id: `ch_dup_${paymentId}`, metadata: { paymentId } },
      };
      const { body, signature, timestamp } = signPayload(payload);
      const send = () =>
        http
          .post("/webhooks/bachs")
          .set("Content-Type", "application/json")
          .set("X-Bachs-Signature", signature)
          .set("X-Bachs-Timestamp", timestamp)
          .send(body);

      await send().expect(200);
      await send().expect(200); // second delivery of the identical event id

      const res = await http
        .get(`/requests/${requestId}`)
        .set("Authorization", `Bearer ${reqToken}`)
        .expect(200);
      expect(res.body.status).toBe("MATCHED"); // unchanged, not double-processed
    });

    it("an unsigned/invalid webhook signature is rejected with 401", async () => {
      await http
        .post("/webhooks/bachs")
        .set("Content-Type", "application/json")
        .set("X-Bachs-Signature", "not-a-real-signature")
        .set("X-Bachs-Timestamp", Math.floor(Date.now() / 1000).toString())
        .send(JSON.stringify({ id: "evt_fake", type: "collection.succeeded", data: {} }))
        .expect(401);
    });

    it("completing before acceptance is an invalid transition (409)", async () => {
      await http
        .post(`/requests/${requestId}/complete`)
        .set("Authorization", `Bearer ${provToken}`)
        .expect(409);
    });

    it("the requester cannot accept their own request (403 — provider-only)", async () => {
      await http
        .post(`/requests/${requestId}/accept`)
        .set("Authorization", `Bearer ${reqToken}`)
        .expect(403);
    });

    it("provider sees it under /requests/incoming", async () => {
      const res = await http
        .get("/requests/incoming")
        .set("Authorization", `Bearer ${provToken}`)
        .expect(200);
      expect(res.body.some((r: { id: string }) => r.id === requestId)).toBe(true);
    });

    it("provider accepts, starts, and completes — payment releases in full", async () => {
      await http.post(`/requests/${requestId}/accept`).set("Authorization", `Bearer ${provToken}`).expect(201);
      await http.post(`/requests/${requestId}/start`).set("Authorization", `Bearer ${provToken}`).expect(201);
      const res = await http
        .post(`/requests/${requestId}/complete`)
        .set("Authorization", `Bearer ${provToken}`)
        .expect(201);

      expect(res.body.status).toBe("COMPLETED");
      expect(res.body.payment.status).toBe("released");
      expect(res.body.payment.amount).toBe("40");
    });
  });

  describe("Checkout failure path", () => {
    it("a checkout.expired webhook cancels the request and leaves payment at pending_checkout (nothing to refund)", async () => {
      const created = await http
        .post("/requests")
        .set("Authorization", `Bearer ${reqToken}`)
        .send({
          listingId: hallowearListingId,
          windowStart: "2026-10-18T00:00:00.000Z",
          windowEnd: "2026-10-19T00:00:00.000Z",
          category: "costume",
        })
        .expect(201);

      await failCheckout(created.body.payment.id).expect(200);

      const res = await http
        .get(`/requests/${created.body.id}`)
        .set("Authorization", `Bearer ${reqToken}`)
        .expect(200);

      expect(res.body.status).toBe("CANCELLED");
      // Never actually collected — correctly NOT marked "refunded".
      expect(res.body.payment.status).toBe("pending_checkout");
    });
  });

  describe("Cancel + real refund (via simulated webhook)", () => {
    it("requester cancels a paid MATCHED request: refund is created (pending_refund), then confirmed by webhook", async () => {
      const created = await http
        .post("/requests")
        .set("Authorization", `Bearer ${reqToken}`)
        .send({
          listingId: hallowearListingId,
          windowStart: "2026-10-20T00:00:00.000Z",
          windowEnd: "2026-10-21T00:00:00.000Z",
          category: "costume",
        })
        .expect(201);
      const paymentId = created.body.payment.id;

      // Must actually be paid (held) first — cancelling a never-collected
      // payment is the "checkout failure" path tested above, not this one.
      await completeCheckout(paymentId).expect(200);

      const cancelRes = await http
        .post(`/requests/${created.body.id}/cancel`)
        .set("Authorization", `Bearer ${reqToken}`)
        .expect(201);

      expect(cancelRes.body.status).toBe("CANCELLED");
      // Refund created but not yet confirmed — Bachs refunds are async too.
      expect(cancelRes.body.payment.status).toBe("pending_refund");

      await confirmRefundPaid(paymentId).expect(200);

      const finalRes = await http
        .get(`/requests/${created.body.id}`)
        .set("Authorization", `Bearer ${reqToken}`)
        .expect(200);
      expect(finalRes.body.payment.status).toBe("refunded");
      expect(finalRes.body.payment.amount).toBe("20");
    });
  });

  describe("Dispute raise + admin resolution", () => {
    it("full flow: raise -> admin claims -> admin resolves with baseAmount-derived refund", async () => {
      const created = await http
        .post("/requests")
        .set("Authorization", `Bearer ${reqToken}`)
        .send({
          listingId: hallowearListingId,
          windowStart: "2026-10-22T00:00:00.000Z",
          windowEnd: "2026-10-23T00:00:00.000Z",
          category: "costume",
        })
        .expect(201);
      const requestId = created.body.id;

      await completeCheckout(created.body.payment.id).expect(200);
      await http.post(`/requests/${requestId}/accept`).set("Authorization", `Bearer ${provToken}`).expect(201);
      await http.post(`/requests/${requestId}/start`).set("Authorization", `Bearer ${provToken}`).expect(201);

      const disputed = await http
        .post(`/requests/${requestId}/dispute`)
        .set("Authorization", `Bearer ${reqToken}`)
        .send({ reason: "Costume arrived damaged" })
        .expect(201);
      expect(disputed.body.status).toBe("DISPUTED");
      const disputeId = disputed.body.dispute.id;

      // Non-admin can't touch the dispute queue.
      await http.get("/admin/disputes").set("Authorization", `Bearer ${reqToken}`).expect(403);

      const openList = await http
        .get("/admin/disputes")
        .query({ status: "open" })
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(200);
      expect(openList.body.some((d: { id: string }) => d.id === disputeId)).toBe(true);

      await http.post(`/admin/disputes/${disputeId}/claim`).set("Authorization", `Bearer ${adminToken}`).expect(201);

      // A second claim attempt on an already-claimed dispute must fail —
      // same atomic guard verified in isolation in skeleton-core's own tests.
      await http.post(`/admin/disputes/${disputeId}/claim`).set("Authorization", `Bearer ${adminToken}`).expect(409);

      const resolved = await http
        .post(`/admin/disputes/${disputeId}/resolve`)
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(201);

      expect(resolved.body.dispute.status).toBe("resolved");
      expect(resolved.body.refund.refundAmount).toBe(20);
      expect(resolved.body.refund.fromEscrow).toBe(20);
      expect(resolved.body.refund.platformAbsorbed).toBe(0);
    });
  });

  describe("Admin: pending providers and activity feed", () => {
    it("lists a pending (unapproved) provider without leaking its password hash", async () => {
      await http.post("/auth/signup").send({
        email: emailFor("prov-pending"),
        password: "password123",
        name: "Pending Provider",
        role: "provider",
      });

      const res = await http
        .get("/admin/providers/pending")
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(200);

      expect(res.body.some((p: { email: string }) => p.email === emailFor("prov-pending"))).toBe(true);
      expect(JSON.stringify(res.body)).not.toContain("password");
    });

    it("activity feed filters by vertical", async () => {
      const res = await http
        .get("/admin/requests")
        .query({ vertical: "hallowear" })
        .set("Authorization", `Bearer ${adminToken}`)
        .expect(200);
      expect(res.body.length).toBeGreaterThan(0);
      expect(res.body.every((r: { vertical: string }) => r.vertical === "hallowear")).toBe(true);
    });
  });

  describe("Haint slot capacity — atomic guard under real concurrency", () => {
    it("exactly `capacity` concurrent bookings succeed; the rest are rejected, bookedCount never exceeds capacity", async () => {
      const listing = await http
        .post("/listings")
        .set("Authorization", `Bearer ${provToken}`)
        .send({
          title: "Crypt Tour",
          vertical: "haint",
          metadata: {
            slotStart: "2026-10-31T21:00:00.000Z",
            slotEnd: "2026-10-31T21:30:00.000Z",
            capacity: 3,
            bookedCount: 0,
            rating: 4.0,
            pricePerTicket: 10,
          },
          location: { lat: 37.7749, lng: -122.4194 },
        })
        .expect(201);

      const body = {
        listingId: listing.body.id,
        windowStart: "2026-10-31T21:00:00.000Z",
        windowEnd: "2026-10-31T21:30:00.000Z",
      };

      const attempts = Array.from({ length: 8 }, () =>
        http.post("/requests").set("Authorization", `Bearer ${reqToken}`).send(body)
      );
      const results = await Promise.all(attempts.map((p) => p.then((r) => r.status)));

      const successes = results.filter((s) => s === 201).length;
      const failures = results.filter((s) => s === 409).length;

      expect(successes).toBe(3);
      expect(failures).toBe(5);

      const final = await http
        .get(`/listings/${listing.body.id}`)
        .set("Authorization", `Bearer ${reqToken}`)
        .expect(200);
      expect(final.body.metadata.bookedCount).toBe(3);
    });
  });
});
