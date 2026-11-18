/**
 * Screen 7a — Incoming requests (provider)
 * GET /requests/incoming
 * Accept → POST /requests/:id/accept
 * Decline → POST /requests/:id/cancel
 * (Mark started happens via check-in screen, not here)
 */
import {
  BodyText,
  Button,
  Container,
  EmptyState,
  Heading,
  StatusBadge,
  useTheme,
  useToast,
} from "@boneyard/skeleton-ui";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, FlatList, View } from "react-native";
import { api, ApiError } from "~/lib/api";
import type { BookingRequest } from "~/lib/types";

export default function IncomingRequests() {
  const theme = useTheme();
  const router = useRouter();
  const toast = useToast();
  const [requests, setRequests] = useState<BookingRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<string | null>(null); // request id being acted on

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRequests(await api.get<BookingRequest[]>("/requests/incoming"));
    } catch (e) {
      toast.show(e instanceof ApiError ? e.message : "Failed to load requests.", "error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function action(id: string, endpoint: string) {
    setActing(id);
    try {
      await api.post(`/requests/${id}/${endpoint}`);
      toast.show(endpoint === "accept" ? "Request accepted." : "Request declined.", "success");
      await load();
    } catch (e) {
      toast.show(e instanceof ApiError ? e.message : "Action failed.", "error");
    } finally {
      setActing(null);
    }
  }

  return (
    <Container padded={false}>
      <View style={{
        padding: theme.spacing.lg,
        paddingBottom: theme.spacing.sm,
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
      }}>
        <Heading size="display">Requests</Heading>
        <Button label="Check-in" onPress={() => router.push("/(provider)/checkin")} variant="secondary" />
      </View>

      {loading ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator color={theme.palette.primary} />
        </View>
      ) : requests.length === 0 ? (
        <EmptyState
          icon="notifications-outline"
          title="No incoming requests"
          subtitle="Requests from visitors will appear here."
        />
      ) : (
        <FlatList
          data={requests}
          keyExtractor={(r) => r.id}
          onRefresh={load}
          refreshing={loading}
          contentContainerStyle={{ padding: theme.spacing.lg, gap: theme.spacing.lg }}
          renderItem={({ item }) => (
            <View style={{
              backgroundColor: theme.palette.surface,
              borderRadius: theme.radius.md,
              padding: theme.spacing.md,
              borderWidth: 1,
              borderColor: theme.palette.border,
              gap: theme.spacing.sm,
            }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <BodyText weight="semiBold" numberOfLines={1} style={{ flex: 1 }}>
                  {item.listing?.title ?? `Request ${item.id.slice(0, 8)}`}
                </BodyText>
                <StatusBadge status={item.status} />
              </View>

              <BodyText size="sm" color="secondary">
                {new Date(item.windowStart).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                {" · "}
                {new Date(item.windowStart).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
              </BodyText>
              <BodyText size="sm" color="secondary">${item.amount}</BodyText>

              {item.status === "MATCHED" ? (
                <View style={{ flexDirection: "row", gap: theme.spacing.sm, marginTop: theme.spacing.sm }}>
                  <View style={{ flex: 1 }}>
                    <Button
                      label={acting === item.id ? "…" : "Accept"}
                      onPress={() => action(item.id, "accept")}
                      disabled={acting === item.id}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Button
                      label={acting === item.id ? "…" : "Decline"}
                      variant="secondary"
                      onPress={() => action(item.id, "cancel")}
                      disabled={acting === item.id}
                    />
                  </View>
                </View>
              ) : null}
            </View>
          )}
        />
      )}
    </Container>
  );
}
