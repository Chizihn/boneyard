import { Stack } from "expo-router";
import { haintTheme } from "@boneyard/skeleton-ui";

export default function AuthLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: haintTheme.palette.bg },
      }}
    />
  );
}
