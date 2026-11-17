import * as Joi from "joi";

/**
 * Validated once at startup (via ConfigModule.forRoot's validationSchema),
 * so a misconfigured deploy fails immediately with a clear message instead
 * of booting successfully and then throwing confusingly on the first
 * request that happens to touch the missing/malformed value.
 */
export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string().valid("development", "test", "production").default("development"),
  DATABASE_URL: Joi.string()
    .uri({ scheme: ["postgres", "postgresql"] })
    .required(),
  JWT_SECRET: Joi.string().min(16).required(),
  PORT: Joi.number().integer().positive().default(4000),
  // Comma-separated list of allowed origins, or "*" for any (dev only).
  // Optional with a safe localhost default — see main.ts.
  CORS_ORIGIN: Joi.string().optional(),
  // All optional at the Joi/boot level — kept that way specifically so the
  // app (and the e2e test suite, which overrides BachsService with a fake
  // rather than hitting the real network) can still start without real
  // Bachs credentials present. That does NOT mean Bachs is optional at the
  // product level: CheckoutService/PaymentSettlementService require
  // BACHS_SECRET_KEY to actually be set for request creation and payouts
  // to work for real — if it's missing, those calls fail loudly at
  // request time (BachsService.request throws a clear error), which is
  // the correct behavior for a real deployment that forgot to configure it.
  BACHS_API_URL: Joi.string().uri().optional(),
  BACHS_SECRET_KEY: Joi.string().optional(),
  // Used to verify incoming webhook signatures — a different secret from
  // BACHS_SECRET_KEY, found separately in the Bachs dashboard.
  BACHS_WEBHOOK_SECRET: Joi.string().optional(),
  // Redirect targets after the requester finishes/cancels Bachs checkout.
  // No real app exists yet to deep-link into, hence the placeholder
  // defaults — update these once apps/hallowear and apps/haint exist.
  BACHS_CHECKOUT_SUCCESS_URL: Joi.string()
    .uri()
    .default("https://boneyard.example/payment/success"),
  BACHS_CHECKOUT_CANCEL_URL: Joi.string()
    .uri()
    .default("https://boneyard.example/payment/cancel"),
  // Redirect targets for a provider's Bachs Connect onboarding link.
  // refresh_url: the link expired/was abandoned, mint a new one.
  // return_url: onboarding finished (confirm via account.updated webhook,
  // not this redirect — see docs.bachs.io/api-reference/accounts).
  BACHS_CONNECT_REFRESH_URL: Joi.string()
    .uri()
    .default("https://boneyard.example/connect/refresh"),
  BACHS_CONNECT_RETURN_URL: Joi.string()
    .uri()
    .default("https://boneyard.example/connect/return"),
  // Optional: Expo access token for enhanced security when calling the Expo Push API
  EXPO_ACCESS_TOKEN: Joi.string().optional(),
});
