import { Stack } from "expo-router";
import { haintTheme } from "@boneyard/skeleton-ui";

export default function RequesterLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: haintTheme.palette.bg },
      }}
    >
      <Stack.Screen name="index" />
      <Stack.Screen name="attraction/[id]" />
      <Stack.Screen name="book/[id]" />
      <Stack.Screen name="bookings/index" />
      <Stack.Screen name="bookings/[id]" />
    </Stack>
  );
}
