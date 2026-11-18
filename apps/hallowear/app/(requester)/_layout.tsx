import { useTheme } from "@boneyard/skeleton-ui";
import { Stack } from "expo-router";

// (tabs) holds the tab-bar root screens (Browse, My Bookings); everything
// else here is a detail screen pushed on top, which naturally hides the
// tab bar instead of awkwardly keeping it visible under a detail view.
export default function RequesterLayout() {
  const theme = useTheme();
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: theme.palette.bg } }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="listing/[id]" />
      <Stack.Screen name="book/[id]" />
      <Stack.Screen name="bookings/[id]" />
      <Stack.Screen name="settings" />
    </Stack>
  );
}
