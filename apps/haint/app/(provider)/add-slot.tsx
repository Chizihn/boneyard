/**
 * Screen 6a — Add a slot
 * POST /listings with vertical:"haint" and haint metadata
 */
import {
  BackButton,
  BodyText,
  Button,
  Container,
  Heading,
  Input,
  useTheme,
  useToast,
} from "@boneyard/skeleton-ui";
import { useRouter } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { api, ApiError } from "~/lib/api";

export default function AddSlot() {
  const theme = useTheme();
  const router = useRouter();
  const toast = useToast();

  const [title, setTitle] = useState("");
  const [slotStart, setSlotStart] = useState("");   // "YYYY-MM-DDTHH:MM"
  const [slotEnd, setSlotEnd] = useState("");
  const [capacity, setCapacity] = useState("");
  const [rating, setRating] = useState("5.0");
  const [pricePerTicket, setPricePerTicket] = useState("");
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  async function handleSubmit() {
    if (!title || !slotStart || !slotEnd || !capacity || !pricePerTicket || !lat || !lng) {
      toast.show("All fields are required.", "error");
      return;
    }
    const cap = parseInt(capacity, 10);
    const price = parseFloat(pricePerTicket);
    const r = parseFloat(rating);
    if (isNaN(cap) || cap <= 0) { toast.show("Capacity must be a positive integer.", "error"); return; }
    if (isNaN(price) || price <= 0) { toast.show("Price must be a positive number.", "error"); return; }

    setSubmitting(true);
    try {
      await api.post("/listings", {
        title: title.trim(),
        vertical: "haint",
        metadata: {
          slotStart: new Date(slotStart).toISOString(),
          slotEnd: new Date(slotEnd).toISOString(),
          capacity: cap,
          bookedCount: 0,
          rating: isNaN(r) ? 5.0 : r,
          pricePerTicket: price,
        },
        location: { lat: parseFloat(lat), lng: parseFloat(lng) },
        active: true,
      });
      setSuccess(true);
      toast.show("Slot published!", "success");
    } catch (e) {
      toast.show(e instanceof ApiError ? e.message : "Failed to create slot.", "error");
    } finally {
      setSubmitting(false);
    }
  }

  if (success) {
    return (
      <Container style={{ alignItems: "center", justifyContent: "center", gap: theme.spacing.lg }}>
        <Heading size="display" style={{ textAlign: "center" }}>Slot published!</Heading>
        <BodyText color="secondary" style={{ textAlign: "center" }}>
          Requesters can now book this time slot.
        </BodyText>
        <View style={{ gap: theme.spacing.md, width: "100%" }}>
          <Button label="View my slots" onPress={() => router.replace("/(provider)/")} />
          <Button label="Add another slot" onPress={() => { setSuccess(false); setTitle(""); setSlotStart(""); setSlotEnd(""); setCapacity(""); setPricePerTicket(""); }} variant="secondary" />
        </View>
      </Container>
    );
  }

  return (
    <Container scrollable padded>
      <BackButton onPress={() => router.back()} />
      <Heading size="display" style={{ marginVertical: theme.spacing.lg }}>Add a slot</Heading>

      <View style={{ gap: theme.spacing.md }}>
        <Input label="Title" icon="skull-outline" placeholder="e.g. Midnight Terror Tour" value={title} onChangeText={setTitle} />
        <Input label="Slot start (YYYY-MM-DDTHH:MM)" icon="time-outline" placeholder="2026-10-31T20:00" value={slotStart} onChangeText={setSlotStart} keyboardType="numbers-and-punctuation" />
        <Input label="Slot end (YYYY-MM-DDTHH:MM)" icon="time-outline" placeholder="2026-10-31T22:00" value={slotEnd} onChangeText={setSlotEnd} keyboardType="numbers-and-punctuation" />
        <Input label="Capacity (total spots)" icon="people-outline" placeholder="30" value={capacity} onChangeText={setCapacity} keyboardType="number-pad" />
        <Input label="Price per ticket ($)" icon="pricetag-outline" placeholder="25" value={pricePerTicket} onChangeText={setPricePerTicket} keyboardType="decimal-pad" />
        <Input label="Rating (0–5)" icon="star-outline" placeholder="5.0" value={rating} onChangeText={setRating} keyboardType="decimal-pad" />
        <Input label="Latitude" icon="location-outline" placeholder="40.7128" value={lat} onChangeText={setLat} keyboardType="decimal-pad" />
        <Input label="Longitude" icon="location-outline" placeholder="-74.0060" value={lng} onChangeText={setLng} keyboardType="decimal-pad" />
      </View>

      <View style={{ marginTop: theme.spacing.xl }}>
        <Button label={submitting ? "Publishing…" : "Publish slot"} onPress={handleSubmit} disabled={submitting} />
      </View>
    </Container>
  );
}
