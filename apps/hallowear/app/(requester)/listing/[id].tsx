/**
 * Screen 2 — Listing detail
 * GET /listings/:id
 */
import { BackButton, BodyText, Button, Heading, Container, useTheme } from "@boneyard/skeleton-ui";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, View } from "react-native";
import { api, ApiError } from "~/lib/api";
import type { Listing } from "~/lib/types";
import { useSingleBack } from "~/hooks";

export default function ListingDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const theme = useTheme();
  const [listing, setListing] = useState<Listing | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const handleBack = useSingleBack({ fallback: "/(requester)/(tabs)", handleHardwareBack: true });

  useEffect(() => {
    if (!id) return;
    api.get<Listing>(`/listings/${id}`)
      .then(setListing)
      .catch((e) => setError(e instanceof ApiError ? e.message : "Failed to load listing."))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <Container style={{ alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator color={theme.palette.primary} />
      </Container>
    );
  }

  if (error || !listing) {
    return (
      <Container>
        <BodyText style={{ color: theme.palette.status.negative.fg }}>{error ?? "Listing not found."}</BodyText>
        <View style={{ marginTop: theme.spacing.md }}>
          <Button label="Go back" onPress={handleBack} variant="secondary" />
        </View>
      </Container>
    );
  }

  const { metadata: meta } = listing;
  const availStart = new Date(meta.availabilityStart).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  const availEnd = new Date(meta.availabilityEnd).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });

  return (
    <Container padded={false}>
      <ScrollView contentContainerStyle={{ padding: theme.spacing.lg, gap: theme.spacing.md }}>
        {/* Placeholder image */}
        <View
          style={{
            height: 220,
            borderRadius: theme.radius.lg,
            backgroundColor: theme.palette.accent,
            alignItems: "center",
            justifyContent: "center",
            opacity: 0.85,
          }}
        >
          <View style={{ position: "absolute", top: theme.spacing.sm, left: theme.spacing.sm }}>
            <BackButton onPress={handleBack} />
          </View>
          <BodyText style={{ color: theme.palette.onPrimary }}>Photo placeholder</BodyText>
        </View>

        <Heading size="display">{listing.title}</Heading>

        <View style={{ gap: theme.spacing.sm }}>
          <Row label="Category" value={meta.category} theme={theme} />
          <Row label="Price" value={`$${meta.pricePerDay} / day`} theme={theme} />
          <Row label="Available" value={`${availStart} – ${availEnd}`} theme={theme} />
          {listing.provider ? <Row label="Provider" value={listing.provider.name} theme={theme} /> : null}
        </View>

        <View style={{ marginTop: theme.spacing.lg }}>
          <Button label="Request to book" onPress={() => router.push(`/(requester)/book/${listing.id}`)} />
        </View>
      </ScrollView>
    </Container>
  );
}

function Row({ label, value, theme }: { label: string; value: string; theme: ReturnType<typeof useTheme> }) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
      <BodyText color="secondary" size="sm">{label}</BodyText>
      <BodyText weight="semiBold" size="sm">{value}</BodyText>
    </View>
  );
}
