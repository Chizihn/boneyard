/**
 * Screen 3 — Request to book
 * POST /requests → opens checkoutUrl if payment.status === "pending_checkout"
 * Does NOT show confirmed until a poll of GET /requests/:id shows MATCHED/held.
 */
import { BackButton, BodyText, Button, Heading, Container, useTheme, useToast } from "@boneyard/skeleton-ui";
import { Ionicons } from "@expo/vector-icons";
import DateTimePicker, { DateTimePickerAndroid } from "@react-native-community/datetimepicker";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as Linking from "expo-linking";
import { useEffect, useState } from "react";
import { ActivityIndicator, Platform, Pressable, View } from "react-native";
import { api, ApiError } from "~/lib/api";
import type { BookingRequest, Listing } from "~/lib/types";
import { useSingleBack } from "~/hooks";

function DateField({
  label,
  value,
  onChange,
  minimumDate,
}: {
  label: string;
  value: Date | null;
  onChange: (d: Date) => void;
  minimumDate?: Date;
}) {
  const theme = useTheme();
  const [iosPickerOpen, setIosPickerOpen] = useState(false);

  function open() {
    if (Platform.OS === "android") {
      DateTimePickerAndroid.open({
        value: value ?? minimumDate ?? new Date(),
        minimumDate,
        mode: "date",
        onChange: (_event, selected) => {
          if (selected) onChange(selected);
        },
      });
    } else {
      setIosPickerOpen(true);
    }
  }

  return (
    <View>
      <BodyText weight="semiBold" size="sm" style={{ marginBottom: theme.spacing.xs }}>
        {label}
      </BodyText>
      <Pressable
        onPress={open}
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${value ? value.toLocaleDateString() : "not set"}`}
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: theme.spacing.sm,
          borderWidth: 1.5,
          borderColor: theme.palette.border,
          borderRadius: theme.radius.md,
          backgroundColor: theme.palette.surface,
          paddingHorizontal: theme.spacing.md,
          paddingVertical: theme.spacing.md,
        }}
      >
        <Ionicons name="calendar-outline" size={18} color={theme.palette.textSecondary} />
        <BodyText style={{ color: value ? theme.palette.text : theme.palette.textSecondary }}>
          {value ? value.toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" }) : "Select a date"}
        </BodyText>
      </Pressable>
      {Platform.OS === "ios" && iosPickerOpen ? (
        <DateTimePicker
          value={value ?? minimumDate ?? new Date()}
          mode="date"
          display="inline"
          minimumDate={minimumDate}
          onChange={(_event, selected) => {
            setIosPickerOpen(false);
            if (selected) onChange(selected);
          }}
        />
      ) : null}
    </View>
  );
}

export default function BookScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const theme = useTheme();
  const toast = useToast();

  const [listing, setListing] = useState<Listing | null>(null);
  const [loadingListing, setLoadingListing] = useState(true);

  const [startDate, setStartDate] = useState<Date | null>(null);
  const [endDate, setEndDate] = useState<Date | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleBack = useSingleBack({
    fallback: "/(requester)/(tabs)",
    handleHardwareBack: !submitted,
    onBeforeBack: () => !submitting,
  });

  useEffect(() => {
    if (!id) return;
    api.get<Listing>(`/listings/${id}`)
      .then((l) => { setListing(l); setLoadingListing(false); })
      .catch(() => setLoadingListing(false));
  }, [id]);

  async function handleBook() {
    if (!startDate || !endDate) {
      toast.show("Pick both a start and end date.", "error");
      return;
    }
    if (endDate < startDate) {
      toast.show("End date can't be before the start date.", "error");
      return;
    }
    if (!listing) return;

    setSubmitting(true);
    try {
      const result = await api.post<BookingRequest>("/requests", {
        listingId: id,
        windowStart: startDate.toISOString(),
        windowEnd: endDate.toISOString(),
        // Required for Hallowear's matching eligibility check — the
        // listing's own category, not something the requester types.
        category: listing.metadata.category,
      });

      if (result.payment?.checkoutUrl && result.payment.status === "pending_checkout") {
        await Linking.openURL(result.payment.checkoutUrl);
      }

      setSubmitted(true);
    } catch (e) {
      toast.show(e instanceof ApiError ? e.message : "Failed to submit booking request.", "error");
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

  if (submitted) {
    return (
      <Container>
        <Heading size="display">Request submitted</Heading>
        <BodyText color="secondary" style={{ marginTop: theme.spacing.md }}>
          Your booking request has been sent. You&apos;ll see the status update in My Bookings once
          payment is confirmed and a provider accepts.
        </BodyText>
        <View style={{ marginTop: theme.spacing.xl, gap: theme.spacing.md }}>
          <Button label="View my bookings" onPress={() => router.push("/(requester)/(tabs)/bookings")} />
          <Button label="Browse more" onPress={() => router.push("/(requester)/(tabs)")} variant="secondary" />
        </View>
      </Container>
    );
  }

  const availStart = listing ? new Date(listing.metadata.availabilityStart) : undefined;
  const availEnd = listing ? new Date(listing.metadata.availabilityEnd) : undefined;

  return (
    <Container scrollable>
      <View style={{ flexDirection: "row", alignItems: "center", gap: theme.spacing.md, marginBottom: theme.spacing.lg }}>
        <BackButton onPress={handleBack} />
        <Heading size="display" style={{ flex: 1 }}>
          {listing ? `Book: ${listing.title}` : "Request to book"}
        </Heading>
      </View>

      {listing ? (
        <BodyText color="secondary" style={{ marginBottom: theme.spacing.lg }}>
          Available {availStart?.toLocaleDateString()} – {availEnd?.toLocaleDateString()} · $
          {listing.metadata.pricePerDay}/day
        </BodyText>
      ) : null}

      <View style={{ gap: theme.spacing.md, marginBottom: theme.spacing.lg }}>
        <DateField label="Start date" value={startDate} onChange={setStartDate} minimumDate={availStart} />
        <DateField label="End date" value={endDate} onChange={setEndDate} minimumDate={startDate ?? availStart} />
      </View>

      <Button
        label={submitting ? "Submitting…" : "Confirm booking request"}
        onPress={handleBook}
        disabled={submitting}
      />

      <BodyText color="secondary" size="xs" style={{ marginTop: theme.spacing.md }}>
        You&apos;ll be taken to the checkout page to complete payment. Your request is confirmed only
        once payment clears and a provider accepts.
      </BodyText>
    </Container>
  );
}
