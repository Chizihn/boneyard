import { BodyText, Container, Heading, useTheme } from "@boneyard/skeleton-ui";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { Pressable, View } from "react-native";
import { useAuth } from "~/lib/auth-context";

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return parts
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

export function ProfileScreen({ settingsHref }: { settingsHref: string }) {
  const theme = useTheme();
  const router = useRouter();
  const { user } = useAuth();

  if (!user) return null;

  return (
    <Container>
      <Heading size="displayLg" style={{ marginBottom: theme.spacing.xl }}>
        Profile
      </Heading>

      <View style={{ alignItems: "center", gap: theme.spacing.md, marginBottom: theme.spacing.xl }}>
        <View
          style={{
            width: 88,
            height: 88,
            borderRadius: 999,
            backgroundColor: theme.palette.primary,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <BodyText weight="bold" style={{ color: theme.palette.onPrimary, fontSize: 30 }}>
            {initials(user.name)}
          </BodyText>
        </View>
        <View style={{ alignItems: "center" }}>
          <Heading size="md">{user.name}</Heading>
          <BodyText color="secondary" size="sm">{user.email}</BodyText>
        </View>
      </View>

      <Pressable
        onPress={() => router.push(settingsHref as never)}
        accessibilityRole="button"
        style={({ pressed }) => ({
          flexDirection: "row",
          alignItems: "center",
          gap: theme.spacing.md,
          padding: theme.spacing.md,
          borderRadius: theme.radius.lg,
          backgroundColor: theme.palette.surface,
          borderWidth: 1,
          borderColor: theme.palette.border,
          opacity: pressed ? 0.8 : 1,
        })}
      >
        <View
          style={{
            width: 32,
            height: 32,
            borderRadius: theme.radius.sm,
            backgroundColor: theme.palette.bg,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Ionicons name="settings-outline" size={16} color={theme.palette.text} />
        </View>
        <BodyText weight="medium" style={{ flex: 1 }}>Settings</BodyText>
        <Ionicons name="chevron-forward" size={18} color={theme.palette.textSecondary} />
      </Pressable>
    </Container>
  );
}
