/**
 * Screen 4b — Booking detail
 * GET /requests/:id
 * Shows status, contact provider link, raise-dispute action.
 */
import { BackButton, Badge, BodyText, Button, Heading, Container, StatusBadge, useTheme } from "@boneyard/skeleton-ui";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as Linking from "expo-linking";
import { useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, View } from "react-native";
import { api, ApiError } from "~/lib/api";
import type { BookingRequest } from "~/lib/types";
import { useSingleBack } from "~/hooks";

const DISPUTABLE: BookingRequest["status"][] = ["ACCEPTED", "IN_PROGRESS", "COMPLETED"];

export default function BookingDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const theme = useTheme();
  const [booking, setBooking] = useState<BookingRequest | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [disputing, setDisputing] = useState(false);
  const [disputeError, setDisputeError] = useState<string | null>(null);
  const [disputeSuccess, setDisputeSuccess] = useState(false);

  const handleBack = useSingleBack({
    fallback: "/(requester)/(tabs)/bookings",
    handleHardwareBack: true,
    onBeforeBack: () => !disputing,
  });

  useEffect(() => {
    if (!id) return;
    api.get<BookingRequest>(`/requests/${id}`)
      .then(setBooking)
      .catch((e) => setError(e instanceof ApiError ? e.message : "Failed to load booking."))
      .finally(() => setLoading(false));
  }, [id]);

  async function handleDispute() {
    if (!id) return;
    setDisputing(true);
    setDisputeError(null);
    try {
      await api.post(`/requests/${id}/dispute`);
      setDisputeSuccess(true);
      // Refresh booking to show updated status
      const updated = await api.get<BookingRequest>(`/requests/${id}`);
      setBooking(updated);
    } catch (e) {
      setDisputeError(e instanceof ApiError ? e.message : "Failed to raise dispute.");
    } finally {
      setDisputing(false);
    }
  }

  if (loading) {
    return (
      <Container style={{ alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator color={theme.palette.primary} />
      </Container>
    );
  }

  if (error || !booking) {
    return (
      <Container>
        <BodyText style={{ color: theme.palette.status.negative.fg }}>{error ?? "Booking not found."}</BodyText>
        <View style={{ marginTop: theme.spacing.md }}>
          <Button label="Go back" onPress={handleBack} variant="secondary" />
        </View>
      </Container>
    );
  }

  const provider = booking.listing?.provider;
  const canDispute = DISPUTABLE.includes(booking.status) && booking.status !== "DISPUTED";

  return (
    <Container padded={false}>
      <ScrollView contentContainerStyle={{ padding: theme.spacing.lg, gap: theme.spacing.lg }}>
        <BackButton onPress={handleBack} />

        <View style={{ gap: theme.spacing.sm }}>
          <Heading size="display">
            {booking.listing?.title ?? "Booking"}
          </Heading>
          <StatusBadge status={booking.status} />
        </View>

        <View style={{ gap: theme.spacing.sm, backgroundColor: theme.palette.surface, borderRadius: theme.radius.md, padding: theme.spacing.md, borderWidth: 1, borderColor: theme.palette.border }}>
          <Row label="Dates" value={`${new Date(booking.windowStart).toLocaleDateString()} – ${new Date(booking.windowEnd).toLocaleDateString()}`} theme={theme} />
          <Row label="Amount" value={`$${booking.amount}`} theme={theme} />
          {booking.payment ? <Row label="Payment" value={booking.payment.status} theme={theme} /> : null}
        </View>

        {/* Contact provider */}
        {provider ? (
          <View style={{ gap: theme.spacing.sm }}>
            <BodyText weight="semiBold">Contact provider</BodyText>
            <BodyText color="secondary">{provider.name}</BodyText>
            <Button
              label={`Email ${provider.name}`}
              variant="secondary"
              onPress={() => Linking.openURL(`mailto:${provider.email}`)}
            />
          </View>
        ) : null}

        {/* Raise dispute */}
        {canDispute ? (
          <View style={{ gap: theme.spacing.sm }}>
            <Button
              label={disputing ? "Raising dispute…" : "Raise a dispute"}
              onPress={handleDispute}
              disabled={disputing}
              variant="secondary"
            />
            {disputeError ? (
              <BodyText size="sm" style={{ color: theme.palette.status.negative.fg }}>{disputeError}</BodyText>
            ) : null}
            {disputeSuccess ? (
              <BodyText size="sm" style={{ color: theme.palette.status.positive.fg }}>
                Dispute raised — our team will review it shortly.
              </BodyText>
            ) : null}
          </View>
        ) : null}
      </ScrollView>
    </Container>
  );
}

function Row({ label, value, theme }: { label: string; value: string; theme: ReturnType<typeof useTheme> }) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
      <BodyText color="secondary" size="sm">{label}</BodyText>
      <BodyText weight="semiBold" size="sm" style={{ flex: 1, textAlign: "right" }}>{value}</BodyText>
    </View>
  );
}
