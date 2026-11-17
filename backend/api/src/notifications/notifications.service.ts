import {
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { prisma, Role } from "@boneyard/skeleton-core";
import { PushService } from "./push.service";
import { RegisterDeviceDto } from "./dto/register-device.dto";
import { ListNotificationsDto } from "./dto/list-notifications.dto";
import { BroadcastNotificationDto } from "./dto/broadcast-notification.dto";
import { UpdateNotificationPreferencesDto } from "./dto/update-preferences.dto";

export interface SendNotificationPayload {
  userId: string;
  title: string;
  body: string;
  type: string;
  data?: Record<string, unknown>;
  appType?: string;
  channelId?: string;
  sound?: "default" | null;
  priority?: "default" | "normal" | "high";
}

export interface UserPreferences {
  pushEnabled: boolean;
  orderUpdates?: boolean;
  marketing?: boolean;
  [key: string]: unknown;
}

const DEFAULT_PREFERENCES: UserPreferences = {
  pushEnabled: true,
  orderUpdates: true,
  marketing: true,
};

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(@Inject(PushService) private readonly pushService: PushService) {}

  /**
   * Register or re-activate a device push token for a user.
   * If the token was previously registered to another user (e.g. device transferred
   * or new login), it is re-assigned to the current user and marked active.
   */
  async registerPushToken(userId: string, dto: RegisterDeviceDto) {
    const token = dto.token.trim();

    await prisma.userPushToken.upsert({
      where: { token },
      create: {
        userId,
        token,
        platform: dto.platform,
        appType: dto.appType,
        deviceId: dto.deviceId,
        active: true,
      },
      update: {
        userId,
        platform: dto.platform ?? undefined,
        appType: dto.appType ?? undefined,
        deviceId: dto.deviceId ?? undefined,
        active: true,
      },
    });

    return { success: true, message: "Push token registered successfully" };
  }

  /**
   * Deactivate a device push token on logout so subsequent notifications
   * are not delivered to the logged-out device.
   */
  async unregisterPushToken(userId: string, token: string) {
    const trimmed = token.trim();
    await prisma.userPushToken.updateMany({
      where: { userId, token: trimmed },
      data: { active: false },
    });

    return { success: true, message: "Push token unregistered" };
  }

  /**
   * List paginated in-app notifications for the user, plus total and unread counts.
   */
  async listUserNotifications(userId: string, query: ListNotificationsDto) {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, Math.max(1, query.limit ?? 20));
    const skip = (page - 1) * limit;

    const [items, total, unreadCount] = await Promise.all([
      prisma.notification.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.notification.count({ where: { userId } }),
      prisma.notification.count({ where: { userId, isRead: false } }),
    ]);

    return {
      items,
      unreadCount,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Mark a single notification as read.
   */
  async markAsRead(userId: string, notificationId: string) {
    const notification = await prisma.notification.findFirst({
      where: { id: notificationId, userId },
    });

    if (!notification) {
      throw new NotFoundException(`Notification "${notificationId}" not found.`);
    }

    return prisma.notification.update({
      where: { id: notificationId },
      data: { isRead: true, readAt: new Date() },
    });
  }

  /**
   * Mark all unread notifications for a user as read.
   */
  async markAllAsRead(userId: string) {
    const result = await prisma.notification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true, readAt: new Date() },
    });

    return { count: result.count, success: true };
  }

  /**
   * Get total unread count for badge counters.
   */
  async getUnreadCount(userId: string) {
    const unreadCount = await prisma.notification.count({
      where: { userId, isRead: false },
    });

    return { unreadCount };
  }

  /**
   * Get user notification preferences.
   */
  async getPreferences(userId: string): Promise<UserPreferences> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { notificationPreferences: true },
    });

    if (!user || !user.notificationPreferences) {
      return { ...DEFAULT_PREFERENCES };
    }

    return {
      ...DEFAULT_PREFERENCES,
      ...(user.notificationPreferences as Record<string, unknown>),
    };
  }

  /**
   * Update user notification preferences.
   */
  async updatePreferences(userId: string, dto: UpdateNotificationPreferencesDto) {
    const current = await this.getPreferences(userId);
    const updated = { ...current, ...dto };

    await prisma.user.update({
      where: { id: userId },
      data: { notificationPreferences: updated },
    });

    return updated;
  }

  /**
   * Primary dispatcher:
   * 1. Persists an in-app notification row to the user's inbox.
   * 2. Checks user's notification preferences.
   * 3. Finds user's active device push token(s).
   * 4. Dispatches push notification through Expo Push Service (fire-and-forget).
   */
  async sendNotification(payload: SendNotificationPayload) {
    // 1. Create in-app notification inbox row
    const notification = await prisma.notification.create({
      data: {
        userId: payload.userId,
        title: payload.title,
        body: payload.body,
        type: payload.type,
        data: (payload.data ?? {}) as object,
      },
    });

    // 2. Dispatch push asynchronously (never blocking caller response)
    void this.dispatchPush(payload).catch((err) => {
      this.logger.warn(
        `Push dispatch failed for user ${payload.userId}: ${err instanceof Error ? err.message : String(err)}`
      );
    });

    return notification;
  }

  /**
   * Internal push dispatcher
   */
  private async dispatchPush(payload: SendNotificationPayload): Promise<void> {
    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: {
        notificationPreferences: true,
        pushTokens: {
          where: {
            active: true,
            ...(payload.appType ? { appType: payload.appType } : {}),
          },
          select: { token: true },
        },
      },
    });

    if (!user || user.pushTokens.length === 0) {
      return;
    }

    // Check preferences
    const prefs = (user.notificationPreferences as UserPreferences) ?? DEFAULT_PREFERENCES;
    if (prefs.pushEnabled === false) {
      return;
    }

    if (payload.type.startsWith("REQUEST_") && prefs.orderUpdates === false) {
      return;
    }

    const tokens = user.pushTokens.map((t) => t.token);
    const pushData: Record<string, unknown> = {
      ...(payload.data ?? {}),
      type: payload.type,
      notificationId: payload.data?.notificationId,
    };

    if (tokens.length === 1) {
      await this.pushService.sendPush(
        tokens[0],
        payload.title,
        payload.body,
        pushData,
        {
          channelId: payload.channelId ?? this.channelFor(payload.type),
          sound: payload.sound ?? "default",
          priority: payload.priority ?? "high",
        }
      );
    } else {
      await this.pushService.sendPushToMany(
        tokens,
        payload.title,
        payload.body,
        pushData,
        {
          channelId: payload.channelId ?? this.channelFor(payload.type),
          sound: payload.sound ?? "default",
          priority: payload.priority ?? "high",
        }
      );
    }
  }

  /**
   * Maps notification types to Android notification channels.
   */
  private channelFor(type: string): string {
    if (type.startsWith("REQUEST_") || type.startsWith("DISPUTE_")) {
      return "orders";
    }
    if (type === "PROVIDER_APPROVED") {
      return "account";
    }
    return "default";
  }

  /**
   * Admin broadcast: sends in-app notification + push to all users or a subset by role/appType.
   */
  async broadcast(adminId: string, dto: BroadcastNotificationDto) {
    this.logger.log(`Admin ${adminId} broadcasting: "${dto.title}"`);

    const users = await prisma.user.findMany({
      where: {
        ...(dto.targetRole ? { role: dto.targetRole } : {}),
      },
      select: {
        id: true,
        notificationPreferences: true,
        pushTokens: {
          where: {
            active: true,
            ...(dto.appType ? { appType: dto.appType } : {}),
          },
          select: { token: true },
        },
      },
    });

    if (users.length === 0) {
      return { recipientCount: 0, tokensSent: 0 };
    }

    // Create in-app notifications
    await prisma.notification.createMany({
      data: users.map((u) => ({
        userId: u.id,
        title: dto.title,
        body: dto.body,
        type: "SYSTEM_BROADCAST",
        data: (dto.data ?? {}) as object,
      })),
    });

    // Gather active tokens for users with push enabled
    const allTokens: string[] = [];
    for (const u of users) {
      const prefs = (u.notificationPreferences as UserPreferences) ?? DEFAULT_PREFERENCES;
      if (prefs.pushEnabled !== false) {
        if (dto.data?.marketing && prefs.marketing === false) {
          continue;
        }
        for (const t of u.pushTokens) {
          allTokens.push(t.token);
        }
      }
    }

    let pushResult = { successCount: 0, failedTokens: [] as string[] };
    if (allTokens.length > 0) {
      pushResult = await this.pushService.sendPushToMany(
        allTokens,
        dto.title,
        dto.body,
        {
          ...(dto.data ?? {}),
          type: "SYSTEM_BROADCAST",
        },
        { channelId: "broadcast" }
      );
    }

    return {
      recipientCount: users.length,
      tokensSent: allTokens.length,
      successCount: pushResult.successCount,
    };
  }
}
