import { createContext, useCallback, useContext, useRef, useState } from "react";
import { Animated, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../theme";
import { BodyText } from "./Typography";

export type ToastVariant = "success" | "error" | "info";

interface ToastState {
  id: number;
  message: string;
  variant: ToastVariant;
}

interface ToastContextValue {
  show: (message: string, variant?: ToastVariant) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const ICONS: Record<ToastVariant, keyof typeof Ionicons.glyphMap> = {
  success: "checkmark-circle",
  error: "alert-circle",
  info: "information-circle",
};

const DURATION_MS = 2800;

/**
 * Wrap the app root in this once (inside ThemeProvider, since the toast
 * reads theme colors). Call useToast().show(...) from anywhere below it —
 * screens should use this instead of inline error/success text.
 */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [toast, setToast] = useState<ToastState | null>(null);
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(-12)).current;
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const idRef = useRef(0);

  const dismiss = useCallback(() => {
    Animated.parallel([
      Animated.timing(opacity, { toValue: 0, duration: 180, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: -12, duration: 180, useNativeDriver: true }),
    ]).start(() => setToast(null));
  }, [opacity, translateY]);

  const show = useCallback(
    (message: string, variant: ToastVariant = "info") => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      idRef.current += 1;
      setToast({ id: idRef.current, message, variant });
      opacity.setValue(0);
      translateY.setValue(-12);
      Animated.parallel([
        Animated.timing(opacity, { toValue: 1, duration: 220, useNativeDriver: true }),
        Animated.timing(translateY, { toValue: 0, duration: 220, useNativeDriver: true }),
      ]).start();
      timeoutRef.current = setTimeout(dismiss, DURATION_MS);
    },
    [dismiss, opacity, translateY]
  );

  const variantColor = toast ? theme.palette.status[toast.variant === "info" ? "highlight" : toast.variant === "success" ? "positive" : "negative"] : null;

  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      {toast && variantColor ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.container,
            {
              top: insets.top + 8,
              opacity,
              transform: [{ translateY }],
            },
          ]}
        >
          <Animated.View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: theme.spacing.sm,
              backgroundColor: theme.palette.surface,
              borderWidth: 1,
              borderColor: theme.palette.border,
              borderRadius: theme.radius.lg,
              paddingVertical: theme.spacing.sm,
              paddingHorizontal: theme.spacing.md,
              maxWidth: "92%",
              shadowColor: "#000",
              shadowOpacity: 0.12,
              shadowRadius: 10,
              shadowOffset: { width: 0, height: 4 },
              elevation: 4,
            }}
          >
            <Ionicons name={ICONS[toast.variant]} size={18} color={variantColor.fg} />
            <BodyText size="sm" weight="medium" style={{ flexShrink: 1 }}>
              {toast.message}
            </BodyText>
          </Animated.View>
        </Animated.View>
      ) : null}
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast() called outside <ToastProvider>");
  return ctx;
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    left: 0,
    right: 0,
    alignItems: "center",
    zIndex: 1000,
  },
});
