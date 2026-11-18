/**
 * Screen 5 — List an item
 * POST /listings with vertical:"hallowear" and hallowear metadata
 */
import { BackButton, BodyText, Button, Heading, Container, useTheme } from "@boneyard/skeleton-ui";
import { useRouter } from "expo-router";
import { useState } from "react";
import { ScrollView, TextInput, View } from "react-native";
import { api, ApiError } from "~/lib/api";
import { useSingleBack } from "~/hooks";

export default function ListItem() {
  const theme = useTheme();
  const router = useRouter();

  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("");
  const [pricePerDay, setPricePerDay] = useState("");
  const [availStart, setAvailStart] = useState("");
  const [availEnd, setAvailEnd] = useState("");
  // Location — lat/lng strings for simplicity; a real app would use a map picker
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleBack = useSingleBack({
    fallback: "/(provider)/(tabs)",
    handleHardwareBack: !success,
    onBeforeBack: () => !submitting,
  });

  async function handleSubmit() {
    if (!title || !category || !pricePerDay || !availStart || !availEnd || !lat || !lng) {
      setError("All fields are required.");
      return;
    }
    const price = parseFloat(pricePerDay);
    if (isNaN(price) || price <= 0) {
      setError("Price must be a positive number.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await api.post("/listings", {
        title: title.trim(),
        vertical: "hallowear",
        metadata: {
          category: category.trim(),
          pricePerDay: price,
          availabilityStart: new Date(availStart).toISOString(),
          availabilityEnd: new Date(availEnd).toISOString(),
        },
        location: { lat: parseFloat(lat), lng: parseFloat(lng) },
        active: true,
      });
      setSuccess(true);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to create listing.");
    } finally {
      setSubmitting(false);
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

  if (success) {
    return (
      <Container>
        <Heading size="display">Item listed!</Heading>
        <BodyText color="secondary" style={{ marginTop: theme.spacing.md }}>
          Your item is now live and available for requesters to browse.
        </BodyText>
        <View style={{ marginTop: theme.spacing.xl, gap: theme.spacing.md }}>
          <Button label="View my listings" onPress={() => router.replace("/(provider)/(tabs)")} />
          <Button label="List another item" onPress={() => { setSuccess(false); setTitle(""); setCategory(""); setPricePerDay(""); setAvailStart(""); setAvailEnd(""); setLat(""); setLng(""); }} variant="secondary" />
        </View>
      </Container>
    );
  }

  return (
    <Container padded={false}>
      <ScrollView contentContainerStyle={{ padding: theme.spacing.lg }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: theme.spacing.md, marginVertical: theme.spacing.lg }}>
          <BackButton onPress={handleBack} />
          <Heading size="display">List an item</Heading>
        </View>

        <Label text="Title" theme={theme} />
        <TextInput style={inputStyle} placeholder="e.g. Vampire count costume" placeholderTextColor={theme.palette.textSecondary} value={title} onChangeText={setTitle} />

        <Label text="Category" theme={theme} />
        <TextInput style={inputStyle} placeholder="e.g. costume, prop, decoration" placeholderTextColor={theme.palette.textSecondary} value={category} onChangeText={setCategory} />

        <Label text="Price per day ($)" theme={theme} />
        <TextInput style={inputStyle} placeholder="25" placeholderTextColor={theme.palette.textSecondary} value={pricePerDay} onChangeText={setPricePerDay} keyboardType="decimal-pad" />

        <Label text="Available from (YYYY-MM-DD)" theme={theme} />
        <TextInput style={inputStyle} placeholder="2026-10-01" placeholderTextColor={theme.palette.textSecondary} value={availStart} onChangeText={setAvailStart} keyboardType="numbers-and-punctuation" />

        <Label text="Available until (YYYY-MM-DD)" theme={theme} />
        <TextInput style={inputStyle} placeholder="2026-10-31" placeholderTextColor={theme.palette.textSecondary} value={availEnd} onChangeText={setAvailEnd} keyboardType="numbers-and-punctuation" />

        <Label text="Location latitude" theme={theme} />
        <TextInput style={inputStyle} placeholder="40.7128" placeholderTextColor={theme.palette.textSecondary} value={lat} onChangeText={setLat} keyboardType="decimal-pad" />

        <Label text="Location longitude" theme={theme} />
        <TextInput style={inputStyle} placeholder="-74.0060" placeholderTextColor={theme.palette.textSecondary} value={lng} onChangeText={setLng} keyboardType="decimal-pad" />

        {error ? (
          <BodyText size="sm" style={{ color: theme.palette.status.negative.fg, marginBottom: theme.spacing.md }}>
            {error}
          </BodyText>
        ) : null}

        <Button label={submitting ? "Listing…" : "List item"} onPress={handleSubmit} disabled={submitting} />
      </ScrollView>
    </Container>
  );
}

function Label({ text, theme }: { text: string; theme: ReturnType<typeof useTheme> }) {
  return (
    <BodyText weight="semiBold" size="sm" style={{ marginBottom: theme.spacing.xs }}>
      {text}
    </BodyText>
  );
}
