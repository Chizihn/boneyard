/**
 * Screen 7 — Incoming requests (provider)
 * GET /requests/incoming
 * Accept → POST /requests/:id/accept
 * Decline → POST /requests/:id/cancel
 * Mark returned → POST /requests/:id/complete  (triggers payout in backend)
 */
import { BodyText, Button, EmptyState, Heading, Container, StatusBadge, useTheme } from "@boneyard/skeleton-ui";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, FlatList, View } from "react-native";
import { api, ApiError } from "~/lib/api";
import type { BookingRequest } from "~/lib/types";

export default function IncomingRequests() {
  const theme = useTheme();
  const [requests, setRequests] = useState<BookingRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionErrors, setActionErrors] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await api.get<BookingRequest[]>("/requests/incoming");
      setRequests(result);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Failed to load requests.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function action(id: string, endpoint: string) {
    setActionErrors((prev) => ({ ...prev, [id]: "" }));
    try {
      await api.post(`/requests/${id}/${endpoint}`);
      await load();
    } catch (e) {
      setActionErrors((prev) => ({
        ...prev,
        [id]: e instanceof ApiError ? e.message : "Action failed.",
      }));
    }
  }

  return (
    <Container padded={false}>
      <View style={{ padding: theme.spacing.lg, paddingBottom: theme.spacing.sm }}>
        <Heading size="display">Incoming requests</Heading>
      </View>

      {loading ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator color={theme.palette.primary} />
        </View>
      ) : error ? (
        <View style={{ padding: theme.spacing.lg }}>
          <BodyText style={{ color: theme.palette.status.negative.fg }}>{error}</BodyText>
          <View style={{ marginTop: theme.spacing.md }}>
            <Button label="Retry" onPress={load} />
          </View>
        </View>
      ) : requests.length === 0 ? (
        <EmptyState
          icon="mail-open-outline"
          title="No requests yet"
          subtitle="When someone books one of your items, it'll show up here."
        />
      ) : (
        <FlatList
          data={requests}
          keyExtractor={(r) => r.id}
          onRefresh={load}
          refreshing={loading}
          contentContainerStyle={{ padding: theme.spacing.lg, gap: theme.spacing.lg }}
          renderItem={({ item }) => (
            <View
              style={{
                backgroundColor: theme.palette.surface,
                borderRadius: theme.radius.md,
                padding: theme.spacing.md,
                borderWidth: 1,
                borderColor: theme.palette.border,
                gap: theme.spacing.sm,
              }}
            >
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <BodyText weight="semiBold" numberOfLines={1} style={{ flex: 1 }}>
                  {item.listing?.title ?? `Request ${item.id.slice(0, 8)}`}
                </BodyText>
                <StatusBadge status={item.status} />
              </View>

              <BodyText size="sm" color="secondary">
                {new Date(item.windowStart).toLocaleDateString()} – {new Date(item.windowEnd).toLocaleDateString()}
              </BodyText>
              <BodyText size="sm" color="secondary">${item.amount}</BodyText>

              {/* Action buttons per status */}
              {item.status === "MATCHED" ? (
                <View style={{ flexDirection: "row", gap: theme.spacing.sm, marginTop: theme.spacing.sm }}>
                  <View style={{ flex: 1 }}>
                    <Button label="Accept" onPress={() => action(item.id, "accept")} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Button label="Decline" onPress={() => action(item.id, "cancel")} variant="secondary" />
                  </View>
                </View>
              ) : item.status === "IN_PROGRESS" ? (
                <View style={{ marginTop: theme.spacing.sm }}>
                  <Button label="Mark returned" onPress={() => action(item.id, "complete")} />
                </View>
              ) : null}

              {actionErrors[item.id] ? (
                <BodyText size="xs" style={{ color: theme.palette.status.negative.fg }}>
                  {actionErrors[item.id]}
                </BodyText>
              ) : null}
            </View>
          )}
        />
      )}
    </Container>
  );
}
