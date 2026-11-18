/**
 * Screen 6b — Edit listing
 * GET /listings/:id  →  PATCH /listings/:id
 * "Mark unavailable" = PATCH active:false
 */
import { BackButton, BodyText, Button, Heading, Container, useTheme } from "@boneyard/skeleton-ui";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, TextInput, View } from "react-native";
import { api, ApiError } from "~/lib/api";
import type { Listing } from "~/lib/types";
import { useSingleBack } from "~/hooks";

export default function EditListing() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const theme = useTheme();

  const [listing, setListing] = useState<Listing | null>(null);
  const [loading, setLoading] = useState(true);

  // Editable fields
  const [title, setTitle] = useState("");
  const [pricePerDay, setPricePerDay] = useState("");
  const [availStart, setAvailStart] = useState("");
  const [availEnd, setAvailEnd] = useState("");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const handleBack = useSingleBack({
    fallback: "/(provider)/(tabs)",
    handleHardwareBack: true,
    onBeforeBack: () => !saving,
  });

  useEffect(() => {
    if (!id) return;
    api.get<Listing>(`/listings/${id}`)
      .then((l) => {
        setListing(l);
        setTitle(l.title);
        setPricePerDay(String(l.metadata.pricePerDay));
        setAvailStart(l.metadata.availabilityStart.slice(0, 10));
        setAvailEnd(l.metadata.availabilityEnd.slice(0, 10));
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [id]);

  async function handleSave() {
    if (!listing) return;
    const price = parseFloat(pricePerDay);
    if (isNaN(price) || price <= 0) { setError("Price must be a positive number."); return; }
    setSaving(true);
    setError(null);
    try {
      await api.patch(`/listings/${listing.id}`, {
        title: title.trim(),
        metadata: {
          ...listing.metadata,
          pricePerDay: price,
          availabilityStart: new Date(availStart).toISOString(),
          availabilityEnd: new Date(availEnd).toISOString(),
        },
      });
      setSaved(true);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to save.");
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleActive() {
    if (!listing) return;
    setSaving(true);
    try {
      await api.patch(`/listings/${listing.id}`, { active: !listing.active });
      setListing({ ...listing, active: !listing.active });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to update.");
    } finally {
      setSaving(false);
    }
  }

  const inputStyle = {
    borderWidth: 1,
    borderColor: theme.palette.border,
    borderRadius: theme.radius.md,
    padding: theme.spacing.md,
    color: theme.palette.text,
    fontFamily: theme.fontFamily.body,
    fontSize: theme.fontSize.md,
    backgroundColor: theme.palette.surface,
    marginBottom: theme.spacing.md,
  };

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
        <BodyText style={{ color: theme.palette.status.negative.fg }}>Listing not found.</BodyText>
        <View style={{ marginTop: theme.spacing.md }}>
          <Button label="Go back" onPress={handleBack} variant="secondary" />
        </View>
      </Container>
    );
  }

  return (
    <Container padded={false}>
      <ScrollView contentContainerStyle={{ padding: theme.spacing.lg }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: theme.spacing.md, marginVertical: theme.spacing.lg }}>
          <BackButton onPress={handleBack} />
          <Heading size="display">Edit listing</Heading>
        </View>

        {saved ? (
          <BodyText size="sm" style={{ color: theme.palette.status.positive.fg, marginBottom: theme.spacing.md }}>
            Saved successfully.
          </BodyText>
        ) : null}

        <BodyText weight="semiBold" size="sm" style={{ marginBottom: theme.spacing.xs }}>Title</BodyText>
        <TextInput style={inputStyle} value={title} onChangeText={setTitle} placeholderTextColor={theme.palette.textSecondary} />

        <BodyText weight="semiBold" size="sm" style={{ marginBottom: theme.spacing.xs }}>Price per day ($)</BodyText>
        <TextInput style={inputStyle} value={pricePerDay} onChangeText={setPricePerDay} keyboardType="decimal-pad" placeholderTextColor={theme.palette.textSecondary} />

        <BodyText weight="semiBold" size="sm" style={{ marginBottom: theme.spacing.xs }}>Available from (YYYY-MM-DD)</BodyText>
        <TextInput style={inputStyle} value={availStart} onChangeText={setAvailStart} keyboardType="numbers-and-punctuation" placeholderTextColor={theme.palette.textSecondary} />

        <BodyText weight="semiBold" size="sm" style={{ marginBottom: theme.spacing.xs }}>Available until (YYYY-MM-DD)</BodyText>
        <TextInput style={inputStyle} value={availEnd} onChangeText={setAvailEnd} keyboardType="numbers-and-punctuation" placeholderTextColor={theme.palette.textSecondary} />

        {error ? (
          <BodyText size="sm" style={{ color: theme.palette.status.negative.fg, marginBottom: theme.spacing.md }}>{error}</BodyText>
        ) : null}

        <View style={{ gap: theme.spacing.md }}>
          <Button label={saving ? "Saving…" : "Save changes"} onPress={handleSave} disabled={saving} />
          <Button
            label={listing.active ? "Mark unavailable" : "Mark available"}
            onPress={handleToggleActive}
            variant="secondary"
            disabled={saving}
          />
        </View>
      </ScrollView>
    </Container>
  );
}
