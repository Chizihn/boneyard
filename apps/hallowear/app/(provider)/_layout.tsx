import { useTheme } from "@boneyard/skeleton-ui";
import { Stack } from "expo-router";

// (tabs) holds the tab-bar root screens (My Listings, Incoming Requests);
// everything else here is a detail screen pushed on top.
export default function ProviderLayout() {
  const theme = useTheme();
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: theme.palette.bg } }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="list-item" />
      <Stack.Screen name="listings/[id]/edit" />
      <Stack.Screen name="settings" />
    </Stack>
  );
}
