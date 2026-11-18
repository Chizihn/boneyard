import { Pressable, type GestureResponderEvent } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated";
import { useTheme } from "../theme";
import { BodyText } from "./Typography";
import { useSinglePress } from "../hooks/useSinglePress";

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export interface ButtonProps {
  label: string;
  onPress: (event: GestureResponderEvent) => void;
  variant?: "primary" | "secondary";
  disabled?: boolean;
  /** Custom debounce delay in ms to prevent double-clicking. Defaults to 800ms. Set to 0 to disable debounce. */
  debounceDelay?: number;
}

export function Button({
  label,
  onPress,
  variant = "primary",
  disabled,
  debounceDelay = 800,
}: ButtonProps) {
  const theme = useTheme();
  const isPrimary = variant === "primary";

  const singlePressHandler = useSinglePress((event: GestureResponderEvent) => {
    if (disabled) return;
    onPress(event);
  }, debounceDelay);

  const effectiveOnPress = disabled
    ? undefined
    : debounceDelay === 0
    ? onPress
    : singlePressHandler;

  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: Boolean(disabled) }}
      onPress={effectiveOnPress}
      onPressIn={() => {
        scale.value = withSpring(0.96, { damping: 16, stiffness: 300 });
      }}
      onPressOut={() => {
        scale.value = withSpring(1, { damping: 16, stiffness: 300 });
      }}
      style={[
        {
          borderRadius: theme.radius.pill,
          paddingVertical: 12,
          paddingHorizontal: theme.spacing.xl,
          alignItems: "center",
          justifyContent: "center",
          opacity: disabled ? 0.5 : 1,
          backgroundColor: isPrimary ? theme.palette.primary : "transparent",
          borderWidth: isPrimary ? 0 : 1.5,
          borderColor: theme.palette.primary,
        },
        animatedStyle,
      ]}
    >
      <BodyText
        weight="semiBold"
        size="md"
        style={{ color: isPrimary ? theme.palette.onPrimary : theme.palette.primary }}
      >
        {label}
      </BodyText>
    </AnimatedPressable>
  );
}
