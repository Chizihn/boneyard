/**
 * End-to-end tests for the push & in-app notifications system.
 * Verified against real Postgres container.
 */
import "dotenv/config";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Test } from "@nestjs/testing";
import { ValidationPipe, INestApplication } from "@nestjs/common";
import request from "supertest";
import bcrypt from "bcryptjs";
import { prisma, Role } from "@boneyard/skeleton-core";
import { AppModule } from "../src/app.module";
import { DomainExceptionFilter } from "../src/common/domain-exception.filter";
import { PushService } from "../src/notifications/push.service";
import { NotificationsService } from "../src/notifications/notifications.service";

const RUN_ID = Date.now();
const EMAIL_DOMAIN = `notif-${RUN_ID}.test`;
const emailFor = (label: string) => `${label}@${EMAIL_DOMAIN}`;
const ADMIN_PASSWORD = "admin-password-123";

describe("Notifications System e2e", () => {
  let app: INestApplication;
  let http: ReturnType<typeof request>;
  let pushService: PushService;
  let notificationsService: NotificationsService;

  let reqToken: string;
  let reqUserId: string;
  let provToken: string;
  let provUserId: string;
  let adminToken: string;
  let adminUserId: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true })
    );
    app.useGlobalFilters(new DomainExceptionFilter());
    await app.init();
    http = request(app.getHttpServer());

    pushService = app.get(PushService);
    notificationsService = app.get(NotificationsService);

    // Sign up requester
    const reqRes = await http.post("/auth/signup").send({
      email: emailFor("requester"),
      password: "password123",
      name: "Requester User",
      role: "requester",
    });
    reqUserId = reqRes.body.id;
    const reqLoginRes = await http.post("/auth/login").send({
      email: emailFor("requester"),
      password: "password123",
    });
    reqToken = reqLoginRes.body.accessToken;

    // Sign up provider
    const provRes = await http.post("/auth/signup").send({
      email: emailFor("provider"),
      password: "password123",
      name: "Provider User",
      role: "provider",
    });
    provUserId = provRes.body.id;
    const provLoginRes = await http.post("/auth/login").send({
      email: emailFor("provider"),
      password: "password123",
    });
    provToken = provLoginRes.body.accessToken;

    // Seed admin
    const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 10);
    const admin = await prisma.user.create({
      data: {
        email: emailFor("admin"),
        password: passwordHash,
        name: "Admin User",
        role: Role.admin,
      },
    });
    adminUserId = admin.id;

    const adminLoginRes = await http.post("/auth/login").send({
      email: emailFor("admin"),
      password: ADMIN_PASSWORD,
    });
    adminToken = adminLoginRes.body.accessToken;

    // Approve provider
    await http
      .post(`/auth/providers/${provUserId}/approve`)
      .set("Authorization", `Bearer ${adminToken}`);
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
    await prisma.notification.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.userPushToken.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.refreshToken.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });

    await app.close();
  });

  describe("Device Push Token Registration", () => {
    const validExpoToken = "ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]";

    it("rejects invalid push token format with 400", async () => {
      const res = await http
        .post("/notifications/devices")
        .set("Authorization", `Bearer ${reqToken}`)
        .send({
          token: "not-a-valid-expo-token",
          platform: "ios",
        });

      expect(res.status).toBe(400);
      expect(JSON.stringify(res.body)).toContain("valid Expo push token");
    });

    it("registers a valid Expo push token with metadata", async () => {
      const res = await http
        .post("/notifications/devices")
        .set("Authorization", `Bearer ${reqToken}`)
        .send({
          token: validExpoToken,
          platform: "ios",
          appType: "hallowear",
          deviceId: "iphone-15-pro-max",
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);

      const saved = await prisma.userPushToken.findUnique({
        where: { token: validExpoToken },
      });
      expect(saved).not.toBeNull();
      expect(saved?.userId).toBe(reqUserId);
      expect(saved?.platform).toBe("ios");
      expect(saved?.appType).toBe("hallowear");
      expect(saved?.deviceId).toBe("iphone-15-pro-max");
      expect(saved?.active).toBe(true);
    });

    it("is idempotent: re-registering the same token updates existing record", async () => {
      const res = await http
        .post("/notifications/devices")
        .set("Authorization", `Bearer ${reqToken}`)
        .send({
          token: validExpoToken,
          platform: "android",
          appType: "haint",
        });

      expect(res.status).toBe(201);

      const saved = await prisma.userPushToken.findUnique({
        where: { token: validExpoToken },
      });
      expect(saved?.platform).toBe("android");
      expect(saved?.appType).toBe("haint");
      expect(saved?.active).toBe(true);
    });

    it("unregisters/deactivates a token on logout via POST", async () => {
      const res = await http
        .post("/notifications/devices/unregister")
        .set("Authorization", `Bearer ${reqToken}`)
        .send({ token: validExpoToken });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);

      const saved = await prisma.userPushToken.findUnique({
        where: { token: validExpoToken },
      });
      expect(saved?.active).toBe(false);
    });

    it("unregisters/deactivates a token via DELETE endpoint", async () => {
      // First reactivate
      await http
        .post("/notifications/devices")
        .set("Authorization", `Bearer ${reqToken}`)
        .send({ token: validExpoToken, platform: "ios" });

      const res = await http
        .delete(`/notifications/devices/${encodeURIComponent(validExpoToken)}`)
        .set("Authorization", `Bearer ${reqToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const saved = await prisma.userPushToken.findUnique({
        where: { token: validExpoToken },
      });
      expect(saved?.active).toBe(false);
    });
  });

  describe("In-App Notification Center & Unread Count", () => {
    let createdNotifId: string;

    beforeAll(async () => {
      // Create some in-app notifications directly
      const n1 = await notificationsService.sendNotification({
        userId: reqUserId,
        title: "Test Alert 1",
        body: "First test notification body",
        type: "TEST_ALERT",
        data: { foo: "bar" },
      });
      createdNotifId = n1.id;

      await notificationsService.sendNotification({
        userId: reqUserId,
        title: "Test Alert 2",
        body: "Second test notification body",
        type: "TEST_ALERT",
      });
    });

    it("retrieves paginated in-app notifications with unread count", async () => {
      const res = await http
        .get("/notifications?page=1&limit=10")
        .set("Authorization", `Bearer ${reqToken}`);

      expect(res.status).toBe(200);
      expect(res.body.items).toBeInstanceOf(Array);
      expect(res.body.items.length).toBeGreaterThanOrEqual(2);
      expect(res.body.unreadCount).toBeGreaterThanOrEqual(2);
      expect(res.body.meta.total).toBeGreaterThanOrEqual(2);
      expect(res.body.meta.page).toBe(1);
    });

    it("retrieves quick unread-count for badge counter", async () => {
      const res = await http
        .get("/notifications/unread-count")
        .set("Authorization", `Bearer ${reqToken}`);

      expect(res.status).toBe(200);
      expect(typeof res.body.unreadCount).toBe("number");
      expect(res.body.unreadCount).toBeGreaterThanOrEqual(2);
    });

    it("marks a single notification as read", async () => {
      const res = await http
        .patch(`/notifications/${createdNotifId}/read`)
        .set("Authorization", `Bearer ${reqToken}`);

      expect(res.status).toBe(200);
      expect(res.body.isRead).toBe(true);
      expect(res.body.readAt).not.toBeNull();
    });

    it("returns 404 when marking nonexistent notification as read", async () => {
      const res = await http
        .patch("/notifications/00000000-0000-0000-0000-000000000000/read")
        .set("Authorization", `Bearer ${reqToken}`);

      expect(res.status).toBe(404);
    });

    it("marks all notifications as read", async () => {
      const res = await http
        .patch("/notifications/read-all")
        .set("Authorization", `Bearer ${reqToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const unreadRes = await http
        .get("/notifications/unread-count")
        .set("Authorization", `Bearer ${reqToken}`);

      expect(unreadRes.body.unreadCount).toBe(0);
    });
  });

  describe("Notification Preferences", () => {
    it("returns default preferences", async () => {
      const res = await http
        .get("/notifications/preferences")
        .set("Authorization", `Bearer ${reqToken}`);

      expect(res.status).toBe(200);
      expect(res.body.pushEnabled).toBe(true);
    });

    it("updates notification preferences", async () => {
      const res = await http
        .patch("/notifications/preferences")
        .set("Authorization", `Bearer ${reqToken}`)
        .send({
          pushEnabled: false,
          marketing: false,
        });

      expect(res.status).toBe(200);
      expect(res.body.pushEnabled).toBe(false);
      expect(res.body.marketing).toBe(false);

      // Verify persistence
      const getRes = await http
        .get("/notifications/preferences")
        .set("Authorization", `Bearer ${reqToken}`);

      expect(getRes.body.pushEnabled).toBe(false);
    });
  });

  describe("Admin Broadcast", () => {
    it("non-admin is rejected from broadcasting (403)", async () => {
      const res = await http
        .post("/notifications/admin/broadcast")
        .set("Authorization", `Bearer ${reqToken}`)
        .send({
          title: "Promo",
          body: "Spooky deals!",
        });

      expect(res.status).toBe(403);
    });

    it("admin can broadcast to all users", async () => {
      const res = await http
        .post("/notifications/admin/broadcast")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          title: "Halloween Flash Sale",
          body: "Get 20% off costume rentals this weekend only!",
          data: { promo: "HALLOWEEN20" },
        });

      expect(res.status).toBe(201);
      expect(res.body.recipientCount).toBeGreaterThanOrEqual(2);

      // Verify that provider received the in-app broadcast
      const provNotifs = await prisma.notification.findMany({
        where: { userId: provUserId, type: "SYSTEM_BROADCAST" },
      });
      expect(provNotifs.length).toBeGreaterThanOrEqual(1);
      expect(provNotifs[0].title).toBe("Halloween Flash Sale");
    });
  });

  describe("PushService Unit Validation & Dispatch", () => {
    it("validates Expo push tokens correctly", () => {
      expect(pushService.isValidExpoPushToken("ExponentPushToken[AbCd1234_-xyz]")).toBe(true);
      expect(pushService.isValidExpoPushToken("ExpoPushToken[AbCd1234_-xyz]")).toBe(true);
      expect(pushService.isValidExpoPushToken("invalid-token-string")).toBe(false);
      expect(pushService.isValidExpoPushToken("")).toBe(false);
    });

    it("deactivates stale tokens in the database", async () => {
      const staleToken = "ExponentPushToken[stale-test-token-999]";
      await prisma.userPushToken.create({
        data: {
          userId: reqUserId,
          token: staleToken,
          active: true,
        },
      });

      await pushService.deactivateTokens([staleToken]);

      const tokenRecord = await prisma.userPushToken.findUnique({
        where: { token: staleToken },
      });
      expect(tokenRecord?.active).toBe(false);
    });
  });
});
