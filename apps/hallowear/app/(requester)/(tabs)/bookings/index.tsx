/**
 * Screen 4a — My bookings list
 * GET /requests/mine
 */
import { BodyText, Button, EmptyState, Heading, Container, StatusBadge, useTheme } from "@boneyard/skeleton-ui";
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
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await api.get<BookingRequest[]>("/requests/mine");
      setBookings(result);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to load bookings.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <Container padded={false}>
      <View style={{ padding: theme.spacing.lg, paddingBottom: theme.spacing.sm }}>
        <Heading size="display">My bookings</Heading>
      </View>

      {loading ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator color={theme.palette.primary} />
        </View>
      ) : error ? (
        <View style={{ padding: theme.spacing.lg }}>
          <BodyText style={{ color: theme.palette.status.negative.fg }}>{error}</BodyText>
          <View style={{ marginTop: theme.spacing.md }}>
            <Button label="Retry" onPress={load} />
          </View>
        </View>
      ) : bookings.length === 0 ? (
        <EmptyState
          icon="ticket-outline"
          title="No bookings yet"
          subtitle="Once you request to book something, it'll show up here."
          actionLabel="Browse costumes"
          onAction={() => router.push("/(requester)/(tabs)")}
        />
      ) : (
        <FlatList
          data={bookings}
          keyExtractor={(b) => b.id}
          contentContainerStyle={{ padding: theme.spacing.lg, gap: theme.spacing.md }}
          onRefresh={load}
          refreshing={loading}
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
                {new Date(item.windowStart).toLocaleDateString()} – {new Date(item.windowEnd).toLocaleDateString()}
              </BodyText>
              <BodyText size="sm" color="secondary">${item.amount}</BodyText>
            </Pressable>
          )}
        />
      )}
    </Container>
  );
}
