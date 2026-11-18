import { Ionicons } from "@expo/vector-icons";
import { View } from "react-native";
import { useTheme } from "../theme";
import { Button } from "./Button";
import { BodyText, Heading } from "./Typography";

export interface EmptyStateProps {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle?: string;
  actionLabel?: string;
  onAction?: () => void;
}

/**
 * The one "nothing here yet" treatment both apps use — every list screen
 * (browse results, bookings, listings, requests) should reach for this
 * instead of a bare line of gray text.
 */
export function EmptyState({ icon, title, subtitle, actionLabel, onAction }: EmptyStateProps) {
  const theme = useTheme();
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: theme.spacing.xl, gap: theme.spacing.md }}>
      <View style={{ width: 72, height: 72 }}>
        <View
          style={{
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            position: "absolute",
            borderRadius: 999,
            backgroundColor: theme.palette.accent,
            opacity: 0.16,
          }}
        />
        <View
          style={{
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            position: "absolute",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Ionicons name={icon} size={30} color={theme.palette.accent} />
        </View>
      </View>
      <View style={{ alignItems: "center", gap: theme.spacing.xs }}>
        <Heading size="md">{title}</Heading>
        {subtitle ? (
          <BodyText color="secondary" style={{ textAlign: "center" }}>
            {subtitle}
          </BodyText>
        ) : null}
      </View>
      {actionLabel && onAction ? (
        <View style={{ marginTop: theme.spacing.sm, minWidth: 180 }}>
          <Button label={actionLabel} onPress={onAction} variant="secondary" />
        </View>
      ) : null}
    </View>
  );
}
