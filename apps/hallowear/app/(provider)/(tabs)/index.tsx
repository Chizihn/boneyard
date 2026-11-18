/**
 * Screen 6 — My listings (provider home)
 * GET /listings/mine
 * Edit → PATCH /listings/:id; "mark unavailable" = PATCH active:false
 */
import { Badge, BodyText, Button, EmptyState, Heading, ListingCard, Container, useTheme } from "@boneyard/skeleton-ui";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, FlatList, View } from "react-native";
import { api, ApiError } from "~/lib/api";
import { useAuth } from "~/lib/auth-context";
import type { Listing } from "~/lib/types";

export default function MyListings() {
  const theme = useTheme();
  const router = useRouter();
  const { logout } = useAuth();
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await api.get<Listing[]>("/listings/mine");
      setListings(result);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to load listings.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleToggleActive(listing: Listing) {
    try {
      await api.patch(`/listings/${listing.id}`, { active: !listing.active });
      await load();
    } catch { /* ignore for now */ }
  }

  return (
    <Container padded={false}>
      <View style={{ padding: theme.spacing.lg, paddingBottom: theme.spacing.sm, flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <Heading size="display">My listings</Heading>
        <Button label="+ Add item" onPress={() => router.push("/(provider)/list-item")} />
      </View>

      <View style={{ paddingHorizontal: theme.spacing.lg, marginBottom: theme.spacing.sm, flexDirection: "row", gap: theme.spacing.sm }}>
        <Button label="Incoming requests" onPress={() => router.push("/(provider)/(tabs)/requests")} variant="secondary" />
        <Button label="Sign out" onPress={logout} variant="secondary" />
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
      ) : listings.length === 0 ? (
        <EmptyState
          icon="pricetag-outline"
          title="No listings yet"
          subtitle="List your first item and start earning from your closet."
          actionLabel="List your first item"
          onAction={() => router.push("/(provider)/list-item")}
        />
      ) : (
        <FlatList
          data={listings}
          keyExtractor={(l) => l.id}
          onRefresh={load}
          refreshing={loading}
          contentContainerStyle={{ padding: theme.spacing.lg, gap: theme.spacing.md }}
          renderItem={({ item }) => (
            <ListingCard
              title={item.title}
              subtitle={`${item.metadata.category} · $${item.metadata.pricePerDay}/day`}
              price={item.active ? "Active" : "Unavailable"}
              badge={{ label: item.active ? "Active" : "Inactive", variant: item.active ? "positive" : "neutral" }}
              onPress={() => router.push(`/(provider)/listings/${item.id}/edit`)}
            />
          )}
        />
      )}
    </Container>
  );
}
