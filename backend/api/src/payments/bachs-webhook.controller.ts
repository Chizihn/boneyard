import { Controller, HttpCode, Inject, Post, Req, UnauthorizedException } from "@nestjs/common";
import type { RawBodyRequest } from "@nestjs/common";
import { ApiExcludeController } from "@nestjs/swagger";
import type { Request } from "express";
import { CheckoutService } from "./checkout.service";

/**
 * Excluded from Swagger — this is Bachs calling us, not a client-facing
 * API route. Needs the raw request body (not the parsed JSON) to verify
 * the HMAC signature; see main.ts's `rawBody: true` and the global
 * ValidationPipe, which this route bypasses by not using a DTO.
 */
@ApiExcludeController()
@Controller("webhooks")
export class BachsWebhookController {
  constructor(@Inject(CheckoutService) private readonly checkout: CheckoutService) {}

  // A webhook ack is conventionally 200 OK, not Nest's default 201
  // Created for @Post() — we're not creating a resource for the caller.
  @HttpCode(200)
  @Post("bachs")
  async handle(@Req() req: RawBodyRequest<Request>) {
    const rawBody = req.rawBody;
    if (!rawBody) {
      // Should be impossible given main.ts's rawBody:true, but fail
      // closed (reject) rather than open if it ever happens.
      throw new UnauthorizedException("Missing raw body");
    }

    const signature = req.headers["x-bachs-signature"] as string | undefined;
    const timestamp = req.headers["x-bachs-timestamp"] as string | undefined;

    if (!this.checkout.verifySignature(rawBody, signature, timestamp)) {
      throw new UnauthorizedException("Invalid webhook signature");
    }

    return this.checkout.handleWebhookEvent(rawBody);
  }
}
