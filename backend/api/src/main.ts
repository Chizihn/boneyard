// Must run before anything that constructs a PrismaClient (skeleton-core's
// prisma-client.ts does this at import time), so DATABASE_URL is populated
// before that import is ever evaluated. Nest's ConfigModule only loads .env
// after the module graph is already imported — too late for this.
import "dotenv/config";
import "reflect-metadata";

// Node's fetch (undici) doesn't fall back from a broken/absent IPv6 route
// to IPv4 nearly as fast as curl's default Happy Eyeballs behavior — on a
// host with unreliable IPv6 (common in sandboxes and some hosting
// providers), outbound fetch() calls to IPv6-and-IPv4 dual-stack hosts
// (e.g. sandbox-api.bachs.io) can hang for the full connect timeout before
// giving up on IPv6, even though IPv4 would have connected instantly.
// Preferring IPv4 first sidesteps that without needing a CLI flag.
import dns from "node:dns";
dns.setDefaultResultOrder("ipv4first");

import { NestFactory } from "@nestjs/core";
import { ValidationPipe } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import helmet from "helmet";
import { AppModule } from "./app.module";
import { DomainExceptionFilter } from "./common/domain-exception.filter";

/** "*" or a comma-separated allowlist, e.g. "http://localhost:8081,https://admin.example.com" */
function parseCorsOrigin(raw: string | undefined): string | string[] | boolean {
  if (!raw) {
    // No CORS_ORIGIN set: default to permissive localhost-only, which
    // covers Expo/Next local dev without silently opening CORS to the
    // world in an unconfigured deploy.
    return ["http://localhost:3000", "http://localhost:8081", "http://localhost:19006"];
  }
  if (raw.trim() === "*") return true;
  return raw.split(",").map((origin) => origin.trim());
}

async function bootstrap() {
  // rawBody:true preserves the exact bytes Express received alongside the
  // parsed body (as req.rawBody) — required for the Bachs webhook's HMAC
  // signature, which is computed over the raw bytes. Without this, Nest's
  // JSON body parser consumes the stream and the original bytes are gone.
  const app = await NestFactory.create(AppModule, { rawBody: true });
  const config = app.get(ConfigService);

  app.use(helmet());
  app.enableCors({
    origin: parseCorsOrigin(config.get<string>("CORS_ORIGIN")),
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    })
  );
  app.useGlobalFilters(new DomainExceptionFilter());

  const swaggerConfig = new DocumentBuilder()
    .setTitle("Boneyard API")
    .setDescription(
      "Shared skeleton backend (auth, matching, order-state, payments/disputes) " +
        "powering both Hallowear and Haint. Most endpoints require a Bearer JWT " +
        "from /auth/login."
    )
    .setVersion("0.1.0")
    .addBearerAuth({ type: "http", scheme: "bearer", bearerFormat: "JWT" })
    .build();
  const swaggerDocument = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup("docs", app, swaggerDocument);

  const port = config.get<number>("PORT") ?? 4000;
  await app.listen(port);
  console.log(`Boneyard API listening on port ${port}`);
  console.log(`Swagger docs at http://localhost:${port}/docs`);
}

bootstrap();
