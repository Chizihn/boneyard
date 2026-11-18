import { haintTheme, ThemeProvider, ToastProvider, useBoneyardFonts } from "@boneyard/skeleton-ui";
import { Redirect, Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AuthProvider, useAuth } from "~/lib/auth-context";

function RootNavigator() {
  const { user, loading } = useAuth();

  if (loading) {
    return <View style={{ flex: 1, backgroundColor: haintTheme.palette.bg }} />;
  }

  if (!user) {
    return (
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: haintTheme.palette.bg } }}>
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="index" />
      </Stack>
    );
  }

  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: haintTheme.palette.bg } }}>
      {user.role === "provider"
        ? <Stack.Screen name="(provider)" />
        : <Stack.Screen name="(requester)" />}
    </Stack>
  );
}

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
          <AuthProvider>
            <RootNavigator />
          </AuthProvider>
        </ToastProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
