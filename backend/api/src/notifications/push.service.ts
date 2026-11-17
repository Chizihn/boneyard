import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { prisma } from "@boneyard/skeleton-core";

export interface ExpoPushMessage {
  to: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  sound?: "default" | null;
  badge?: number;
  channelId?: string;
  priority?: "default" | "normal" | "high";
}

export interface ExpoPushTicket {
  id?: string;
  status: "ok" | "error";
  message?: string;
  details?: { error?: string };
}

export interface PushSendResult {
  successCount: number;
  failedTokens: string[];
}

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
const EXPO_TOKEN_REGEX = /^Expo(?:nent)?PushToken\[.+\]$/;
const MAX_BATCH_SIZE = 100;

@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name);
  private readonly accessToken: string | undefined;

  constructor(private readonly config: ConfigService) {
    this.accessToken = this.config.get<string>("EXPO_ACCESS_TOKEN");
  }

  /**
   * Validates if a string is a valid Expo Push Token format.
   */
  isValidExpoPushToken(token: string): boolean {
    return typeof token === "string" && EXPO_TOKEN_REGEX.test(token.trim());
  }

  /**
   * Send a push notification to a single device token.
   * Returns true if accepted by Expo gateway, false otherwise.
   */
  async sendPush(
    token: string,
    title: string,
    body: string,
    data?: Record<string, unknown>,
    options?: { sound?: "default" | null; priority?: "default" | "normal" | "high"; channelId?: string; badge?: number }
  ): Promise<boolean> {
    if (!this.isValidExpoPushToken(token)) {
      this.logger.warn(`Invalid Expo push token format: ${token}`);
      return false;
    }

    const result = await this.sendBatch([
      {
        to: token.trim(),
        title,
        body,
        data,
        sound: options?.sound ?? "default",
        priority: options?.priority ?? "high",
        channelId: options?.channelId,
        badge: options?.badge,
      },
    ]);

    return result.successCount > 0;
  }

  /**
   * Send notification content to multiple device tokens in batches of 100.
   */
  async sendPushToMany(
    pushTokens: string[],
    title: string,
    body: string,
    data?: Record<string, unknown>,
    options?: { sound?: "default" | null; priority?: "default" | "normal" | "high"; channelId?: string; badge?: number }
  ): Promise<PushSendResult> {
    const validTokens = [...new Set(pushTokens)].filter((t) => this.isValidExpoPushToken(t));

    if (validTokens.length === 0) {
      return { successCount: 0, failedTokens: [] };
    }

    const messages: ExpoPushMessage[] = validTokens.map((to) => ({
      to,
      title,
      body,
      data,
      sound: options?.sound ?? "default",
      priority: options?.priority ?? "high",
      channelId: options?.channelId,
      badge: options?.badge,
    }));

    const aggregated: PushSendResult = { successCount: 0, failedTokens: [] };

    for (let i = 0; i < messages.length; i += MAX_BATCH_SIZE) {
      const batch = messages.slice(i, i + MAX_BATCH_SIZE);
      const result = await this.sendBatch(batch);
      aggregated.successCount += result.successCount;
      aggregated.failedTokens.push(...result.failedTokens);
    }

    return aggregated;
  }

  /**
   * Dispatches a single batch of at most 100 messages to Expo's Push API.
   */
  private async sendBatch(messages: ExpoPushMessage[]): Promise<PushSendResult> {
    const result: PushSendResult = { successCount: 0, failedTokens: [] };
    const staleTokens: string[] = [];

    try {
      const headers: Record<string, string> = {
        Accept: "application/json",
        "Accept-Encoding": "gzip, deflate",
        "Content-Type": "application/json",
      };

      if (this.accessToken) {
        headers["Authorization"] = `Bearer ${this.accessToken}`;
      }

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10_000);

      const response = await fetch(EXPO_PUSH_URL, {
        method: "POST",
        headers,
        body: JSON.stringify(messages),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!response.ok) {
        this.logger.error(
          `Expo push API returned HTTP ${response.status}: ${response.statusText}`
        );
        result.failedTokens.push(...messages.map((m) => m.to));
        return result;
      }

      const resBody = (await response.json()) as { data?: ExpoPushTicket[] };
      const tickets = resBody.data ?? [];

      for (let i = 0; i < tickets.length; i++) {
        const ticket = tickets[i];
        const targetToken = messages[i]?.to;

        if (ticket.status === "ok") {
          result.successCount++;
        } else {
          if (targetToken) {
            result.failedTokens.push(targetToken);
          }

          // DeviceNotRegistered indicates the app was uninstalled or token expired
          if (ticket.details?.error === "DeviceNotRegistered") {
            if (targetToken) {
              staleTokens.push(targetToken);
            }
            this.logger.log(`DeviceNotRegistered: token has become stale`);
          } else {
            this.logger.warn(
              `Push ticket error: ${ticket.message ?? "unknown"} [${ticket.details?.error ?? "none"}]`
            );
          }
        }
      }

      this.logger.log(
        `Expo push batch completed: ${result.successCount}/${tickets.length} accepted`
      );
    } catch (error) {
      this.logger.error(
        "Failed to deliver push notification batch to Expo API",
        error instanceof Error ? error.stack : undefined
      );
      result.failedTokens.push(...messages.map((m) => m.to));
    }

    if (staleTokens.length > 0) {
      // Clean up stale tokens in background so dead devices don't receive future pushes
      void this.deactivateTokens(staleTokens).catch((err) => {
        this.logger.error(
          "Failed to deactivate stale push tokens",
          err instanceof Error ? err.stack : undefined
        );
      });
    }

    return result;
  }

  /**
   * Marks tokens reported as DeviceNotRegistered as inactive.
   */
  async deactivateTokens(tokens: string[]): Promise<void> {
    if (tokens.length === 0) return;
    const res = await prisma.userPushToken.updateMany({
      where: { token: { in: tokens } },
      data: { active: false },
    });
    this.logger.log(`Deactivated ${res.count} stale push token(s)`);
  }
}
