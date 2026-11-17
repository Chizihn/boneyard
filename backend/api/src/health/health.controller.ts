import { Controller, Get, ServiceUnavailableException } from "@nestjs/common";
import { ApiExcludeController } from "@nestjs/swagger";
import { prisma } from "@boneyard/skeleton-core";

/**
 * Excluded from Swagger — it's an infra/liveness probe, not part of the
 * public API surface judges or clients would browse in the docs.
 */
@ApiExcludeController()
@Controller("health")
export class HealthController {
  @Get()
  async check() {
    try {
      await prisma.$queryRaw`SELECT 1`;
    } catch (err) {
      throw new ServiceUnavailableException("Database unreachable");
    }
    return { status: "ok", db: "ok", uptimeSeconds: Math.floor(process.uptime()) };
  }
}
