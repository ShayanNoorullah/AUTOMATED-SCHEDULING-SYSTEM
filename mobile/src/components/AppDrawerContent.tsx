import { Pressable, Text, View } from "react-native";
import { DrawerContentScrollView, DrawerContentComponentProps } from "@react-navigation/drawer";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router, usePathname } from "expo-router";
import { AppLogo } from "./AppLogo";
import { clearTokens } from "../store/auth";
import { clearServerUrl } from "../store/server";
import { useData } from "../context/DataContext";
import { usePreferences, resolveNavIcon } from "../context/PreferencesContext";
import { useTheme } from "../context/ThemeContext";
import { NAV_ITEMS } from "../lib/navItems";
import { colors, pressedOpacity, spacing, styles } from "../theme";

export function AppDrawerContent(props: DrawerContentComponentProps) {
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const { settings } = useData();
  const { prefs } = usePreferences();
  useTheme();

  const siteName = settings?.siteName || "SSIES Schedule";
  const densityPad = prefs.uiDensity === "compact" ? 8 : prefs.uiDensity === "spacious" ? 14 : 10;

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
    <DrawerContentScrollView
      {...props}
      contentContainerStyle={{ flex: 1, paddingTop: insets.top + spacing.sm }}
    >
      <View
        style={{
          paddingHorizontal: spacing.lg,
          paddingBottom: spacing.sm,
          flexDirection: "row",
          alignItems: "center",
          gap: 10,
        }}
      >
        <AppLogo size={36} iconSize={20} />
        <Text style={[styles.listTitle, { flex: 1 }]} numberOfLines={1}>
          {siteName}
        </Text>
      </View>

      <View style={{ paddingHorizontal: spacing.sm }}>
        {NAV_ITEMS.map((item) => {
          const active = isActive(item.href);
          const iconName = resolveNavIcon(item.icon, prefs.navIconStyle);
          return (
            <Pressable
              key={item.href}
              style={({ pressed }) => [
                {
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 10,
                  paddingVertical: densityPad,
                  paddingHorizontal: spacing.md,
                  borderRadius: 10,
                  backgroundColor: active ? colors.accentSoft : "transparent",
                },
                pressed && { opacity: pressedOpacity },
              ]}
              onPress={() => router.push(item.href as never)}
            >
              <Ionicons name={iconName} size={18} color={active ? colors.accent : colors.muted} />
              <Text
                style={{
                  fontSize: 14,
                  fontWeight: active ? "700" : "500",
                  color: active ? colors.accent : colors.text,
                  flex: 1,
                }}
                numberOfLines={1}
              >
                {item.shortLabel}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <View style={{ marginTop: "auto", padding: spacing.md, gap: spacing.sm }}>
        <Pressable onPress={changeServer} hitSlop={8}>
          <Text style={[styles.btnSoftText, { color: colors.accent, textAlign: "center" }]}>Change server URL</Text>
        </Pressable>
        <Pressable onPress={logout} hitSlop={8}>
          <Text style={[styles.btnSoftText, { color: colors.error, textAlign: "center" }]}>Sign out</Text>
        </Pressable>
      </View>
    </DrawerContentScrollView>
  );
}
