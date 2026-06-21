import { Pressable, Text, View } from "react-native";
import { DrawerContentScrollView, DrawerContentComponentProps } from "@react-navigation/drawer";
import { Ionicons } from "@expo/vector-icons";
import { router, usePathname } from "expo-router";
import { AppLogo } from "./AppLogo";
import { clearTokens } from "../store/auth";
import { clearServerUrl } from "../store/server";
import { useData } from "../context/DataContext";
import { NAV_ITEMS } from "../lib/navItems";
import { colors, pressedOpacity, styles } from "../theme";

export function AppDrawerContent(props: DrawerContentComponentProps) {
  const pathname = usePathname();
  const { settings } = useData();
  const siteName = settings?.siteName || "SSIES Schedule";

  async function logout() {
    await clearTokens();
    router.replace("/(auth)/login");
  }

  async function changeServer() {
    await clearTokens();
    await clearServerUrl();
    router.replace("/(auth)/server-setup");
  }

  function isActive(href: string) {
    const segment = href.split("/").pop();
    return pathname.includes(segment || "");
  }

  return (
    <DrawerContentScrollView {...props} contentContainerStyle={{ flex: 1, paddingTop: 8 }}>
      <View style={{ paddingHorizontal: 16, paddingBottom: 16, flexDirection: "row", alignItems: "center", gap: 12 }}>
        <AppLogo />
        <View style={{ flex: 1 }}>
          <Text style={styles.listTitle} numberOfLines={1}>
            {siteName}
          </Text>
          <Text style={styles.hint}>Schedule Sender</Text>
        </View>
      </View>

      <View style={{ paddingHorizontal: 8 }}>
        {NAV_ITEMS.map((item) => {
          const active = isActive(item.href);
          return (
            <Pressable
              key={item.href}
              style={({ pressed }) => [
                {
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 12,
                  paddingVertical: 12,
                  paddingHorizontal: 12,
                  borderRadius: 10,
                  marginBottom: 2,
                  backgroundColor: active ? colors.accentSoft : "transparent",
                },
                pressed && { opacity: pressedOpacity },
              ]}
              onPress={() => router.push(item.href as never)}
            >
              <Ionicons name={item.icon} size={20} color={active ? colors.accent : colors.muted} />
              <Text style={{ fontSize: 14, fontWeight: active ? "700" : "500", color: active ? colors.accent : colors.text }}>
                {item.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <View style={{ marginTop: "auto", padding: 16, gap: 8 }}>
        <Pressable style={styles.btnSoft} onPress={changeServer}>
          <Text style={styles.btnSoftText}>Change server URL</Text>
        </Pressable>
        <Pressable style={styles.btnSoft} onPress={logout}>
          <Text style={[styles.btnSoftText, { color: colors.error }]}>Sign out</Text>
        </Pressable>
      </View>
    </DrawerContentScrollView>
  );
}
