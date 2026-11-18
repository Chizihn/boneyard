import { useTheme } from "@boneyard/skeleton-ui";
import { Stack } from "expo-router";

// The welcome screen lives at index.tsx specifically so it's guaranteed
// to be what renders when this group is entered without a sub-path — no
// initialRouteName prop (removed in expo-router 58) or unstable_settings
// needed; an index route is just always the default.
export default function AuthLayout() {
  const theme = useTheme();
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: theme.palette.bg } }} />
  );
}
