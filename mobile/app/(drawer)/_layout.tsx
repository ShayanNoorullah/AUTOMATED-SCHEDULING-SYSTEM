import { Drawer } from "expo-router/drawer";
import { useWindowDimensions } from "react-native";
import { AppDrawerContent } from "../../src/components/AppDrawerContent";
import { useTheme } from "../../src/context/ThemeContext";
import { colors } from "../../src/theme";

export default function DrawerLayout() {
  useTheme();
  const { width } = useWindowDimensions();
  const drawerWidth = Math.min(width * 0.82, 300);

  return (
    <Drawer
      drawerContent={(props) => <AppDrawerContent {...props} />}
      screenOptions={{
        headerShown: true,
        headerTintColor: colors.accent,
        headerStyle: { backgroundColor: colors.surface },
        headerTitleStyle: { color: colors.text },
        drawerStyle: { width: drawerWidth, backgroundColor: colors.surface },
        drawerActiveTintColor: colors.accent,
        drawerInactiveTintColor: colors.muted,
        drawerType: "front",
      }}
    >
      <Drawer.Screen name="groups" options={{ title: "Groups", drawerLabel: "Groups" }} />
      <Drawer.Screen name="schedule" options={{ title: "Schedule Table", drawerLabel: "Schedule" }} />
      <Drawer.Screen name="open-wa" options={{ title: "Open in WhatsApp", drawerLabel: "Open WA" }} />
      <Drawer.Screen name="send" options={{ title: "Automated Send", drawerLabel: "Send" }} />
      <Drawer.Screen name="templates" options={{ title: "Templates", drawerLabel: "Templates" }} />
      <Drawer.Screen name="contacts" options={{ title: "Contacts", drawerLabel: "Contacts" }} />
      <Drawer.Screen name="settings" options={{ title: "Settings", drawerLabel: "Settings" }} />
      <Drawer.Screen name="profile" options={{ title: "Profile", drawerLabel: "Profile" }} />
    </Drawer>
  );
}
