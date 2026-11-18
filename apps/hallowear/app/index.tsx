import { Redirect } from "expo-router";

// Root index — RootNavigator in _layout.tsx handles role-based routing once
// auth state resolves. This redirect covers the case where Expo Router lands
// on "/" before the navigator has pushed a group route.
export default function Index() {
  return <Redirect href="/(auth)" />;
}
