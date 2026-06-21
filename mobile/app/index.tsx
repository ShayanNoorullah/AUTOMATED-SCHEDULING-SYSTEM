import { useEffect, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { Redirect } from "expo-router";
import { getAccessToken } from "../src/store/auth";
import { getServerUrl } from "../src/store/server";
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
      setRoute(token ? "/(drawer)/groups" : "/(auth)/login");
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
