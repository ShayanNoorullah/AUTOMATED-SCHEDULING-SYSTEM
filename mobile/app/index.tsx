import { useEffect, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { Redirect } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getAccessToken } from "../src/store/auth";
import { getServerUrl } from "../src/store/server";
import { DEFAULT_PAGE_ROUTES, DEFAULT_PREFERENCES } from "../src/context/PreferencesContext";
import { colors } from "../src/theme";

export default function Index() {
  const [route, setRoute] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const server = await getServerUrl();
      if (!server) {
        setRoute("/(auth)/server-setup");
        return;
      }
      const token = await getAccessToken();
      if (!token) {
        setRoute("/(auth)/login");
        return;
      }
      let defaultPage = DEFAULT_PREFERENCES.defaultPage;
      try {
        const raw = await AsyncStorage.getItem("ssies_prefs");
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed.defaultPage) defaultPage = parsed.defaultPage;
        }
      } catch {
        /* ignore */
      }
      setRoute(DEFAULT_PAGE_ROUTES[defaultPage as keyof typeof DEFAULT_PAGE_ROUTES] || "/(drawer)/groups");
    })();
  }, []);

  if (!route) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: colors.bg }}>
        <ActivityIndicator color={colors.accent} size="large" />
      </View>
    );
  }

  return <Redirect href={route as never} />;
}
