/**
 * End-to-end test for the auth module, against the real Postgres container
 * (not mocked) — these are the same checks run manually via curl while
 * building this module, now automated so they don't silently regress.
 *
 * Requires the local Postgres container to be up and migrated
 * (`docker compose up -d` + `pnpm --filter @boneyard/skeleton-core
 * prisma:migrate` from the repo root) and backend/api/.env to point at it.
 */
import "dotenv/config";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Test } from "@nestjs/testing";
import { ValidationPipe, INestApplication } from "@nestjs/common";
import request from "supertest";
import bcrypt from "bcryptjs";
import { prisma } from "@boneyard/skeleton-core";
import { AppModule } from "../src/app.module";
import { DomainExceptionFilter } from "../src/common/domain-exception.filter";

// Isolate this run's data with a unique email domain so repeated runs never
// collide with leftover rows, and cleanup can target exactly these rows.
const RUN_ID = Date.now();
const EMAIL_DOMAIN = `e2e-${RUN_ID}.test`;
const emailFor = (label: string) => `${label}@${EMAIL_DOMAIN}`;

describe("Auth e2e", () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true })
    );
    app.useGlobalFilters(new DomainExceptionFilter());
    await app.init();
  });

  afterAll(async () => {
    const users = await prisma.user.findMany({
      where: { email: { endsWith: `@${EMAIL_DOMAIN}` } },
      select: { id: true },
    });
    const userIds = users.map((u) => u.id);
    // RefreshToken rows reference userId — must go before the User rows.
    await prisma.refreshToken.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await app.close();
  });

  it("signs up a requester", async () => {
    const res = await request(app.getHttpServer())
      .post("/auth/signup")
      .send({ email: emailFor("req1"), password: "password123", name: "Req One", role: "requester" })
      .expect(201);

    expect(res.body.role).toBe("requester");
    expect(res.body.providerApprovedAt).toBeNull();
    expect(res.body.password).toBeUndefined();
  });

  it("signs up a provider, starting unapproved", async () => {
    const res = await request(app.getHttpServer())
      .post("/auth/signup")
      .send({ email: emailFor("prov1"), password: "password123", name: "Prov One", role: "provider" })
      .expect(201);

    expect(res.body.role).toBe("provider");
    expect(res.body.providerApprovedAt).toBeNull();
  });

  it("rejects duplicate email with 409", async () => {
    await request(app.getHttpServer())
      .post("/auth/signup")
      .send({ email: emailFor("req1"), password: "password123", name: "Dup", role: "requester" })
      .expect(409);
  });

  it("rejects role=admin at signup with 400", async () => {
    await request(app.getHttpServer())
      .post("/auth/signup")
      .send({ email: emailFor("wannabe-admin"), password: "password123", name: "X", role: "admin" })
      .expect(400);
  });

  it("rejects a malformed signup payload with 400 (ValidationPipe)", async () => {
    await request(app.getHttpServer())
      .post("/auth/signup")
      .send({ email: "not-an-email", password: "short", name: "", role: "requester" })
      .expect(400);
  });

  it("logs in with correct credentials and returns a usable token", async () => {
    const res = await request(app.getHttpServer())
      .post("/auth/login")
      .send({ email: emailFor("req1"), password: "password123" })
      .expect(201);

    expect(res.body.accessToken).toBeTruthy();
    expect(res.body.accessToken.split(".")).toHaveLength(3);
    expect(res.body.refreshToken).toBeTruthy();
    expect(res.body.user.email).toBe(emailFor("req1"));
  });

  it("rejects wrong password with 401", async () => {
    await request(app.getHttpServer())
      .post("/auth/login")
      .send({ email: emailFor("req1"), password: "wrong-password" })
      .expect(401);
  });

  describe("refresh + logout", () => {
    it("rotates a valid refresh token for a new pair, and the old one no longer works", async () => {
      const login = await request(app.getHttpServer())
        .post("/auth/login")
        .send({ email: emailFor("req1"), password: "password123" });
      const oldRefreshToken = login.body.refreshToken;

      const rotated = await request(app.getHttpServer())
        .post("/auth/refresh")
        .send({ refreshToken: oldRefreshToken })
        .expect(201);

      expect(rotated.body.accessToken).toBeTruthy();
      expect(rotated.body.refreshToken).toBeTruthy();
      expect(rotated.body.refreshToken).not.toBe(oldRefreshToken);

      // Replaying the now-rotated-away token must fail.
      await request(app.getHttpServer())
        .post("/auth/refresh")
        .send({ refreshToken: oldRefreshToken })
        .expect(401);
    });

    it("rejects an unknown/garbage refresh token with 401", async () => {
      await request(app.getHttpServer())
        .post("/auth/refresh")
        .send({ refreshToken: "not-a-real-refresh-token" })
        .expect(401);
    });

    it("logout revokes the refresh token; a subsequent refresh attempt fails", async () => {
      const login = await request(app.getHttpServer())
        .post("/auth/login")
        .send({ email: emailFor("req1"), password: "password123" });
      const refreshToken = login.body.refreshToken;

      await request(app.getHttpServer())
        .post("/auth/logout")
        .send({ refreshToken })
        .expect(201);

      await request(app.getHttpServer())
        .post("/auth/refresh")
        .send({ refreshToken })
        .expect(401);
    });

    it("logout is idempotent — a second call on the same token does not throw", async () => {
      const login = await request(app.getHttpServer())
        .post("/auth/login")
        .send({ email: emailFor("req1"), password: "password123" });
      const refreshToken = login.body.refreshToken;

      await request(app.getHttpServer()).post("/auth/logout").send({ refreshToken }).expect(201);
      await request(app.getHttpServer()).post("/auth/logout").send({ refreshToken }).expect(201);
    });
  });

  it("GET /auth/me returns the authenticated user", async () => {
    const login = await request(app.getHttpServer())
      .post("/auth/login")
      .send({ email: emailFor("req1"), password: "password123" });

    const res = await request(app.getHttpServer())
      .get("/auth/me")
      .set("Authorization", `Bearer ${login.body.accessToken}`)
      .expect(200);

    expect(res.body.email).toBe(emailFor("req1"));
  });

  it("GET /auth/me without a token returns 401", async () => {
    await request(app.getHttpServer()).get("/auth/me").expect(401);
  });

  it("GET /auth/me with a garbage token returns 401", async () => {
    await request(app.getHttpServer())
      .get("/auth/me")
      .set("Authorization", "Bearer not-a-real-token")
      .expect(401);
  });

  describe("provider approval gate", () => {
    it("a non-admin cannot approve a provider (403)", async () => {
      const login = await request(app.getHttpServer())
        .post("/auth/login")
        .send({ email: emailFor("req1"), password: "password123" });

      const provider = await prisma.user.findUniqueOrThrow({
        where: { email: emailFor("prov1") },
      });

      await request(app.getHttpServer())
        .post(`/auth/providers/${provider.id}/approve`)
        .set("Authorization", `Bearer ${login.body.accessToken}`)
        .expect(403);
    });

    const ADMIN_PASSWORD = "admin-password-123";

    it("an admin can approve a provider, and it's idempotent", async () => {
      // No self-service path to admin by design (auth-spec) — promote
      // directly, but still store a real bcrypt hash: AuthService.login
      // compares against this with bcrypt.compare, which correctly fails
      // (not throws) against a non-hash string — inserting the plaintext
      // password here would make login 401 regardless of correctness.
      await prisma.user.create({
        data: {
          email: emailFor("admin1"),
          password: await bcrypt.hash(ADMIN_PASSWORD, 12),
          name: "Admin One",
          role: "admin",
        },
      });

      const adminLogin = await request(app.getHttpServer())
        .post("/auth/login")
        .send({ email: emailFor("admin1"), password: ADMIN_PASSWORD });

      const provider = await prisma.user.findUniqueOrThrow({
        where: { email: emailFor("prov1") },
      });

      const first = await request(app.getHttpServer())
        .post(`/auth/providers/${provider.id}/approve`)
        .set("Authorization", `Bearer ${adminLogin.body.accessToken}`)
        .expect(201);
      expect(first.body.providerApprovedAt).not.toBeNull();

      const second = await request(app.getHttpServer())
        .post(`/auth/providers/${provider.id}/approve`)
        .set("Authorization", `Bearer ${adminLogin.body.accessToken}`)
        .expect(201);

      // Idempotent: the second call must not change the timestamp.
      expect(second.body.providerApprovedAt).toBe(first.body.providerApprovedAt);
    });

    it("approving a nonexistent provider id returns 404", async () => {
      const adminLogin = await request(app.getHttpServer())
        .post("/auth/login")
        .send({ email: emailFor("admin1"), password: ADMIN_PASSWORD });

      await request(app.getHttpServer())
        .post("/auth/providers/00000000-0000-0000-0000-000000000000/approve")
        .set("Authorization", `Bearer ${adminLogin.body.accessToken}`)
        .expect(404);
    });
  });
});
