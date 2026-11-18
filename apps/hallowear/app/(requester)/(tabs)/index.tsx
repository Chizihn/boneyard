/**
 * Screen 1 — Browse listings
 * GET /listings/search?vertical=hallowear&windowStart=&windowEnd=&lat=&lng=&category=
 * windowStart/windowEnd/lat/lng are all required by the backend's
 * SearchListingsDto — browsing (not yet booking) uses a wide default date
 * window and the device's location, falling back to a fixed default
 * location (flagged in the UI) if location access isn't available.
 */
import { BodyText, Container, EmptyState, Heading, Input, ListingCard, useTheme } from "@boneyard/skeleton-ui";
import * as Location from "expo-location";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, FlatList, View } from "react-native";
import { api, ApiError } from "~/lib/api";
import type { Listing } from "~/lib/types";

// Used only if the device denies/lacks location access, so browsing still
// works rather than dead-ending — flagged to the user when it happens.
const FALLBACK_LOCATION = { lat: 37.7749, lng: -122.4194 };
const BROWSE_WINDOW_DAYS = 60;

function formatAvailability(meta: Listing["metadata"], distanceKm?: number): string {
  const start = new Date(meta.availabilityStart).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const end = new Date(meta.availabilityEnd).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const dist = distanceKm != null ? ` · ${distanceKm.toFixed(1)} mi` : "";
  return `Available ${start}–${end}${dist}`;
}

export default function BrowseListings() {
  const theme = useTheme();
  const router = useRouter();
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [category, setCategory] = useState("");
  const [usingFallbackLocation, setUsingFallbackLocation] = useState(false);

  async function resolveLocation(): Promise<{ lat: number; lng: number }> {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        setUsingFallbackLocation(true);
        return FALLBACK_LOCATION;
      }
      const pos = await Location.getCurrentPositionAsync({});
      return { lat: pos.coords.latitude, lng: pos.coords.longitude };
    } catch {
      setUsingFallbackLocation(true);
      return FALLBACK_LOCATION;
    }
  }

  async function load(cat?: string) {
    setLoading(true);
    setError(null);
    try {
      const { lat, lng } = await resolveLocation();
      const now = new Date();
      const windowEnd = new Date(now.getTime() + BROWSE_WINDOW_DAYS * 24 * 60 * 60 * 1000);
      const qs = new URLSearchParams({
        vertical: "hallowear",
        windowStart: now.toISOString(),
        windowEnd: windowEnd.toISOString(),
        lat: String(lat),
        lng: String(lng),
      });
      if (cat) qs.set("category", cat);
      const result = await api.get<Listing[]>(`/listings/search?${qs}`);
      setListings(result);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to load listings.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  return (
    <Container padded={false}>
      <View style={{ padding: theme.spacing.lg, paddingBottom: theme.spacing.md, gap: theme.spacing.md }}>
        <View>
          <Heading size="displayLg">Find a costume</Heading>
          <BodyText color="secondary" style={{ marginTop: theme.spacing.xs }}>
            Rented from people near you, ready when you need it.
          </BodyText>
        </View>
        <Input
          icon="search-outline"
          placeholder="Search by category — costume, prop…"
          value={category}
          onChangeText={setCategory}
          onSubmitEditing={() => load(category)}
          returnKeyType="search"
        />
        {usingFallbackLocation ? (
          <BodyText size="xs" color="secondary">
            Showing results near a default location — enable location access for results near you.
          </BodyText>
        ) : null}
      </View>

      {loading ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator color={theme.palette.primary} />
        </View>
      ) : error ? (
        <View style={{ padding: theme.spacing.lg, alignItems: "flex-start", gap: theme.spacing.md }}>
          <BodyText style={{ color: theme.palette.status.negative.fg }}>{error}</BodyText>
        </View>
      ) : listings.length === 0 ? (
        <EmptyState
          icon="shirt-outline"
          title="No listings yet"
          subtitle="Try a different category, or check back soon."
          actionLabel={category ? "Clear search" : undefined}
          onAction={category ? () => { setCategory(""); load(); } : undefined}
        />
      ) : (
        <FlatList
          data={listings}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ padding: theme.spacing.lg, paddingTop: 0, gap: theme.spacing.md }}
          ListHeaderComponent={
            <BodyText weight="semiBold" size="sm" color="secondary" style={{ marginBottom: theme.spacing.sm, textTransform: "uppercase", letterSpacing: 0.5 }}>
              Available now
            </BodyText>
          }
          renderItem={({ item }) => (
            <ListingCard
              title={item.title}
              subtitle={formatAvailability(item.metadata)}
              price={`$${item.metadata.pricePerDay}/day`}
              badge={{ label: item.metadata.category, variant: "highlight" }}
              onPress={() => router.push(`/(requester)/listing/${item.id}`)}
            />
          )}
        />
      )}
    </Container>
  );
}
