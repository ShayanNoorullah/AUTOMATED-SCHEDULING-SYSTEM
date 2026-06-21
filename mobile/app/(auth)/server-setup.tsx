import { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { router } from "expo-router";
import Constants from "expo-constants";
import { AppLogo } from "../../src/components/AppLogo";
import { fetchMobileConfig, setServerUrl, testServerHealth } from "../../src/store/server";
import { colors, styles } from "../../src/theme";

export default function ServerSetupScreen() {
  const [url, setUrl] = useState("http://192.168.1.14:5000");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSave() {
    setError("");
    setLoading(true);
    try {
      const trimmed = url.trim().replace(/\/+$/, "");
      if (!trimmed.startsWith("http")) {
        setError("URL must start with http:// or https://");
        return;
      }
      const health = await testServerHealth(trimmed);
      if (!health.ok) {
        setError(health.error || "Cannot reach server");
        return;
      }
      await setServerUrl(trimmed);
      const remote = await fetchMobileConfig(trimmed);
      const envUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || Constants.expoConfig?.extra?.supabaseUrl;
      const envKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || Constants.expoConfig?.extra?.supabaseAnonKey;
      const hasRemote = Boolean(remote?.supabaseUrl && remote?.supabaseAnonKey);
      const hasEnv = Boolean(envUrl && envKey);
      if (!hasRemote && !hasEnv) {
        setError(
          remote === null
            ? "Server OK but could not load /api/mobile/config (check server is updated and restarted)."
            : "Server OK but Supabase keys missing. Set SUPABASE_URL and SUPABASE_ANON_KEY in run.local.bat, then restart run.bat."
        );
        return;
      }
      router.replace("/(auth)/login");
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={[styles.content, { paddingTop: 48 }]}>
        <View style={{ alignItems: "center", marginBottom: 24 }}>
          <AppLogo size={56} iconSize={32} />
          <Text style={[styles.title, { marginTop: 12, fontSize: 22, textAlign: "center" }]}>
            Connect to SSIES server
          </Text>
        </View>
        <Text style={styles.subtitle}>
          Enter your PC server address. Use your LAN IP on the same Wi‑Fi (e.g. http://192.168.1.14:5000) or a
          Cloudflare Tunnel URL when away from home.
        </Text>
        <Text style={styles.label}>Server URL</Text>
        <TextInput
          style={styles.input}
          value={url}
          onChangeText={setUrl}
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="http://192.168.1.14:5000"
          placeholderTextColor={colors.muted}
          keyboardType="url"
        />
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Pressable style={styles.btn} onPress={onSave} disabled={loading}>
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Test and continue</Text>}
        </Pressable>
        <Text style={[styles.hint, { marginTop: 16 }]}>
          Make sure run.bat is running on your PC and Windows Firewall allows port 5000.
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
