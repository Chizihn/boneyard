import { useTheme } from "@boneyard/skeleton-ui";
import { Ionicons } from "@expo/vector-icons";
import { Tabs } from "expo-router";
import { View, type ColorValue } from "react-native";

function TabIcon({
  name,
  color,
  focused,
  activeBg,
}: {
  name: keyof typeof Ionicons.glyphMap;
  color: ColorValue;
  focused: boolean;
  activeBg: string;
}) {
  return (
    <View
      style={{
        width: 40,
        height: 32,
        borderRadius: 999,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: focused ? activeBg : "transparent",
      }}
    >
      <Ionicons name={name} size={20} color={color as string} />
    </View>
  );
}

export default function RequesterTabsLayout() {
  const theme = useTheme();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.palette.onPrimary,
        tabBarInactiveTintColor: "rgba(255,255,255,0.45)",
        tabBarShowLabel: false,
        tabBarItemStyle: { height: 48 },
        tabBarStyle: {
          position: "absolute",
          left: theme.spacing.xl,
          right: theme.spacing.xl,
          bottom: theme.spacing.lg,
          height: 64,
          borderRadius: theme.radius.pill,
          backgroundColor: theme.palette.text,
          borderTopWidth: 0,
          paddingHorizontal: theme.spacing.md,
          shadowColor: "#000",
          shadowOpacity: 0.18,
          shadowRadius: 16,
          shadowOffset: { width: 0, height: 8 },
          elevation: 8,
        },
        sceneStyle: { backgroundColor: theme.palette.bg },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          tabBarIcon: ({ color, focused }) => (
            <TabIcon name="compass" color={color} focused={focused} activeBg={theme.palette.primary} />
          ),
        }}
      />
      <Tabs.Screen
        name="bookings/index"
        options={{
          tabBarIcon: ({ color, focused }) => (
            <TabIcon name="ticket" color={color} focused={focused} activeBg={theme.palette.primary} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          tabBarIcon: ({ color, focused }) => (
            <TabIcon name="person" color={color} focused={focused} activeBg={theme.palette.primary} />
          ),
        }}
      />
    </Tabs>
  );
}
