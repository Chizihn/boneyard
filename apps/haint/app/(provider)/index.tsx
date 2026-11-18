/**
 * Screen 6 — Manage slots (provider home)
 * GET /listings/mine — list all published slots
 * Tap to edit; "close out" = PATCH active:false
 *
 * Attraction profile note (spec §5): provider name/description lives on
 * the User profile, not on Listing. There is no separate attraction-
 * profile screen — the shared Profile screen (not yet built, out of scope
 * for this spec) covers it. Flagged per spec guidance.
 */
import {
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

export default function ManageSlots() {
  const theme = useTheme();
  const router = useRouter();
  const toast = useToast();
  const { logout } = useAuth();
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setListings(await api.get<Listing[]>("/listings/mine"));
    } catch (e) {
      toast.show(e instanceof ApiError ? e.message : "Failed to load slots.", "error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <Container padded={false}>
      <View style={{ padding: theme.spacing.lg, paddingBottom: theme.spacing.sm, flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <Heading size="display">My slots</Heading>
        <Button label="+ Add slot" onPress={() => router.push("/(provider)/add-slot")} />
      </View>

      <View style={{ paddingHorizontal: theme.spacing.lg, marginBottom: theme.spacing.sm, flexDirection: "row", gap: theme.spacing.sm }}>
        <Button label="Requests" onPress={() => router.push("/(provider)/requests")} variant="secondary" />
        <Button label="Check-in" onPress={() => router.push("/(provider)/checkin")} variant="secondary" />
        <Button label="Sign out" onPress={logout} variant="secondary" />
      </View>

      {loading ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator color={theme.palette.primary} />
        </View>
      ) : listings.length === 0 ? (
        <EmptyState
          icon="calendar-outline"
          title="No slots published"
          subtitle="Add your first time slot to start accepting bookings."
          actionLabel="Add a slot"
          onAction={() => router.push("/(provider)/add-slot")}
        />
      ) : (
        <FlatList
          data={listings}
          keyExtractor={(l) => l.id}
          onRefresh={load}
          refreshing={loading}
          contentContainerStyle={{ padding: theme.spacing.lg, gap: theme.spacing.md }}
          renderItem={({ item }) => {
            const slotStart = new Date(item.metadata.slotStart);
            const remaining = item.metadata.capacity - item.metadata.bookedCount;
            return (
              <ListingCard
                title={item.title}
                subtitle={`${slotStart.toLocaleDateString("en-US", { month: "short", day: "numeric" })} · ${slotStart.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })} · ${remaining}/${item.metadata.capacity} spots`}
                price={`$${item.metadata.pricePerTicket}/ticket`}
                badge={{ label: item.active ? "Active" : "Closed", variant: item.active ? "positive" : "neutral" }}
                onPress={() => router.push(`/(provider)/slots/${item.id}/edit`)}
              />
            );
          }}
        />
      )}
    </Container>
  );
}
