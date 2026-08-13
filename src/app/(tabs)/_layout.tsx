import { Ionicons } from "@expo/vector-icons";
import { Tabs } from "expo-router";

const COLORS = {
  background: "#070C18",
  surface: "#111827",
  border: "#243047",
  active: "#52D6FF",
  inactive: "#718096",
};

type IconName = React.ComponentProps<typeof Ionicons>["name"];

const icons: Record<string, { active: IconName; inactive: IconName }> = {
  index: { active: "home", inactive: "home-outline" },
  analytics: { active: "stats-chart", inactive: "stats-chart-outline" },
  history: { active: "time", inactive: "time-outline" },
};

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={({ route }) => ({
        headerShown: false,
        sceneStyle: { backgroundColor: COLORS.background },
        tabBarActiveTintColor: COLORS.active,
        tabBarInactiveTintColor: COLORS.inactive,
        tabBarHideOnKeyboard: true,
        tabBarStyle: {
          height: 70,
          paddingTop: 7,
          paddingBottom: 9,
          backgroundColor: COLORS.surface,
          borderTopWidth: 1,
          borderTopColor: COLORS.border,
          elevation: 0,
        },
        tabBarLabelStyle: { fontSize: 10, fontWeight: "700" },
        tabBarIcon: ({ focused, color, size }) => {
          const icon = icons[route.name] ?? icons.index;
          return (
            <Ionicons
              name={focused ? icon.active : icon.inactive}
              size={Math.min(size, 22)}
              color={color}
            />
          );
        },
      })}
    >
      <Tabs.Screen name="index" options={{ title: "Home" }} />
      <Tabs.Screen name="analytics" options={{ title: "Analytics" }} />
      <Tabs.Screen name="history" options={{ title: "History" }} />
    </Tabs>
  );
}
