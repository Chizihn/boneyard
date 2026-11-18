import { haintTheme, ThemeProvider, ToastProvider, useBoneyardFonts } from "@boneyard/skeleton-ui";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

/**
 * Root layout: wires fonts, theme, and the root navigator. Thin on
 * purpose — once auth exists for this app it'll grow a RootNavigator
 * like Hallowear's, branching on auth state before rendering role stacks.
 */
export default function RootLayout() {
  const fontsLoaded = useBoneyardFonts();

  if (!fontsLoaded) {
    return (
      <View style={{ flex: 1, backgroundColor: haintTheme.palette.bg }}>
        <StatusBar style="light" />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <ThemeProvider theme={haintTheme}>
        <ToastProvider>
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: haintTheme.palette.bg },
            }}
          />
        </ToastProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
