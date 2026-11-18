/**
 * Screen 4a — My bookings
 * GET /requests/mine, StatusBadge, tap to detail/ticket view
 */
import {
  BodyText,
  Button,
  Container,
  EmptyState,
  Heading,
  StatusBadge,
  useTheme,
} from "@boneyard/skeleton-ui";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, View } from "react-native";
import { api, ApiError } from "~/lib/api";
import type { BookingRequest } from "~/lib/types";

export default function MyBookings() {
  const theme = useTheme();
  const router = useRouter();
  const [bookings, setBookings] = useState<BookingRequest[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setBookings(await api.get<BookingRequest[]>("/requests/mine"));
    } catch { /* silent — user will see empty state */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <Container padded={false}>
      <View style={{ padding: theme.spacing.lg, paddingBottom: theme.spacing.sm, flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <Heading size="display">My bookings</Heading>
        <Button label="Browse" onPress={() => router.push("/(requester)/")} variant="secondary" />
      </View>

      {loading ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator color={theme.palette.primary} />
        </View>
      ) : bookings.length === 0 ? (
        <EmptyState
          icon="ticket-outline"
          title="No bookings yet"
          subtitle="Browse haunted attractions and book your first slot."
          actionLabel="Browse attractions"
          onAction={() => router.push("/(requester)/")}
        />
      ) : (
        <FlatList
          data={bookings}
          keyExtractor={(b) => b.id}
          onRefresh={load}
          refreshing={loading}
          contentContainerStyle={{ padding: theme.spacing.lg, gap: theme.spacing.md }}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => router.push(`/(requester)/bookings/${item.id}`)}
              style={{
                backgroundColor: theme.palette.surface,
                borderRadius: theme.radius.md,
                padding: theme.spacing.md,
                borderWidth: 1,
                borderColor: theme.palette.border,
                gap: theme.spacing.sm,
              }}
            >
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <BodyText weight="semiBold" numberOfLines={1} style={{ flex: 1 }}>
                  {item.listing?.title ?? `Booking ${item.id.slice(0, 8)}`}
                </BodyText>
                <StatusBadge status={item.status} />
              </View>
              <BodyText size="sm" color="secondary">
                {new Date(item.windowStart).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                {" · "}
                {new Date(item.windowStart).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
              </BodyText>
              <BodyText size="sm" color="secondary">${item.amount}</BodyText>
            </Pressable>
          )}
        />
      )}
    </Container>
  );
}
