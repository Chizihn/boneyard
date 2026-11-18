import { BackButton, BodyText, Button, Container, Heading, Input, useTheme, useToast } from "@boneyard/skeleton-ui";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Modal, Pressable, Switch, View } from "react-native";
import { api, ApiError } from "~/lib/api";
import { useAuth } from "~/lib/auth-context";

interface NotificationPreferences {
  pushEnabled: boolean;
  orderUpdates?: boolean;
  marketing?: boolean;
}

function SettingsRow({
  icon,
  label,
  onPress,
  destructive,
  right,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress?: () => void;
  destructive?: boolean;
  right?: React.ReactNode;
}) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? "button" : undefined}
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "center",
        gap: theme.spacing.md,
        paddingVertical: theme.spacing.md,
        paddingHorizontal: theme.spacing.md,
        backgroundColor: theme.palette.surface,
        opacity: pressed && onPress ? 0.7 : 1,
      })}
    >
      <View
        style={{
          width: 32,
          height: 32,
          borderRadius: theme.radius.sm,
          backgroundColor: destructive ? theme.palette.status.negative.bg : theme.palette.bg,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Ionicons
          name={icon}
          size={16}
          color={destructive ? theme.palette.status.negative.fg : theme.palette.text}
        />
      </View>
      <BodyText
        weight="medium"
        style={{ flex: 1, color: destructive ? theme.palette.status.negative.fg : theme.palette.text }}
      >
        {label}
      </BodyText>
      {right ?? (onPress ? <Ionicons name="chevron-forward" size={18} color={theme.palette.textSecondary} /> : null)}
    </Pressable>
  );
}

export function SettingsScreen() {
  const theme = useTheme();
  const router = useRouter();
  const toast = useToast();
  const { logout } = useAuth();

  const [prefs, setPrefs] = useState<NotificationPreferences | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    api.get<NotificationPreferences>("/notifications/preferences").then(setPrefs).catch(() => {
      setPrefs({ pushEnabled: true });
    });
  }, []);

  async function togglePush(value: boolean) {
    setPrefs((p) => (p ? { ...p, pushEnabled: value } : p));
    try {
      await api.patch("/notifications/preferences", { pushEnabled: value });
    } catch {
      setPrefs((p) => (p ? { ...p, pushEnabled: !value } : p));
      toast.show("Couldn't update that — try again.", "error");
    }
  }

  async function confirmDelete() {
    if (!password) {
      toast.show("Enter your password to confirm.", "error");
      return;
    }
    setDeleting(true);
    try {
      await api.delete("/auth/me", { password });
      await logout();
      setDeleteOpen(false);
      router.replace("/(auth)");
    } catch (e) {
      toast.show(e instanceof ApiError ? e.message : "Couldn't delete your account.", "error");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <Container scrollable>
      <View style={{ flexDirection: "row", alignItems: "center", gap: theme.spacing.md, marginBottom: theme.spacing.lg }}>
        <BackButton onPress={() => router.back()} />
        <Heading size="display">Settings</Heading>
      </View>

      <BodyText weight="semiBold" size="xs" color="secondary" style={{ textTransform: "uppercase", letterSpacing: 0.5, marginBottom: theme.spacing.sm }}>
        Notifications
      </BodyText>
      <View style={{ borderRadius: theme.radius.lg, overflow: "hidden", marginBottom: theme.spacing.xl }}>
        <SettingsRow
          icon="notifications-outline"
          label="Push notifications"
          right={
            <Switch
              value={prefs?.pushEnabled ?? true}
              onValueChange={togglePush}
              trackColor={{ true: theme.palette.primary, false: theme.palette.border }}
            />
          }
        />
      </View>

      <BodyText weight="semiBold" size="xs" color="secondary" style={{ textTransform: "uppercase", letterSpacing: 0.5, marginBottom: theme.spacing.sm }}>
        Support
      </BodyText>
      <View style={{ borderRadius: theme.radius.lg, overflow: "hidden", marginBottom: theme.spacing.xl }}>
        <SettingsRow icon="help-circle-outline" label="Help & FAQ" onPress={() => toast.show("Coming soon.", "info")} />
        <SettingsRow icon="document-text-outline" label="Privacy policy" onPress={() => toast.show("Coming soon.", "info")} />
        <SettingsRow icon="shield-checkmark-outline" label="Terms of service" onPress={() => toast.show("Coming soon.", "info")} />
      </View>

      <BodyText weight="semiBold" size="xs" color="secondary" style={{ textTransform: "uppercase", letterSpacing: 0.5, marginBottom: theme.spacing.sm }}>
        Account
      </BodyText>
      <View style={{ borderRadius: theme.radius.lg, overflow: "hidden", marginBottom: theme.spacing.xl }}>
        <SettingsRow
          icon="log-out-outline"
          label="Log out"
          onPress={async () => {
            await logout();
            router.replace("/(auth)");
          }}
        />
        <SettingsRow icon="trash-outline" label="Delete account" destructive onPress={() => setDeleteOpen(true)} />
      </View>

      <BodyText size="xs" color="secondary" style={{ textAlign: "center" }}>
        Hallowear v1.0.0
      </BodyText>

      <Modal visible={deleteOpen} transparent animationType="fade" onRequestClose={() => setDeleteOpen(false)}>
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "center", padding: theme.spacing.xl }}>
          <View style={{ backgroundColor: theme.palette.surface, borderRadius: theme.radius.lg, padding: theme.spacing.lg, gap: theme.spacing.md }}>
            <Heading size="md">Delete your account?</Heading>
            <BodyText color="secondary" size="sm">
              This can&apos;t be undone. Your listings and booking history stay on record for other
              users, but your profile is permanently removed and you won&apos;t be able to log back in.
            </BodyText>
            <Input
              label="Confirm your password"
              icon="lock-closed-outline"
              secureTextEntry
              value={password}
              onChangeText={setPassword}
            />
            <View style={{ flexDirection: "row", gap: theme.spacing.sm, marginTop: theme.spacing.xs }}>
              <View style={{ flex: 1 }}>
                <Button label="Cancel" variant="secondary" onPress={() => { setDeleteOpen(false); setPassword(""); }} />
              </View>
              <View style={{ flex: 1 }}>
                <Button
                  label={deleting ? "Deleting…" : "Delete"}
                  onPress={confirmDelete}
                  disabled={deleting}
                />
              </View>
            </View>
          </View>
        </View>
      </Modal>
    </Container>
  );
}
