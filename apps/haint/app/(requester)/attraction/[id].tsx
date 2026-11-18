/**
 * Screen 2 — Attraction detail
 * GET /listings/:id
 *
 * Design note (flagged per spec §2): the data model has one Listing per
 * bookable slot (not one Listing with an array of slots). "Other times"
 * from the same provider would need GET /listings/search?providerId=X —
 * that endpoint parameter isn't confirmed as implemented in backend/api,
 * so this screen shows the single slot's detail without an "other times"
 * section. Add that once the endpoint is confirmed.
 */
import {
  BackButton,
  BodyText,
  Button,
  Container,
  Heading,
  useTheme,
  useToast,
} from "@boneyard/skeleton-ui";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { api, ApiError } from "~/lib/api";
import type { Listing } from "~/lib/types";

export default function AttractionDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const theme = useTheme();
  const toast = useToast();
  const [listing, setListing] = useState<Listing | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    api.get<Listing>(`/listings/${id}`)
      .then(setListing)
      .catch((e) => toast.show(e instanceof ApiError ? e.message : "Failed to load.", "error"))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <Container style={{ alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator color={theme.palette.primary} />
      </Container>
    );
  }

  if (!listing) {
    return (
      <Container>
        <BackButton onPress={() => router.back()} />
        <BodyText color="secondary" style={{ marginTop: theme.spacing.md }}>Attraction not found.</BodyText>
      </Container>
    );
  }

  const { metadata: meta } = listing;
  const slotStart = new Date(meta.slotStart);
  const slotEnd = new Date(meta.slotEnd);
  const remaining = meta.capacity - meta.bookedCount;
  const isFull = remaining <= 0;

  return (
    <Container scrollable padded>
      <BackButton onPress={() => router.back()} />

      {/* Placeholder image area */}
      <View
        style={{
          height: 200,
          borderRadius: theme.radius.lg,
          backgroundColor: theme.palette.surface,
          borderWidth: 1,
          borderColor: theme.palette.border,
          alignItems: "center",
          justifyContent: "center",
          marginVertical: theme.spacing.lg,
        }}
      >
        <BodyText color="secondary" size="sm">Photo placeholder</BodyText>
      </View>

      <Heading size="display">{listing.title}</Heading>
      {listing.provider ? (
        <BodyText color="secondary">{listing.provider.name}</BodyText>
      ) : null}

      <View style={{ gap: theme.spacing.sm, marginTop: theme.spacing.md }}>
        <InfoRow label="Date" value={slotStart.toLocaleDateString("en-US", { weekday: "short", month: "long", day: "numeric" })} theme={theme} />
        <InfoRow label="Time" value={`${slotStart.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })} – ${slotEnd.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`} theme={theme} />
        <InfoRow label="Price" value={`$${meta.pricePerTicket} / ticket`} theme={theme} />
        <InfoRow label="Rating" value={`★ ${meta.rating.toFixed(1)}`} theme={theme} />
        <InfoRow label="Spots left" value={isFull ? "Sold out" : `${remaining} of ${meta.capacity}`} theme={theme} />
      </View>

      <View style={{ marginTop: theme.spacing.xl }}>
        {isFull ? (
          <BodyText style={{ color: theme.palette.status.negative.fg, textAlign: "center" }}>
            This slot is sold out.
          </BodyText>
        ) : (
          <Button
            label="Book this slot"
            onPress={() => router.push(`/(requester)/book/${listing.id}`)}
          />
        )}
      </View>
    </Container>
  );
}

function InfoRow({ label, value, theme }: { label: string; value: string; theme: ReturnType<typeof useTheme> }) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: theme.spacing.xs, borderBottomWidth: 1, borderBottomColor: theme.palette.border }}>
      <BodyText color="secondary" size="sm">{label}</BodyText>
      <BodyText weight="semiBold" size="sm">{value}</BodyText>
    </View>
  );
}
