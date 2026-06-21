import { GestureHandlerRootView } from "react-native-gesture-handler";
import { Drawer } from "expo-router/drawer";
import { AppDrawerContent } from "../../src/components/AppDrawerContent";
import { colors } from "../../src/theme";

export default function DrawerLayout() {
  return (
    <Drawer
        drawerContent={(props) => <AppDrawerContent {...props} />}
        screenOptions={{
          headerShown: true,
          headerTintColor: colors.accent,
          headerStyle: { backgroundColor: colors.surface },
          drawerStyle: { width: 280 },
          drawerType: "front",
        }}
      >
        <Drawer.Screen name="groups" options={{ title: "Groups", drawerLabel: "Groups" }} />
        <Drawer.Screen name="schedule" options={{ title: "Schedule", drawerLabel: "Schedule" }} />
        <Drawer.Screen name="open-wa" options={{ title: "Open in WhatsApp", drawerLabel: "Open WA" }} />
        <Drawer.Screen name="send" options={{ title: "Automated Send", drawerLabel: "Send" }} />
        <Drawer.Screen name="templates" options={{ title: "Templates", drawerLabel: "Templates" }} />
        <Drawer.Screen name="contacts" options={{ title: "Contacts", drawerLabel: "Contacts" }} />
        <Drawer.Screen name="settings" options={{ title: "Settings", drawerLabel: "Settings" }} />
        <Drawer.Screen name="profile" options={{ title: "Profile", drawerLabel: "Profile" }} />
      </Drawer>
  );
}
