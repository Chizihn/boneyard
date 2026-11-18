import { Ionicons } from "@expo/vector-icons";
import { Pressable } from "react-native";
import { useTheme } from "../theme";

export interface BackButtonProps {
  onPress: () => void;
  /** Visible on screen immediately below it, for screen readers. */
  label?: string;
}

/**
 * A small icon-only back affordance for screens pushed on top of a tab
 * (detail/edit/booking flows) — not for tab-root screens, which navigate
 * via the tab bar and shouldn't have a "back" button at all.
 */
export function BackButton({ onPress, label = "Back" }: BackButtonProps) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={8}
      style={({ pressed }) => ({
        width: 40,
        height: 40,
        borderRadius: theme.radius.pill,
        backgroundColor: theme.palette.surface,
        borderWidth: 1,
        borderColor: theme.palette.border,
        alignItems: "center",
        justifyContent: "center",
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <Ionicons name="chevron-back" size={20} color={theme.palette.text} />
    </Pressable>
  );
}
