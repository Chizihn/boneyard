import { Inject, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

/**
 * Thin HTTP client for Bachs (bachs.io) — Connect (connected accounts for
 * provider payouts), Transfers, and Checkout (collecting the requester's
 * payment). Both sides of the money flow are real: the requester actually
 * pays through a Bachs-hosted checkout session, and the provider actually
 * receives a payout via Connect — see PaymentSettlementService (payout)
 * and CheckoutService (charge collection + webhook) for the orchestration.
 */
@Injectable()
export class BachsService {
  private readonly logger = new Logger(BachsService.name);
  private readonly baseUrl: string;
  private readonly secretKey: string;

  constructor(@Inject(ConfigService) config: ConfigService) {
    this.baseUrl = config.get<string>("BACHS_API_URL") ?? "https://sandbox-api.bachs.io";
    this.secretKey = config.get<string>("BACHS_SECRET_KEY") ?? "";
  }

  get isConfigured(): boolean {
    return Boolean(this.secretKey);
  }

  createConnectedAccount(payload: Record<string, unknown>) {
    return this.request("POST", "/v1/accounts", payload);
  }

  getConnectedAccount(accountId: string) {
    return this.request("GET", `/v1/accounts/${accountId}`);
  }

  createAccountLink(accountId: string, payload: Record<string, unknown>) {
    return this.request("POST", `/v1/accounts/${accountId}/account-links`, payload);
  }

  createTransfer(payload: Record<string, unknown>, idempotencyKey: string) {
    return this.request("POST", "/v1/transfers", payload, { "Idempotency-Key": idempotencyKey });
  }

  createCheckout(payload: Record<string, unknown>) {
    return this.request("POST", "/v1/checkout-sessions", payload);
  }

  getCheckout(checkoutId: string) {
    return this.request("GET", `/v1/checkout-sessions/${checkoutId}`);
  }

  /**
   * Unlike createTransfer, Bachs refunds take their idempotency key as a
   * BODY field (`idempotency_key`), not an `Idempotency-Key` header —
   * confirmed from docs.bachs.io/guides/refunds, don't "fix" this to match
   * createTransfer's convention, the two endpoints just differ.
   */
  createRefund(payload: Record<string, unknown>) {
    return this.request("POST", "/v1/refunds", payload);
  }

  private async request(
    method: string,
    path: string,
    body?: Record<string, unknown>,
    extraHeaders?: Record<string, string>
  ): Promise<any> {
    if (!this.secretKey) {
      throw new Error(
        `BACHS_SECRET_KEY is not configured — cannot call the Bachs API (${method} ${path}). ` +
          "Set it in backend/api/.env. Checkout creation and refunds have no " +
          "fallback and will fail outright without it; provider payout " +
          "(PaymentSettlementService) separately falls back to a simulated " +
          "status flip only when a provider hasn't connected a Bachs account yet."
      );
    }

    const label = `${method} ${path}`;
    this.logger.log(`[${label}] request started`);

    const res = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.secretKey}`,
        ...extraHeaders,
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    const data: any = await res.json().catch(() => ({}));

    if (!res.ok) {
      this.logger.error(`[${label}] failed status=${res.status} body=${JSON.stringify(data)}`);
      const reason = data?.detail ?? data?.message ?? data?.error_code ?? "unknown error";
      throw new Error(`Bachs API error (${res.status}): ${reason}`);
    }

    this.logger.log(`[${label}] success id=${data?.id ?? "none"}`);
    return data;
  }
}
