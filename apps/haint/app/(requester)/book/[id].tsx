/**
 * Screen 3 — Book a slot
 * No date picker — windowStart/End come directly from the listing's
 * slotStart/slotEnd. POST /requests with those exact values.
 *
 * On success, renders a QR code encoding the request id as the "ticket."
 * On 409 specifically, shows "this slot just filled up" rather than a
 * generic error — the race between page-load and submit.
 *
 * QR dependency: react-native-qrcode-svg + react-native-svg (added to
 * package.json). Flagged here per spec guidance on new dependencies.
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
import * as Linking from "expo-linking";
import { useEffect, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import QRCode from "react-native-qrcode-svg";
import { api, ApiError } from "~/lib/api";
import type { BookingRequest, Listing } from "~/lib/types";

export default function BookSlot() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const theme = useTheme();
  const toast = useToast();

  const [listing, setListing] = useState<Listing | null>(null);
  const [loadingListing, setLoadingListing] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [booking, setBooking] = useState<BookingRequest | null>(null);

  useEffect(() => {
    if (!id) return;
    api.get<Listing>(`/listings/${id}`)
      .then(setListing)
      .catch(() => toast.show("Failed to load slot details.", "error"))
      .finally(() => setLoadingListing(false));
  }, [id]);

  async function handleBook() {
    if (!listing) return;
    setSubmitting(true);
    try {
      const result = await api.post<BookingRequest>("/requests", {
        listingId: listing.id,
        // Exact slot match — not user-edited
        windowStart: listing.metadata.slotStart,
        windowEnd: listing.metadata.slotEnd,
        vertical: "haint",
      });

      if (result.payment?.checkoutUrl && result.payment.status === "pending_checkout") {
        await Linking.openURL(result.payment.checkoutUrl);
      }

      setBooking(result);
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        toast.show("This slot just filled up — try another time.", "error");
      } else {
        toast.show(e instanceof ApiError ? e.message : "Booking failed.", "error");
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (loadingListing) {
    return (
      <Container style={{ alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator color={theme.palette.primary} />
      </Container>
    );
  }

  // Success — show ticket with QR
  if (booking) {
    return (
      <Container scrollable padded style={{ alignItems: "center", gap: theme.spacing.lg }}>
        <Heading size="display" style={{ textAlign: "center" }}>You're booked!</Heading>
        <BodyText color="secondary" style={{ textAlign: "center" }}>
          Present this QR code at the attraction entrance. It encodes your booking ID.
        </BodyText>

        <View
          style={{
            backgroundColor: "#FFFFFF",
            padding: theme.spacing.lg,
            borderRadius: theme.radius.lg,
          }}
        >
          <QRCode
            value={booking.id}
            size={220}
            color="#0E1512"
            backgroundColor="#FFFFFF"
          />
        </View>

        <BodyText size="xs" color="secondary" style={{ textAlign: "center" }}>
          Booking ID: {booking.id}
        </BodyText>

        <BodyText size="sm" color="secondary" style={{ textAlign: "center" }}>
          Payment is processing. Your booking is confirmed once payment clears — check My Bookings for status updates.
        </BodyText>

        <View style={{ gap: theme.spacing.md, width: "100%" }}>
          <Button label="View my bookings" onPress={() => router.push("/(requester)/bookings")} />
          <Button label="Browse more" onPress={() => router.push("/(requester)/")} variant="secondary" />
        </View>
      </Container>
    );
  }

  if (!listing) {
    return (
      <Container>
        <BackButton onPress={() => router.back()} />
        <BodyText color="secondary" style={{ marginTop: theme.spacing.md }}>Slot not found.</BodyText>
      </Container>
    );
  }

  const slotStart = new Date(listing.metadata.slotStart);
  const slotEnd = new Date(listing.metadata.slotEnd);

  return (
    <Container scrollable padded>
      <BackButton onPress={() => router.back()} />

      <Heading size="display" style={{ marginVertical: theme.spacing.lg }}>
        Confirm booking
      </Heading>

      <View style={{ gap: theme.spacing.sm, backgroundColor: theme.palette.surface, borderRadius: theme.radius.md, padding: theme.spacing.md, borderWidth: 1, borderColor: theme.palette.border }}>
        <BodyText weight="semiBold">{listing.title}</BodyText>
        <BodyText color="secondary">
          {slotStart.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
        </BodyText>
        <BodyText color="secondary">
          {slotStart.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })} – {slotEnd.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
        </BodyText>
        <BodyText weight="semiBold">${listing.metadata.pricePerTicket} / ticket</BodyText>
      </View>

      <BodyText color="secondary" size="sm" style={{ marginVertical: theme.spacing.md }}>
        You're booking the exact slot above — no date selection needed.
        You'll be taken to checkout to complete payment.
      </BodyText>

      <Button
        label={submitting ? "Booking…" : "Confirm & pay"}
        onPress={handleBook}
        disabled={submitting}
      />
    </Container>
  );
}
