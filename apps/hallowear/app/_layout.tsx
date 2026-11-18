import { hallowearTheme, ThemeProvider, ToastProvider, useBoneyardFonts } from "@boneyard/skeleton-ui";
import { Redirect, Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AuthProvider, useAuth } from "~/lib/auth-context";

function RootNavigator() {
  const { user, loading } = useAuth();

  if (loading) {
    return <View style={{ flex: 1, backgroundColor: hallowearTheme.palette.bg }} />;
  }

  // contentStyle sets the native screen container's own background (not
  // just the JS SafeAreaView's) — without it, react-native-screens' native
  // container defaults to its own background and can show through as a
  // mismatched flash/bar before the JS content paints, including right
  // where the status bar sits.
  const contentStyle = { backgroundColor: hallowearTheme.palette.bg };

  if (!user) {
    return (
      <Stack screenOptions={{ headerShown: false, contentStyle }}>
        <Stack.Screen name="(auth)" />
      </Stack>
    );
  }

  return (
    <Stack screenOptions={{ headerShown: false, contentStyle }}>
      {user.role === "provider" ? (
        <Stack.Screen name="(provider)" />
      ) : (
        <Stack.Screen name="(requester)" />
      )}
    </Stack>
  );
}

/**
 * Root layout: wires fonts, theme, and auth. Every screen renders inside this.
 */
export default function RootLayout() {
  const fontsLoaded = useBoneyardFonts();

  if (!fontsLoaded) {
    return (
      <View style={{ flex: 1, backgroundColor: hallowearTheme.palette.bg }}>
        <StatusBar style="dark" />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <ThemeProvider theme={hallowearTheme}>
        <ToastProvider>
          <AuthProvider>
            <RootNavigator />
          </AuthProvider>
        </ToastProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
