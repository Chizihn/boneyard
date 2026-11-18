/**
 * Screen 1 — Browse attractions
 * GET /listings/search?vertical=haint
 * No category filter (Haint has no category field).
 * Shows remaining capacity badge (warning) when ≤ 3 slots left.
 */
import {
  Badge,
  BodyText,
  Button,
  Container,
  EmptyState,
  Heading,
  ListingCard,
  useTheme,
  useToast,
} from "@boneyard/skeleton-ui";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, FlatList, View } from "react-native";
import { api, ApiError } from "~/lib/api";
import { useAuth } from "~/lib/auth-context";
import type { Listing } from "~/lib/types";

function slotSubtitle(meta: Listing["metadata"]): string {
  const start = new Date(meta.slotStart);
  const end = new Date(meta.slotEnd);
  const dateStr = start.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const timeStr = `${start.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}–${end.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`;
  const remaining = meta.capacity - meta.bookedCount;
  return `${dateStr} · ${timeStr} · ${remaining} left · ★ ${meta.rating.toFixed(1)}`;
}

export default function BrowseAttractions() {
  const theme = useTheme();
  const router = useRouter();
  const toast = useToast();
  const { logout } = useAuth();
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await api.get<Listing[]>("/listings/search?vertical=haint");
      setListings(result);
    } catch (e) {
      toast.show(e instanceof ApiError ? e.message : "Failed to load attractions.", "error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <Container padded={false}>
      {/* Header */}
      <View style={{ padding: theme.spacing.lg, paddingBottom: theme.spacing.sm, flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <Heading size="display">Attractions</Heading>
        <View style={{ flexDirection: "row", gap: theme.spacing.sm }}>
          <Button label="Bookings" onPress={() => router.push("/(requester)/bookings")} variant="secondary" />
          <Button label="Sign out" onPress={logout} variant="secondary" />
        </View>
      </View>

      {loading ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator color={theme.palette.primary} />
        </View>
      ) : listings.length === 0 ? (
        <EmptyState
          icon="skull-outline"
          title="No attractions yet"
          subtitle="Check back closer to Halloween season."
          actionLabel="Refresh"
          onAction={load}
        />
      ) : (
        <FlatList
          data={listings}
          keyExtractor={(l) => l.id}
          onRefresh={load}
          refreshing={loading}
          contentContainerStyle={{ padding: theme.spacing.lg, gap: theme.spacing.md }}
          renderItem={({ item }) => {
            const remaining = item.metadata.capacity - item.metadata.bookedCount;
            const lowCapacity = remaining <= 3;
            return (
              <ListingCard
                title={item.title}
                subtitle={slotSubtitle(item.metadata)}
                price={`$${item.metadata.pricePerTicket}/ticket`}
                badge={lowCapacity ? { label: `${remaining} left`, variant: "warning" } : undefined}
                onPress={() => router.push(`/(requester)/attraction/${item.id}`)}
              />
            );
          }}
        />
      )}
    </Container>
  );
}
