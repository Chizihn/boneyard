/**
 * Screen 6b — Edit slot
 * GET /listings/:id  →  PATCH /listings/:id
 * "Close out" = PATCH active:false
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
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { api, ApiError } from "~/lib/api";
import type { Listing } from "~/lib/types";

export default function EditSlot() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const theme = useTheme();
  const toast = useToast();

  const [listing, setListing] = useState<Listing | null>(null);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState("");
  const [capacity, setCapacity] = useState("");
  const [pricePerTicket, setPricePerTicket] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!id) return;
    api.get<Listing>(`/listings/${id}`)
      .then((l) => {
        setListing(l);
        setTitle(l.title);
        setCapacity(String(l.metadata.capacity));
        setPricePerTicket(String(l.metadata.pricePerTicket));
        setLoading(false);
      })
      .catch(() => { toast.show("Failed to load slot.", "error"); setLoading(false); });
  }, [id]);

  async function handleSave() {
    if (!listing) return;
    const cap = parseInt(capacity, 10);
    const price = parseFloat(pricePerTicket);
    if (isNaN(cap) || cap <= 0) { toast.show("Capacity must be a positive integer.", "error"); return; }
    if (isNaN(price) || price <= 0) { toast.show("Price must be a positive number.", "error"); return; }

    setSaving(true);
    try {
      await api.patch(`/listings/${listing.id}`, {
        title: title.trim(),
        metadata: { ...listing.metadata, capacity: cap, pricePerTicket: price },
      });
      toast.show("Saved.", "success");
      setListing({ ...listing, title: title.trim(), metadata: { ...listing.metadata, capacity: cap, pricePerTicket: price } });
    } catch (e) {
      toast.show(e instanceof ApiError ? e.message : "Failed to save.", "error");
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
      toast.show(listing.active ? "Slot closed out." : "Slot reopened.", "success");
    } catch (e) {
      toast.show(e instanceof ApiError ? e.message : "Failed to update.", "error");
    } finally {
      setSaving(false);
    }
  }

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
        <BodyText color="secondary" style={{ marginTop: theme.spacing.md }}>Slot not found.</BodyText>
      </Container>
    );
  }

  const slotStart = new Date(listing.metadata.slotStart);
  const slotEnd = new Date(listing.metadata.slotEnd);

  return (
    <Container scrollable padded>
      <BackButton onPress={() => router.back()} />
      <Heading size="display" style={{ marginVertical: theme.spacing.lg }}>Edit slot</Heading>

      {/* Slot time is not editable once published — show it read-only */}
      <View style={{ backgroundColor: theme.palette.surface, borderRadius: theme.radius.md, padding: theme.spacing.md, borderWidth: 1, borderColor: theme.palette.border, marginBottom: theme.spacing.lg }}>
        <BodyText weight="semiBold" size="sm">Time (not editable after publish)</BodyText>
        <BodyText color="secondary">
          {slotStart.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
          {" · "}
          {slotStart.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })} – {slotEnd.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
        </BodyText>
      </View>

      <View style={{ gap: theme.spacing.md }}>
        <Input label="Title" icon="skull-outline" value={title} onChangeText={setTitle} />
        <Input label="Capacity" icon="people-outline" value={capacity} onChangeText={setCapacity} keyboardType="number-pad" />
        <Input label="Price per ticket ($)" icon="pricetag-outline" value={pricePerTicket} onChangeText={setPricePerTicket} keyboardType="decimal-pad" />
      </View>

      <View style={{ gap: theme.spacing.md, marginTop: theme.spacing.xl }}>
        <Button label={saving ? "Saving…" : "Save changes"} onPress={handleSave} disabled={saving} />
        <Button
          label={listing.active ? "Close out this slot" : "Reopen slot"}
          variant="secondary"
          onPress={handleToggleActive}
          disabled={saving}
        />
      </View>
    </Container>
  );
}
