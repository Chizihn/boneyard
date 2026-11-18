/**
 * Screen 4b — Booking detail / ticket view
 * GET /requests/:id
 * QR code re-derived from request id (not stored separately).
 * Raise dispute available once ACCEPTED/IN_PROGRESS/COMPLETED.
 */
import {
  BackButton,
  BodyText,
  Button,
  Container,
  Heading,
  StatusBadge,
  useTheme,
  useToast,
} from "@boneyard/skeleton-ui";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as Linking from "expo-linking";
import { useEffect, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import QRCode from "react-native-qrcode-svg";
import { api, ApiError } from "~/lib/api";
import type { BookingRequest } from "~/lib/types";

const DISPUTABLE: BookingRequest["status"][] = ["ACCEPTED", "IN_PROGRESS", "COMPLETED"];

export default function BookingDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const theme = useTheme();
  const toast = useToast();
  const [booking, setBooking] = useState<BookingRequest | null>(null);
  const [loading, setLoading] = useState(true);
  const [disputing, setDisputing] = useState(false);

  async function refresh() {
    if (!id) return;
    setLoading(true);
    try {
      setBooking(await api.get<BookingRequest>(`/requests/${id}`));
    } catch (e) {
      toast.show(e instanceof ApiError ? e.message : "Failed to load.", "error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { refresh(); }, [id]);

  async function handleDispute() {
    if (!id) return;
    setDisputing(true);
    try {
      await api.post(`/requests/${id}/dispute`);
      toast.show("Dispute raised — our team will review it.", "success");
      await refresh();
    } catch (e) {
      toast.show(e instanceof ApiError ? e.message : "Failed to raise dispute.", "error");
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

  if (!booking) {
    return (
      <Container>
        <BackButton onPress={() => router.back()} />
        <BodyText color="secondary" style={{ marginTop: theme.spacing.md }}>Booking not found.</BodyText>
      </Container>
    );
  }

  const provider = booking.listing?.provider;
  const canDispute = DISPUTABLE.includes(booking.status) && booking.status !== "DISPUTED";
  const showTicket = ["MATCHED", "ACCEPTED", "IN_PROGRESS", "COMPLETED"].includes(booking.status);

  return (
    <Container scrollable padded>
      <BackButton onPress={() => router.back()} />

      <View style={{ gap: theme.spacing.sm, marginTop: theme.spacing.lg }}>
        <Heading size="display">
          {booking.listing?.title ?? "Booking"}
        </Heading>
        <StatusBadge status={booking.status} />
      </View>

      {/* Ticket QR — shown once matched/accepted */}
      {showTicket ? (
        <View style={{ alignItems: "center", marginVertical: theme.spacing.xl, gap: theme.spacing.md }}>
          <BodyText weight="semiBold" size="sm">Your ticket</BodyText>
          <View style={{ backgroundColor: "#FFFFFF", padding: theme.spacing.md, borderRadius: theme.radius.md }}>
            <QRCode value={booking.id} size={180} color="#0E1512" backgroundColor="#FFFFFF" />
          </View>
          <BodyText size="xs" color="secondary">Present at the entrance</BodyText>
        </View>
      ) : null}

      {/* Details */}
      <View style={{ gap: theme.spacing.sm, backgroundColor: theme.palette.surface, borderRadius: theme.radius.md, padding: theme.spacing.md, borderWidth: 1, borderColor: theme.palette.border }}>
        <InfoRow label="Date" value={new Date(booking.windowStart).toLocaleDateString("en-US", { weekday: "short", month: "long", day: "numeric" })} theme={theme} />
        <InfoRow label="Time" value={`${new Date(booking.windowStart).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })} – ${new Date(booking.windowEnd).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`} theme={theme} />
        <InfoRow label="Amount" value={`$${booking.amount}`} theme={theme} />
        {booking.payment ? <InfoRow label="Payment" value={booking.payment.status} theme={theme} /> : null}
      </View>

      {/* Contact provider */}
      {provider ? (
        <View style={{ marginTop: theme.spacing.lg, gap: theme.spacing.sm }}>
          <BodyText weight="semiBold">Contact operator</BodyText>
          <Button
            label={`Email ${provider.name}`}
            variant="secondary"
            onPress={() => Linking.openURL(`mailto:${provider.email}`)}
          />
        </View>
      ) : null}

      {/* Dispute */}
      {canDispute ? (
        <View style={{ marginTop: theme.spacing.lg }}>
          <Button
            label={disputing ? "Raising dispute…" : "Raise a dispute"}
            variant="secondary"
            onPress={handleDispute}
            disabled={disputing}
          />
        </View>
      ) : null}
    </Container>
  );
}

function InfoRow({ label, value, theme }: { label: string; value: string; theme: ReturnType<typeof useTheme> }) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
      <BodyText color="secondary" size="sm">{label}</BodyText>
      <BodyText weight="semiBold" size="sm" style={{ flex: 1, textAlign: "right" }}>{value}</BodyText>
    </View>
  );
}
