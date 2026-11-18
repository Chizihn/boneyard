import { StatusBar, type StatusBarStyle } from "expo-status-bar";
import { ScrollView, View, type ViewStyle } from "react-native";
import { SafeAreaView, type Edge } from "react-native-safe-area-context";
import { useTheme } from "../theme";

export interface ContainerProps {
  children: React.ReactNode;
  /** Rendered above children, outside the scroll view — e.g. a header. */
  top?: React.ReactNode;
  /** Rendered below children, outside the scroll view — e.g. a sticky CTA. */
  bottom?: React.ReactNode;
  style?: ViewStyle;
  /**
   * Which edges SafeAreaView insets for. Deliberately excludes "top" by
   * default: including it pads content below the status bar, which stops
   * the screen's own background from extending into that area — on
   * Android edge-to-edge, that's what leaves the status bar looking like
   * an un-themed black bar instead of blending into the screen.
   */
  edges?: Edge[];
  backgroundColor?: string;
  statusBarStyle?: StatusBarStyle;
  scrollable?: boolean;
  padded?: boolean;
}

/**
 * The one screen-level wrapper both apps use — replaces the earlier
 * `Screen` component, which padded all 4 edges by default and genuinely
 * did leave the status bar area unthemed. This mirrors the
 * edges-excluding-top pattern from the author's other apps' own
 * ScreenContainer, which is the tested-working version of this.
 */
export function Container({
  children,
  top,
  bottom,
  style,
  edges = ["bottom"],
  backgroundColor,
  statusBarStyle = "dark",
  scrollable = false,
  padded = true,
}: ContainerProps) {
  const theme = useTheme();
  const bg = backgroundColor ?? theme.palette.bg;

  // `style` lands on the content view (not the SafeAreaView) so callers
  // can do things like center a loading/error state with alignItems/
  // justifyContent, same contract the old Screen component had.
  const content = scrollable ? (
    <ScrollView
      style={{ flex: 1 }}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
      contentContainerStyle={[padded ? { padding: theme.spacing.lg } : null, style]}
    >
      {children}
    </ScrollView>
  ) : (
    <View style={[{ flex: 1 }, padded ? { padding: theme.spacing.lg } : null, style]}>
      {children}
    </View>
  );

  return (
    <>
      <StatusBar style={theme.isDark ? "light" : statusBarStyle} />
      <SafeAreaView style={{ flex: 1, backgroundColor: bg }} edges={edges}>
        {top}
        {content}
        {bottom}
      </SafeAreaView>
    </>
  );
}
