/**
 * Screen 7b — Check-in
 * Scans a requester's QR ticket (which encodes a request id), then calls
 * POST /requests/:id/start (ACCEPTED → IN_PROGRESS).
 *
 * Uses expo-camera's built-in barcode scanning. No custom decoder.
 * Camera permission is declared in app.json under expo-camera plugin.
 *
 * Flow:
 *   1. Camera opens, scans QR → extracts request id from data value.
 *   2. Pauses scanning while calling the API.
 *   3. Shows success ("Visitor checked in") or the specific API error.
 *   4. "Scan another" resets state so the camera is ready again.
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
import { CameraView, useCameraPermissions } from "expo-camera";
import { useRouter } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import { api, ApiError } from "~/lib/api";

type ScanState =
  | { phase: "scanning" }
  | { phase: "confirming"; requestId: string }
  | { phase: "success"; requestId: string }
  | { phase: "error"; message: string };

export default function CheckIn() {
  const theme = useTheme();
  const router = useRouter();
  const toast = useToast();
  const [permission, requestPermission] = useCameraPermissions();
  const [state, setState] = useState<ScanState>({ phase: "scanning" });

  async function handleBarcodeScan({ data }: { data: string }) {
    // Only process when actively scanning — prevents duplicate fires
    if (state.phase !== "scanning") return;

    // The QR value is the raw request id — a UUID
    const requestId = data.trim();
    setState({ phase: "confirming", requestId });

    try {
      await api.post(`/requests/${requestId}/start`);
      setState({ phase: "success", requestId });
      toast.show("Visitor checked in.", "success");
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : "Check-in failed.";
      setState({ phase: "error", message: msg });
    }
  }

  function reset() {
    setState({ phase: "scanning" });
  }

  // Permission not yet determined
  if (!permission) {
    return (
      <Container style={{ alignItems: "center", justifyContent: "center" }}>
        <BodyText color="secondary">Requesting camera permission…</BodyText>
      </Container>
    );
  }

  // Permission denied
  if (!permission.granted) {
    return (
      <Container style={{ gap: theme.spacing.lg }}>
        <BackButton onPress={() => router.back()} />
        <Heading size="display">Camera needed</Heading>
        <BodyText color="secondary">
          Haint needs camera access to scan visitor QR codes at check-in.
        </BodyText>
        <Button label="Grant camera access" onPress={requestPermission} />
        <Button label="Go back" variant="secondary" onPress={() => router.back()} />
      </Container>
    );
  }

  // Success state
  if (state.phase === "success") {
    return (
      <Container style={{ alignItems: "center", justifyContent: "center", gap: theme.spacing.lg }}>
        <Heading size="display" style={{ textAlign: "center" }}>Checked in!</Heading>
        <BodyText color="secondary" style={{ textAlign: "center" }}>
          Visitor is now marked IN_PROGRESS.{"\n"}Booking: {state.requestId.slice(0, 8)}…
        </BodyText>
        <View style={{ gap: theme.spacing.md, width: "100%" }}>
          <Button label="Scan another ticket" onPress={reset} />
          <Button label="Back to slots" variant="secondary" onPress={() => router.push("/(provider)/")} />
        </View>
      </Container>
    );
  }

  // Error state
  if (state.phase === "error") {
    return (
      <Container style={{ alignItems: "center", justifyContent: "center", gap: theme.spacing.lg }}>
        <Heading size="display" style={{ textAlign: "center" }}>Check-in failed</Heading>
        <BodyText style={{ color: theme.palette.status.negative.fg, textAlign: "center" }}>
          {state.message}
        </BodyText>
        <View style={{ gap: theme.spacing.md, width: "100%" }}>
          <Button label="Try again" onPress={reset} />
          <Button label="Back to slots" variant="secondary" onPress={() => router.push("/(provider)/")} />
        </View>
      </Container>
    );
  }

  // Scanning / confirming states — show the camera
  return (
    <Container padded={false}>
      {/* Header row */}
      <View style={{ padding: theme.spacing.lg, paddingBottom: theme.spacing.sm, flexDirection: "row", alignItems: "center", gap: theme.spacing.md }}>
        <BackButton onPress={() => router.back()} />
        <Heading size="lg">Scan ticket</Heading>
      </View>

      {/* Camera viewfinder */}
      <View style={{ flex: 1, margin: theme.spacing.lg, borderRadius: theme.radius.lg, overflow: "hidden", borderWidth: 1, borderColor: theme.palette.border }}>
        <CameraView
          style={{ flex: 1 }}
          facing="back"
          barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
          onBarcodeScanned={state.phase === "scanning" ? handleBarcodeScan : undefined}
        />

        {/* Overlay while confirming */}
        {state.phase === "confirming" ? (
          <View style={{
            ...StyleSheet_absoluteFill,
            backgroundColor: theme.palette.bg + "CC",
            alignItems: "center",
            justifyContent: "center",
            gap: theme.spacing.md,
          }}>
            <BodyText weight="semiBold">Checking in…</BodyText>
            <BodyText size="sm" color="secondary">{state.requestId.slice(0, 8)}…</BodyText>
          </View>
        ) : null}
      </View>

      <BodyText
        color="secondary"
        size="sm"
        style={{ textAlign: "center", padding: theme.spacing.md }}
      >
        Point the camera at a visitor's QR ticket.
      </BodyText>
    </Container>
  );
}

// Inline absoluteFill to avoid importing StyleSheet just for this
const StyleSheet_absoluteFill = {
  position: "absolute" as const,
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
};
