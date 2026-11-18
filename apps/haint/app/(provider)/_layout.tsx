import { Stack } from "expo-router";
import { haintTheme } from "@boneyard/skeleton-ui";

export default function ProviderLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: haintTheme.palette.bg },
      }}
    >
      <Stack.Screen name="index" />
      <Stack.Screen name="add-slot" />
      <Stack.Screen name="slots/[id]/edit" />
      <Stack.Screen name="requests/index" />
      <Stack.Screen name="checkin" />
    </Stack>
  );
}
